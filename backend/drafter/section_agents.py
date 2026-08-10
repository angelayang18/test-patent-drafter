"""Per-section patent drafting agents with isolated prompts and parallel execution."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from drafter.drafting_guidance import (
    combine_guidance_blocks,
    format_org_drafting_guidance,
    format_prior_draft_context,
)
from exporter.text_format import sanitize_section_output, validate_section_output
from learning.config import is_section_reflection_enabled
from learning.guidelines import retrieve_drafting_context
from learning.prompts import SECTION_CRITIQUE_SYSTEM, build_section_critique_user_prompt

from .document_types import (
    get_patent_section_description,
    get_patent_section_query_fields,
)
from .llm_client import generate_text
from .patent_template import (
    PROVISIONAL_FILING_OVERVIEW,
    get_section_template_instructions,
)
from .prompts import PATENT_SECTIONS, _format_invention_context, get_prompt
from .retrieval import citations_from_excerpts, format_excerpts_block, retrieve_relevant_excerpts
from .review_field_sources import (
    PATENT_REVIEW_FIELD_LABELS,
    append_review_fields_to_combined_text,
)
from .source_chunks import parse_source_chunks

_SECTION_LABELS = {
    "field": "Field of the Invention",
    "background": "Background of the Invention",
    "summary": "Summary of the Invention",
    "description": "Detailed Description of Embodiments",
    "claims": "Informal Patent Claims",
    "abstract": "Abstract",
}

_AGENT_CONVENTIONS = (
    "Use formal US provisional patent language: 'comprising', 'wherein', 'configured to', "
    "'in one embodiment', 'in another embodiment'. "
    "When the invention details actually describe an AI/ML invention, be highly specific "
    "(transformers, embeddings, RAG, tokenization, etc.); do not default to AI/ML themes "
    "when the details do not support them. "
    "Ground every claim in the invention details provided. If the invention details are "
    "largely missing, marked 'N/A', or too sparse to describe a real technical solution, "
    "say so plainly in the section text (e.g., state that the source material does not "
    "provide sufficient detail to draft this section) rather than inventing a "
    "plausible-sounding generic description. "
    "Avoid vague business language. "
    "Do not use internal document delimiter markers (%%qa, %%Header 1%%, etc.) or "
    "template placeholders in braces ({item_1_desc}); write complete patent prose. "
    "Output ONLY the body text for your assigned section — no headings, meta-commentary, or other sections."
)

_MAX_REFLECTION_ATTEMPTS = 2

_DEFAULT_CUSTOM_DESCRIPTION = (
    "Draft this section using the invention details and any provided source material. "
    "Use your judgment on appropriate content and structure for a section with this name "
    "in a patent application."
)


def _resolve_custom_meta(
    custom_sections: dict[str, dict[str, str]] | None,
    section: str,
) -> tuple[str, str] | None:
    """Return (name, description) for a custom section id, or None if not registered."""
    if not custom_sections or section not in custom_sections:
        return None
    meta = custom_sections.get(section) or {}
    name = str(meta.get("name") or "").strip() or section.replace("_", " ").title()
    description = str(meta.get("description") or "").strip()
    return name, description


def get_custom_section_agent_system(name: str, description: str) -> str:
    """System prompt for a user-defined section not in the canonical PATENT_SECTIONS list."""
    instructions = description.strip() or _DEFAULT_CUSTOM_DESCRIPTION
    base = (
        f'You are a dedicated patent drafting agent assigned ONLY to draft the "{name}" '
        f"section of a US provisional patent application, a section the user has added beyond "
        f"the standard set.\n\n"
        f"{PROVISIONAL_FILING_OVERVIEW}\n\n"
        f"SECTION INSTRUCTIONS: {instructions}\n\n"
        f"{_AGENT_CONVENTIONS}\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent "
        "content from other sections unless it appears in the invention details provided in "
        "the user message."
    )
    return base


def get_section_agent_system(section: str) -> str:
    """System prompt for a single-section agent (no other section text in context)."""
    label = _SECTION_LABELS.get(section, section)
    template_slot = get_section_template_instructions(section)
    base = (
        f"You are a dedicated patent drafting agent assigned ONLY to draft the "
        f'"{label}" section of a US provisional patent application.\n\n'
        f"{PROVISIONAL_FILING_OVERVIEW}\n\n"
        f"{template_slot}\n\n"
        f"{_AGENT_CONVENTIONS}\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent "
        "content from Field, Background, Summary, Detailed Description, Claims, or Abstract "
        "unless it appears in the invention details provided in the user message."
    )
    context = retrieve_drafting_context(section, "")
    if context.global_guidelines.strip() or context.section_guidelines.strip():
        return (
            f"{base}\n\n"
            "When org-wide drafting guidelines appear in the user message, follow them strictly."
        )
    return base


def _build_user_prompt(
    section: str,
    invention: dict,
    *,
    prior_draft: str = "",
    attorney_feedback: str = "",
    excerpts_block: str = "",
) -> str:
    """Assemble the full user prompt with org guidance and same-draft context."""
    base = get_prompt(section, invention)
    technical_field = str(invention.get("technical_field") or "")
    context = retrieve_drafting_context(section, technical_field)
    guidance = combine_guidance_blocks(
        format_org_drafting_guidance(section, context),
        format_prior_draft_context(prior_draft, attorney_feedback),
        excerpts_block,
    )
    return base + guidance


def _build_custom_user_prompt(
    name: str,
    description: str,
    invention: dict,
    *,
    prior_draft: str = "",
    attorney_feedback: str = "",
    excerpts_block: str = "",
) -> str:
    """User prompt for a custom section — bypasses get_prompt / _SECTION_DISPATCH."""
    instructions = description.strip() or _DEFAULT_CUSTOM_DESCRIPTION
    details = _format_invention_context(invention)
    prior_block = format_prior_draft_context(prior_draft, attorney_feedback)
    return (
        f'Draft the "{name}" section of a US provisional patent application.\n\n'
        f"{details}\n\n"
        f"Instructions:\n{instructions}"
        f"{prior_block}{excerpts_block}\n\n"
        f'Output ONLY the body text for the "{name}" section.'
    )


def _org_guidelines_text(section: str, invention: dict) -> str:
    """Combined org guidelines for critique prompts."""
    technical_field = str(invention.get("technical_field") or "")
    context = retrieve_drafting_context(section, technical_field)
    parts = []
    if context.global_guidelines.strip():
        parts.append(context.global_guidelines.strip())
    if context.section_guidelines.strip():
        parts.append(context.section_guidelines.strip())
    return "\n".join(parts)


def _reflect_and_revise(
    section: str,
    invention: dict,
    draft_text: str,
    system: str,
) -> str:
    """Run validation-driven revision passes against org guidelines."""
    if not is_section_reflection_enabled():
        return draft_text

    current = draft_text
    org_guidelines = _org_guidelines_text(section, invention)

    for attempt in range(_MAX_REFLECTION_ATTEMPTS):
        sanitized = sanitize_section_output(section, current)
        errors = validate_section_output(section, sanitized)
        if not errors:
            return sanitized
        if attempt >= _MAX_REFLECTION_ATTEMPTS - 1:
            return sanitized

        critique_prompt = build_section_critique_user_prompt(
            section,
            sanitized,
            errors,
            org_guidelines,
        )
        revised = generate_text(SECTION_CRITIQUE_SYSTEM, critique_prompt).strip()
        if revised:
            current = revised

    return sanitize_section_output(section, current)


def draft_section_agent(
    invention: dict,
    section_name: str,
    *,
    prior_draft: str = "",
    attorney_feedback: str = "",
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[str, list[dict]]:
    """Draft one section via its isolated agent with optional reflection.

    Returns ``(content, citations)``. When ``combined_text`` is empty and Review
    fields are empty/N/A, retrieval is skipped and citations is ``[]``.

    Custom (non-canonical) section ids are accepted when ``custom_sections``
    supplies ``name`` / ``description`` metadata for that id.
    """
    section = section_name.strip()
    custom_meta = _resolve_custom_meta(custom_sections, section)
    if section not in PATENT_SECTIONS and custom_meta is None:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {PATENT_SECTIONS}"
        )

    # Make Review-tab fields citable via the same chunk/citation pipeline as uploads.
    combined_text = append_review_fields_to_combined_text(
        combined_text, invention, PATENT_REVIEW_FIELD_LABELS
    )

    excerpts = []
    query_terms: set[str] = set()
    excerpts_block = ""
    if combined_text.strip():
        chunks = parse_source_chunks(combined_text)
        if chunks:
            if custom_meta is not None and section not in PATENT_SECTIONS:
                _, description = custom_meta
                excerpts, query_terms = retrieve_relevant_excerpts(
                    description,
                    invention,
                    chunks,
                    [],
                )
            else:
                excerpts, query_terms = retrieve_relevant_excerpts(
                    get_patent_section_description(section),
                    invention,
                    chunks,
                    get_patent_section_query_fields(section),
                )
            excerpts_block = format_excerpts_block(excerpts)

    if custom_meta is not None and section not in PATENT_SECTIONS:
        name, description = custom_meta
        system = get_custom_section_agent_system(name, description)
        user_prompt = _build_custom_user_prompt(
            name,
            description,
            invention,
            prior_draft=prior_draft,
            attorney_feedback=attorney_feedback,
            excerpts_block=excerpts_block,
        )
    else:
        system = get_section_agent_system(section)
        user_prompt = _build_user_prompt(
            section,
            invention,
            prior_draft=prior_draft,
            attorney_feedback=attorney_feedback,
            excerpts_block=excerpts_block,
        )
    raw = generate_text(system, user_prompt)
    content = _reflect_and_revise(section, invention, raw, system)
    return content, citations_from_excerpts(excerpts, query_terms)


def draft_all_sections_parallel(
    invention: dict,
    section_names: Iterable[str] | None = None,
    *,
    attorney_feedback: dict[str, str] | None = None,
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """
    Run one agent per section concurrently.

    Each agent receives only invention details and its template slot — never other
    sections' drafted text — preventing context poisoning across sections.

    Returns ``(content_by_section, citations_by_section)``.
    """
    names = list(section_names) if section_names is not None else list(PATENT_SECTIONS)
    custom = custom_sections or {}
    invalid = [n for n in names if n not in PATENT_SECTIONS and n not in custom]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {PATENT_SECTIONS}"
        )
    if not names:
        return {}, {}

    feedback_map = attorney_feedback or {}
    results: dict[str, str] = {}
    citations_by_section: dict[str, list[dict]] = {}
    max_workers = min(len(names), 6)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                draft_section_agent,
                invention,
                name,
                prior_draft="",
                attorney_feedback=feedback_map.get(name, ""),
                combined_text=combined_text,
                custom_sections=custom,
            ): name
            for name in names
        }
        for future in as_completed(futures):
            section = futures[future]
            content, citations = future.result()
            results[section] = content
            citations_by_section[section] = citations
    return results, citations_by_section
