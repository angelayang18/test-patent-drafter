"""Draft grant application sections via isolated per-section agents."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from .llm_client import generate_text
from .retrieval import citations_from_excerpts, format_excerpts_block, retrieve_relevant_excerpts
from .source_chunks import parse_source_chunks

GRANT_SECTIONS = [
    "executive_summary",
    "problem_statement",
    "project_description",
    "methodology",
    "evaluation",
    "budget_narrative",
    "organizational_capacity",
]

_SECTION_LABELS = {
    "executive_summary": "Executive Summary",
    "problem_statement": "Problem Statement",
    "project_description": "Project Description",
    "methodology": "Methodology",
    "evaluation": "Evaluation Plan",
    "budget_narrative": "Budget Narrative",
    "organizational_capacity": "Organizational Capacity",
}

_GRANT_DRAFTER_SYSTEM = (
    "You are an expert grant writer specializing in federal, foundation, and institutional "
    "funding applications. Draft clear, persuasive, evidence-based grant prose. "
    "Use professional grant language: measurable outcomes, logical flow, and specific details. "
    "Output plain text only — no markdown, headings, or meta-commentary."
)

_AGENT_CONVENTIONS = (
    "Write complete grant prose for your assigned section only. "
    "Do not include the section title in your output. "
    "Ground claims in the project details provided; do not invent unsupported statistics."
)

_DEFAULT_CUSTOM_DESCRIPTION = (
    "Draft this section using the project details and any provided source material. "
    "Use your judgment on appropriate content and structure for a section with this name "
    "in a grant application."
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


def get_custom_grant_section_agent_system(name: str, description: str) -> str:
    """System prompt for a user-defined section not in the canonical GRANT_SECTIONS list."""
    instructions = description.strip() or _DEFAULT_CUSTOM_DESCRIPTION
    return (
        f'You are a dedicated grant writing agent assigned ONLY to draft the "{name}" '
        f"section of a grant application, a section the user has added beyond the standard set.\n\n"
        f"{_GRANT_DRAFTER_SYSTEM}\n\n"
        f"SECTION INSTRUCTIONS: {instructions}\n\n"
        f"{_AGENT_CONVENTIONS}\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent "
        "content from other sections unless it appears in the project details provided in "
        "the user message."
    )


def _format_grant_details(grant: dict) -> str:
    """Format grant details dict as context block for prompts."""
    lines = []
    field_labels = {
        "project_title": "Project Title",
        "problem_statement": "Problem Statement",
        "proposed_solution": "Proposed Solution",
        "innovation_and_impact": "Innovation and Impact",
        "target_population": "Target Population",
        "team_qualifications": "Team Qualifications",
        "budget_overview": "Budget Overview",
        "evaluation_plan": "Evaluation Plan",
    }
    for key, label in field_labels.items():
        value = str(grant.get(key) or "").strip()
        if value:
            lines.append(f"{label}:\n{value}")
    return "\n\n".join(lines)


def _section_instructions(section: str) -> str:
    """Section-specific drafting instructions."""
    instructions = {
        "executive_summary": (
            "Draft a compelling executive summary (1–2 pages) that introduces the project, "
            "states the problem, summarizes the proposed solution, highlights innovation and "
            "expected impact, and notes the requesting organization's capacity."
        ),
        "problem_statement": (
            "Draft a problem statement that clearly articulates the need, cites relevant context "
            "or evidence where available in the source material, and explains why action is "
            "urgent and why this project is the right response."
        ),
        "project_description": (
            "Draft a detailed project description covering goals, activities, timeline, and "
            "deliverables. Explain how the proposed solution addresses the stated problem."
        ),
        "methodology": (
            "Draft the methodology section describing the approach, methods, tools, and "
            "implementation steps. Include how activities will be sequenced and staffed."
        ),
        "evaluation": (
            "Draft an evaluation plan with measurable outcomes, indicators, data collection "
            "methods, and how results will inform continuous improvement."
        ),
        "budget_narrative": (
            "Draft a budget narrative that explains major cost categories, personnel, "
            "equipment, and other direct costs. Align with the budget overview in the project details."
        ),
        "organizational_capacity": (
            "Draft an organizational capacity section describing team qualifications, relevant "
            "experience, partnerships, and infrastructure that support successful project delivery."
        ),
    }
    return instructions.get(section, f"Draft the {_SECTION_LABELS.get(section, section)} section.")


def _build_user_prompt(
    section: str,
    grant: dict,
    *,
    prior_draft: str = "",
    excerpts_block: str = "",
    label: str | None = None,
    instructions: str | None = None,
) -> str:
    """Assemble the user prompt for a grant section agent."""
    resolved_label = label or _SECTION_LABELS.get(section, section)
    resolved_instructions = instructions or _section_instructions(section)
    details = _format_grant_details(grant)
    prior_block = ""
    if prior_draft.strip():
        prior_block = (
            f"\n\nPrior draft of this section (revise and improve; preserve accurate facts):\n"
            f"{prior_draft.strip()}"
        )

    return f"""\
Draft the "{resolved_label}" section of a grant application.

Project details extracted from source documentation:
{details}

Instructions:
{resolved_instructions}
{prior_block}{excerpts_block}

Output ONLY the body text for the "{resolved_label}" section.
"""


def get_grant_section_agent_system(section: str) -> str:
    """System prompt for a single grant section agent."""
    label = _SECTION_LABELS.get(section, section)
    return (
        f"You are a dedicated grant writing agent assigned ONLY to draft the "
        f'"{label}" section of a grant application.\n\n'
        f"{_GRANT_DRAFTER_SYSTEM}\n\n"
        f"{_AGENT_CONVENTIONS}"
    )


def draft_single_grant_section(
    grant: dict,
    section_name: str,
    prior_draft: str = "",
    *,
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[str, list[dict]]:
    """Draft one grant section via its isolated agent.

    Returns ``(content, citations)``. When ``combined_text`` is empty, retrieval
    is skipped and citations is ``[]``.
    """
    section = section_name.strip()
    custom_meta = _resolve_custom_meta(custom_sections, section)
    if section not in GRANT_SECTIONS and custom_meta is None:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {GRANT_SECTIONS}"
        )

    excerpts = []
    query_terms: set[str] = set()
    excerpts_block = ""
    if combined_text.strip():
        from .document_types import (
            get_grant_section_description,
            get_grant_section_query_fields,
        )

        chunks = parse_source_chunks(combined_text)
        if chunks:
            if custom_meta is not None and section not in GRANT_SECTIONS:
                _, description = custom_meta
                excerpts, query_terms = retrieve_relevant_excerpts(
                    description,
                    grant,
                    chunks,
                    [],
                )
            else:
                excerpts, query_terms = retrieve_relevant_excerpts(
                    get_grant_section_description(section),
                    grant,
                    chunks,
                    get_grant_section_query_fields(section),
                )
            excerpts_block = format_excerpts_block(excerpts)

    if custom_meta is not None and section not in GRANT_SECTIONS:
        name, description = custom_meta
        system = get_custom_grant_section_agent_system(name, description)
        user_prompt = _build_user_prompt(
            section,
            grant,
            prior_draft=prior_draft,
            excerpts_block=excerpts_block,
            label=name,
            instructions=description.strip() or _DEFAULT_CUSTOM_DESCRIPTION,
        )
    else:
        system = get_grant_section_agent_system(section)
        user_prompt = _build_user_prompt(
            section,
            grant,
            prior_draft=prior_draft,
            excerpts_block=excerpts_block,
        )
    content = generate_text(system, user_prompt).strip()
    return content, citations_from_excerpts(excerpts, query_terms)


def draft_all_grant_sections_parallel(
    grant: dict,
    section_names: Iterable[str] | None = None,
    *,
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """Run one agent per grant section concurrently.

    Returns ``(content_by_section, citations_by_section)``.
    """
    names = list(section_names) if section_names is not None else list(GRANT_SECTIONS)
    custom = custom_sections or {}
    invalid = [n for n in names if n not in GRANT_SECTIONS and n not in custom]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {GRANT_SECTIONS}"
        )
    if not names:
        return {}, {}

    results: dict[str, str] = {}
    citations_by_section: dict[str, list[dict]] = {}
    max_workers = min(len(names), 7)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                draft_single_grant_section,
                grant,
                name,
                "",
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
