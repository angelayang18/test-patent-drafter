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

from .llm_client import generate_text
from .patent_template import (
    PROVISIONAL_FILING_OVERVIEW,
    get_section_template_instructions,
)
from .prompts import PATENT_SECTIONS, get_prompt

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
    "Be highly specific for AI/ML inventions (transformers, embeddings, RAG, tokenization, etc.). "
    "Avoid vague business language. "
    "Do not use internal document delimiter markers (%%qa, %%Header 1%%, etc.) or "
    "template placeholders in braces ({item_1_desc}); write complete patent prose. "
    "Output ONLY the body text for your assigned section — no headings, meta-commentary, or other sections."
)

_MAX_REFLECTION_ATTEMPTS = 2


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
) -> str:
    """Assemble the full user prompt with org guidance and same-draft context."""
    base = get_prompt(section, invention)
    technical_field = str(invention.get("technical_field") or "")
    context = retrieve_drafting_context(section, technical_field)
    guidance = combine_guidance_blocks(
        format_org_drafting_guidance(section, context),
        format_prior_draft_context(prior_draft, attorney_feedback),
    )
    return base + guidance


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
) -> str:
    """Draft one section via its isolated agent with optional reflection."""
    section = section_name.strip()
    if section not in PATENT_SECTIONS:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {PATENT_SECTIONS}"
        )
    system = get_section_agent_system(section)
    user_prompt = _build_user_prompt(
        section,
        invention,
        prior_draft=prior_draft,
        attorney_feedback=attorney_feedback,
    )
    raw = generate_text(system, user_prompt)
    return _reflect_and_revise(section, invention, raw, system)


def draft_all_sections_parallel(
    invention: dict,
    section_names: Iterable[str] | None = None,
    *,
    attorney_feedback: dict[str, str] | None = None,
) -> dict[str, str]:
    """
    Run one agent per section concurrently.

    Each agent receives only invention details and its template slot — never other
    sections' drafted text — preventing context poisoning across sections.
    """
    names = list(section_names) if section_names is not None else list(PATENT_SECTIONS)
    invalid = [n for n in names if n not in PATENT_SECTIONS]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {PATENT_SECTIONS}"
        )
    if not names:
        return {}

    feedback_map = attorney_feedback or {}
    results: dict[str, str] = {}
    max_workers = min(len(names), 6)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                draft_section_agent,
                invention,
                name,
                prior_draft="",
                attorney_feedback=feedback_map.get(name, ""),
            ): name
            for name in names
        }
        for future in as_completed(futures):
            section = futures[future]
            results[section] = future.result()
    return results
