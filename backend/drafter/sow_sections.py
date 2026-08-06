"""Draft Statement of Work sections via isolated per-section agents."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from .drafting_guidance import format_prior_draft_context
from .llm_client import generate_text
from .retrieval import citations_from_excerpts, format_excerpts_block, retrieve_relevant_excerpts
from .source_chunks import parse_source_chunks

SOW_SECTIONS = [
    "purpose",
    "objectives",
    "scope_of_work",
    "deliverables",
    "development_areas_effort_schedule",
    "responsibilities_required_inputs",
    "technical_integration_approach",
    "acceptance_criteria",
    "assumptions_dependencies",
    "out_of_scope",
    "governance_change_control",
    "commercial_terms",
    "data_protection_confidentiality",
    "completion",
]

_SECTION_LABELS = {
    "purpose": "Purpose / Introduction & Background",
    "objectives": "Objectives",
    "scope_of_work": "Scope of Work",
    "deliverables": "Deliverables",
    "development_areas_effort_schedule": "Development Areas, Effort & Schedule",
    "responsibilities_required_inputs": "Responsibilities & Required Inputs",
    "technical_integration_approach": "Technical / Integration Approach",
    "acceptance_criteria": "Acceptance Criteria",
    "assumptions_dependencies": "Assumptions & Dependencies",
    "out_of_scope": "Out of Scope",
    "governance_change_control": "Governance & Change Control",
    "commercial_terms": "Commercial Terms",
    "data_protection_confidentiality": "Data Protection & Confidentiality",
    "completion": "Completion",
}

_SECTION_DESCRIPTIONS = {
    "purpose": "Why the engagement is happening and what problem it solves",
    "objectives": "The specific, quantifiable goals of the engagement",
    "scope_of_work": (
        "The tasks and workstreams covered, broken out by development area"
    ),
    "deliverables": "What will be delivered, mapped to each scope item",
    "development_areas_effort_schedule": (
        "Estimated hours and timing per development area"
    ),
    "responsibilities_required_inputs": (
        "What the service provider and customer each own, including "
        "required inputs from the customer"
    ),
    "technical_integration_approach": (
        "How the solution integrates with customer systems, data exchange "
        "method, and where AI assists vs. deterministic rules"
    ),
    "acceptance_criteria": (
        "Measurable criteria that define when the engagement is accepted"
    ),
    "assumptions_dependencies": (
        "What must be true for the schedule and scope to hold"
    ),
    "out_of_scope": "What is explicitly excluded, to prevent scope creep",
    "governance_change_control": (
        "Meeting cadence and how scope changes are requested and approved"
    ),
    "commercial_terms": "Fees, payment schedule, and what's billed separately",
    "data_protection_confidentiality": (
        "How each party's data is handled, retained, and protected"
    ),
    "completion": "The conditions that mark the engagement as complete",
}

_SOW_DRAFTER_SYSTEM = (
    "You are an expert technical and commercial contracts writer specializing in AI "
    "and software services Statements of Work. Draft clear, precise, unambiguous "
    "obligations — a SOW is what gets referenced when there is a dispute about what "
    "was promised. Use no marketing language. "
    "Output plain text only — no markdown, headings, or meta-commentary."
)

_AGENT_CONVENTIONS = (
    "Write complete SOW prose for your assigned section only. "
    "Do not include the section title in your output. "
    "Ground obligations in the engagement details provided; do not invent unsupported "
    "fees, dates, or scope. "
    "If the engagement details are largely missing, marked 'N/A', or too sparse to "
    "describe a real engagement, say so plainly in the section text (e.g., state that "
    "the source material does not provide sufficient detail to draft this section) "
    "rather than inventing placeholder values or generic filler. "
    "Do not use bracket placeholders like [Client Name] or [insert X] — write complete "
    "prose or state that the detail isn't available."
)

_DEFAULT_CUSTOM_DESCRIPTION = (
    "Draft this section using the engagement details and any provided source material. "
    "Use your judgment on appropriate content and structure for a section with this name "
    "in a Statement of Work."
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


def get_custom_sow_section_agent_system(name: str, description: str) -> str:
    """System prompt for a user-defined section not in the canonical SOW_SECTIONS list."""
    instructions = description.strip() or _DEFAULT_CUSTOM_DESCRIPTION
    return (
        f'You are a dedicated Statement of Work drafting agent assigned ONLY to draft the '
        f'"{name}" section of a SOW contract, a section the user has added beyond the '
        f"standard set.\n\n"
        f"{_SOW_DRAFTER_SYSTEM}\n\n"
        f"SECTION INSTRUCTIONS: {instructions}\n\n"
        f"{_AGENT_CONVENTIONS}\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent "
        "content from other sections unless it appears in the engagement details provided in "
        "the user message."
    )


def _format_sow_details(sow: dict) -> str:
    """Format SOW details dict as context block for prompts."""
    lines = []
    field_labels = {
        "engagement_title": "Engagement Title",
        "client_name": "Client Name",
        "vendor_name": "Vendor Name",
        "purpose_and_background": "Purpose and Background",
        "objectives": "Objectives",
        "scope_of_work": "Scope of Work",
        "deliverables": "Deliverables",
        "timeline_and_effort": "Timeline and Effort",
        "responsibilities_and_inputs": "Responsibilities and Inputs",
        "commercial_terms": "Commercial Terms",
    }
    for key, label in field_labels.items():
        value = str(sow.get(key) or "").strip()
        if value:
            lines.append(f"{label}:\n{value}")
    return "\n\n".join(lines)


def _section_instructions(section: str) -> str:
    """Section-specific drafting instructions."""
    instructions = {
        "purpose": (
            "State why the engagement is happening and the problem it solves, "
            "referencing the client and vendor by name where known. Ground the "
            "section in the extracted purpose and background."
        ),
        "objectives": (
            "List the specific, measurable goals this engagement is meant to achieve "
            "— outcomes, not activities. Each objective should be verifiable at "
            "completion."
        ),
        "scope_of_work": (
            "Describe the tasks and workstreams covered, organized by development "
            "area if the source material breaks it out that way. Be concrete about "
            "what work is included."
        ),
        "deliverables": (
            "Enumerate what will be delivered, each one traceable to a specific "
            "item in scope of work — a reader should be able to check off each "
            "deliverable against the scope."
        ),
        "development_areas_effort_schedule": (
            "Lay out estimated effort and timing per development area or phase. "
            "If the source does not specify hours or dates, describe the phasing "
            "structure without inventing numbers."
        ),
        "responsibilities_required_inputs": (
            "Split ownership clearly — what the vendor is responsible for versus "
            "what the customer must provide or decide, and by when those customer "
            "inputs are needed for the schedule to hold."
        ),
        "technical_integration_approach": (
            "Describe how the solution integrates with the customer's systems, the "
            "data exchange method, and where AI-assisted versus deterministic or "
            "rule-based processing applies."
        ),
        "acceptance_criteria": (
            "State the measurable criteria that define when the engagement or each "
            "deliverable is accepted, avoiding subjective language like "
            '"satisfactory."'
        ),
        "assumptions_dependencies": (
            "List what must hold true for the schedule and scope to remain valid — "
            "third-party access, data availability, staffing continuity, and prior "
            "deliverables landing on time."
        ),
        "out_of_scope": (
            "Explicitly state what is excluded, to prevent scope creep and set "
            "expectations for what would require a change order."
        ),
        "governance_change_control": (
            "Describe the meeting and check-in cadence and the process for "
            "requesting, evaluating, and approving scope changes."
        ),
        "commercial_terms": (
            "State fees, payment schedule, and anything billed separately, grounded "
            "in the extracted commercial terms. If the source has no pricing detail, "
            "describe the billing structure or cadence without inventing dollar amounts."
        ),
        "data_protection_confidentiality": (
            "Describe how each party's data is handled, retained, and protected "
            "during and after the engagement, and confidentiality obligations for "
            "both sides."
        ),
        "completion": (
            "State the conditions that mark the engagement as formally complete — "
            "typically final deliverable acceptance and any close-out documentation "
            "or handoff steps."
        ),
    }
    return instructions.get(section, f"Draft the {_SECTION_LABELS.get(section, section)} section.")


def _build_user_prompt(
    section: str,
    sow: dict,
    *,
    prior_draft: str = "",
    attorney_feedback: str = "",
    excerpts_block: str = "",
    label: str | None = None,
    instructions: str | None = None,
) -> str:
    """Assemble the user prompt for a SOW section agent."""
    resolved_label = label or _SECTION_LABELS.get(section, section)
    resolved_instructions = instructions or _section_instructions(section)
    details = _format_sow_details(sow)
    prior_block = format_prior_draft_context(
        prior_draft,
        attorney_feedback,
        feedback_label="Contract reviewer feedback",
    )

    return f"""\
Draft the "{resolved_label}" section of a Statement of Work.

Engagement details extracted from source documentation:
{details}

Instructions:
{resolved_instructions}
{prior_block}{excerpts_block}

Output ONLY the body text for the "{resolved_label}" section.
"""


def get_sow_section_agent_system(section: str) -> str:
    """System prompt for a single SOW section agent."""
    label = _SECTION_LABELS.get(section, section)
    return (
        f"You are a dedicated Statement of Work drafting agent assigned ONLY to draft the "
        f'"{label}" section of a SOW contract.\n\n'
        f"{_SOW_DRAFTER_SYSTEM}\n\n"
        f"{_AGENT_CONVENTIONS}"
    )


def draft_single_sow_section(
    sow: dict,
    section_name: str,
    prior_draft: str = "",
    *,
    attorney_feedback: str = "",
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[str, list[dict]]:
    """Draft one SOW section via its isolated agent.

    Returns ``(content, citations)``. When ``combined_text`` is empty, retrieval
    is skipped and citations is ``[]``.
    """
    section = section_name.strip()
    custom_meta = _resolve_custom_meta(custom_sections, section)
    if section not in SOW_SECTIONS and custom_meta is None:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {SOW_SECTIONS}"
        )

    excerpts = []
    query_terms: set[str] = set()
    excerpts_block = ""
    if combined_text.strip():
        from .document_types import (
            get_sow_section_description,
            get_sow_section_query_fields,
        )

        chunks = parse_source_chunks(combined_text)
        if chunks:
            if custom_meta is not None and section not in SOW_SECTIONS:
                _, description = custom_meta
                excerpts, query_terms = retrieve_relevant_excerpts(
                    description,
                    sow,
                    chunks,
                    [],
                )
            else:
                excerpts, query_terms = retrieve_relevant_excerpts(
                    get_sow_section_description(section),
                    sow,
                    chunks,
                    get_sow_section_query_fields(section),
                )
            excerpts_block = format_excerpts_block(excerpts)

    if custom_meta is not None and section not in SOW_SECTIONS:
        name, description = custom_meta
        system = get_custom_sow_section_agent_system(name, description)
        user_prompt = _build_user_prompt(
            section,
            sow,
            prior_draft=prior_draft,
            attorney_feedback=attorney_feedback,
            excerpts_block=excerpts_block,
            label=name,
            instructions=description.strip() or _DEFAULT_CUSTOM_DESCRIPTION,
        )
    else:
        system = get_sow_section_agent_system(section)
        user_prompt = _build_user_prompt(
            section,
            sow,
            prior_draft=prior_draft,
            attorney_feedback=attorney_feedback,
            excerpts_block=excerpts_block,
        )
    content = generate_text(system, user_prompt).strip()
    return content, citations_from_excerpts(excerpts, query_terms)


def draft_all_sow_sections_parallel(
    sow: dict,
    section_names: Iterable[str] | None = None,
    *,
    attorney_feedback: dict[str, str] | None = None,
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """Run one agent per SOW section concurrently.

    Returns ``(content_by_section, citations_by_section)``.
    """
    names = list(section_names) if section_names is not None else list(SOW_SECTIONS)
    custom = custom_sections or {}
    invalid = [n for n in names if n not in SOW_SECTIONS and n not in custom]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {SOW_SECTIONS}"
        )
    if not names:
        return {}, {}

    feedback_map = attorney_feedback or {}
    results: dict[str, str] = {}
    citations_by_section: dict[str, list[dict]] = {}
    max_workers = min(len(names), 14)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                draft_single_sow_section,
                sow,
                name,
                "",
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
