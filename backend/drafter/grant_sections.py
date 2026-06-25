"""Draft grant application sections via isolated per-section agents."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from .llm_client import generate_text

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
) -> str:
    """Assemble the user prompt for a grant section agent."""
    label = _SECTION_LABELS.get(section, section)
    details = _format_grant_details(grant)
    prior_block = ""
    if prior_draft.strip():
        prior_block = (
            f"\n\nPrior draft of this section (revise and improve; preserve accurate facts):\n"
            f"{prior_draft.strip()}"
        )

    return f"""\
Draft the "{label}" section of a grant application.

Project details extracted from source documentation:
{details}

Instructions:
{_section_instructions(section)}
{prior_block}

Output ONLY the body text for the "{label}" section.
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
) -> str:
    """Draft one grant section via its isolated agent."""
    section = section_name.strip()
    if section not in GRANT_SECTIONS:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {GRANT_SECTIONS}"
        )
    system = get_grant_section_agent_system(section)
    user_prompt = _build_user_prompt(section, grant, prior_draft=prior_draft)
    return generate_text(system, user_prompt).strip()


def draft_all_grant_sections_parallel(
    grant: dict,
    section_names: Iterable[str] | None = None,
) -> dict[str, str]:
    """Run one agent per grant section concurrently."""
    names = list(section_names) if section_names is not None else list(GRANT_SECTIONS)
    invalid = [n for n in names if n not in GRANT_SECTIONS]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {GRANT_SECTIONS}"
        )
    if not names:
        return {}

    results: dict[str, str] = {}
    max_workers = min(len(names), 7)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(draft_single_grant_section, grant, name): name
            for name in names
        }
        for future in as_completed(futures):
            section = futures[future]
            results[section] = future.result()
    return results
