"""Append Review-tab field values into combined_text as citable source chunks.

Draft-time retrieval scans ``combined_text`` via ``parse_source_chunks``
(``--- label ---`` headers). Review fields arrive as structured request fields
alongside ``combined_text`` and are otherwise invisible to that pipeline.
Appending them here lets existing citation logic surface
``Your reviewed {Field Name}`` sources without a parallel citation path.
"""

from __future__ import annotations

from typing import Mapping

# Labels aligned with extractor / Review UI field names.
PATENT_REVIEW_FIELD_LABELS: dict[str, str] = {
    "invention_title": "Invention Title",
    "technical_field": "Technical Field",
    "problem_being_solved": "Technical Problem Being Solved",
    "core_technical_solution": "Technical Solution / Core Mechanism",
    "novel_mechanism": "What Makes It Novel",
    "alternative_embodiments": "Alternative Embodiments",
    "key_components": "Key Components",
}

GRANT_REVIEW_FIELD_LABELS: dict[str, str] = {
    "project_title": "Project Title",
    "problem_statement": "Problem Statement",
    "proposed_solution": "Proposed Solution",
    "innovation_and_impact": "Innovation and Impact",
    "target_population": "Target Population",
    "team_qualifications": "Team Qualifications",
    "budget_overview": "Budget Overview",
    "evaluation_plan": "Evaluation Plan",
}

SOW_REVIEW_FIELD_LABELS: dict[str, str] = {
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

ADA_REVIEW_FIELD_LABELS: dict[str, str] = {
    "study_title": "Study Title",
    "study_objective": "Study Objective",
    "assay_platform": "Assay Platform",
    "sample_matrix": "Sample Matrix",
    "cut_point_methodology": "Cut Point Methodology",
    "sensitivity_data": "Sensitivity Data",
    "specificity_data": "Specificity Data",
    "precision_data": "Precision Data",
    "stability_data": "Stability Data",
    "results_summary": "Results Summary",
}

_EMPTY_MARKERS = frozenset({"", "n/a", "none", "null", "unknown"})

# Align with retrieval.MIN_PARAGRAPH_CHARS. Shorter values are skipped rather than
# padded: repeating text to clear the length gate produced garbled citation excerpts
# (e.g. "AI AI AI …") that are not useful to cite anyway.
_MIN_REVIEW_FIELD_BODY_CHARS = 40


def review_field_source_label(field_label: str) -> str:
    """Return the chunk / citation label for a Review-tab field."""
    return f"Your reviewed {field_label.strip()}"


def _normalize_field_value(value: object) -> str:
    """Return trimmed field text, or '' when empty / placeholder."""
    if value is None:
        return ""
    if isinstance(value, list):
        parts = [str(item).strip() for item in value if str(item).strip()]
        text = "\n".join(parts)
    else:
        text = str(value).strip()
    if text.lower() in _EMPTY_MARKERS:
        return ""
    return text


def format_review_field_chunk(field_label: str, value: str) -> str:
    """Format one Review field as a labeled ``combined_text`` chunk.

    Chunk label carries the ``Your reviewed …`` attribution for the citation UI;
    body is the original field value only (no padding / repetition).
    """
    label = review_field_source_label(field_label)
    return f"--- {label} ---\n{value.strip()}"


def append_review_fields_to_combined_text(
    combined_text: str,
    details: Mapping[str, object] | None,
    field_labels: Mapping[str, str],
) -> str:
    """Append non-empty Review fields as distinct source chunks.

    Additive: existing uploaded/pasted chunks are preserved unchanged.
    Values shorter than ``_MIN_REVIEW_FIELD_BODY_CHARS`` are omitted so they
    never become low-quality or repetition-padded citation sources.
    """
    base = (combined_text or "").strip()
    if not details or not field_labels:
        return base

    parts: list[str] = []
    if base:
        parts.append(base)

    for field_key, field_label in field_labels.items():
        value = _normalize_field_value(details.get(field_key))
        if not value or len(value) < _MIN_REVIEW_FIELD_BODY_CHARS:
            continue
        parts.append(format_review_field_chunk(field_label, value))

    return "\n\n".join(parts)
