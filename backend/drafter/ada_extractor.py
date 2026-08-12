"""Extract ADA bioanalytical report details from raw source text using the configured LLM."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from .extractor import (
    _build_lookup,
    _flatten_extraction_payload,
)
from .extract_context import (
    apply_empty_field_fallback,
    build_extract_source,
    build_group_extract_sources,
    empty_fields,
)
from .llm_client import generate_json
from .relevance import extraction_system_prompt, format_relevance_guidance
from .retrieval import with_field_citations

log = logging.getLogger(__name__)

EXTRACTABLE_ADA_FIELDS = frozenset(
    {
        "study_title",
        "study_objective",
        "assay_platform",
        "sample_matrix",
        "cut_point_methodology",
        "sensitivity_data",
        "specificity_data",
        "precision_data",
        "stability_data",
        "results_summary",
    }
)

_FIELD_LABELS = {
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

_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "study_title": (
        "study_title",
        "studyTitle",
        "title",
        "report_title",
        "reportTitle",
    ),
    "study_objective": (
        "study_objective",
        "studyObjective",
        "objective",
        "purpose",
        "study_purpose",
        "studyPurpose",
    ),
    "assay_platform": (
        "assay_platform",
        "assayPlatform",
        "platform",
        "assay_format",
        "assayFormat",
        "method",
        "method_summary",
        "methodSummary",
    ),
    "sample_matrix": (
        "sample_matrix",
        "sampleMatrix",
        "matrix",
        "samples",
        "study_samples",
        "studySamples",
    ),
    "cut_point_methodology": (
        "cut_point_methodology",
        "cutPointMethodology",
        "cut_point",
        "cutPoint",
        "cut_points",
        "cutPoints",
        "screening_cut_point",
        "screeningCutPoint",
    ),
    "sensitivity_data": (
        "sensitivity_data",
        "sensitivityData",
        "sensitivity",
        "assay_sensitivity",
        "assaySensitivity",
    ),
    "specificity_data": (
        "specificity_data",
        "specificityData",
        "specificity",
        "selectivity",
        "drug_tolerance",
        "drugTolerance",
        "target_tolerance",
        "targetTolerance",
    ),
    "precision_data": (
        "precision_data",
        "precisionData",
        "precision",
        "reproducibility",
        "robustness",
        "inter_assay_precision",
        "interAssayPrecision",
    ),
    "stability_data": (
        "stability_data",
        "stabilityData",
        "stability",
        "sample_stability",
        "sampleStability",
        "freeze_thaw",
        "freezeThaw",
    ),
    "results_summary": (
        "results_summary",
        "resultsSummary",
        "results",
        "findings",
        "sample_analysis_results",
        "sampleAnalysisResults",
        "titer_results",
        "titerResults",
    ),
}

EXTRACT_ADA_SYSTEM = (
    "You are a bioanalytical and regulatory scientist specializing in anti-drug "
    "antibody (ADA) immunogenicity testing. Your task is to analyze source "
    "documentation and extract structured details needed to draft a formal ADA "
    "bioanalytical report. Be precise, quantitative where data is available, and "
    "do not invent cut points, concentrations, %CV values, or incidence rates that "
    "are not present in the source."
)

EXTRACT_ADA_USER = """\
Analyze the following source documentation and return a JSON object with exactly \
these keys and value types (all str):

- study_title: str (short working title for the ADA study or report)
- study_objective: str (what is being validated or reported, and why)
- assay_platform: str (assay format/platform, critical reagents, and equipment)
- sample_matrix: str (sample source, matrix, species, and handling)
- cut_point_methodology: str (pre-study and in-study screening/confirmatory cut point approach)
- sensitivity_data: str (lowest ADA concentration consistently detected above the cut point)
- specificity_data: str (drug tolerance, target tolerance, and matrix interference/selectivity)
- precision_data: str (inter/intra-assay precision and robustness findings)
- stability_data: str (freeze-thaw, bench-top, and long-term storage stability)
- results_summary: str (screening/confirmatory/titer results and overall findings)

Source documentation:
{combined_text}
"""

EXTRACT_ADA_GROUP_DESIGN_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- study_title: str
- study_objective: str
- assay_platform: str
- sample_matrix: str

Source documentation:
{combined_text}
"""

EXTRACT_ADA_GROUP_PERFORMANCE_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- cut_point_methodology: str
- sensitivity_data: str
- specificity_data: str

Source documentation:
{combined_text}
"""

EXTRACT_ADA_GROUP_OUTCOME_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- precision_data: str
- stability_data: str
- results_summary: str

Source documentation:
{combined_text}
"""

_GROUP_EXTRACTORS: list[tuple[str, str]] = [
    ("design", EXTRACT_ADA_GROUP_DESIGN_USER),
    ("performance", EXTRACT_ADA_GROUP_PERFORMANCE_USER),
    ("outcome", EXTRACT_ADA_GROUP_OUTCOME_USER),
]

_GROUP_QUERIES: dict[str, str] = {
    "design": (
        "study title objective assay platform sample matrix method design"
    ),
    "performance": (
        "cut point methodology sensitivity specificity screening confirmatory"
    ),
    "outcome": (
        "precision stability results summary validation acceptance criteria"
    ),
}

_DEFAULT_EXTRACT_QUERY = (
    "ADA assay study title objective platform matrix cut point "
    "sensitivity specificity precision stability results"
)


def _prepare_extract_documentation(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
    query_description: str = "",
) -> tuple[str, str]:
    """Build retrieve-then-extract source context and prepend relevance guidance."""
    body = build_extract_source(
        combined_text, query_description or _DEFAULT_EXTRACT_QUERY
    )
    guidance = format_relevance_guidance(relevant_notes, irrelevant_notes)
    system = extraction_system_prompt(
        EXTRACT_ADA_SYSTEM, relevant_notes, irrelevant_notes
    )
    if guidance:
        return system, f"{guidance}\n\n{body}"
    return system, body


def _resolve_field(data: dict, field: str) -> object:
    """Return the first matching value for a canonical extraction field."""
    lookup = _build_lookup(data)
    for alias in _FIELD_ALIASES.get(field, (field,)):
        if alias in lookup:
            return lookup[alias]
    return None


def _as_str(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_extraction(data: dict) -> dict:
    """Ensure extraction output contains the expected ADA fields."""
    flattened = _flatten_extraction_payload(data)
    return {
        field: _as_str(_resolve_field(flattened, field))
        for field in EXTRACTABLE_ADA_FIELDS
    }


def _run_group_pass(system: str, user_template: str, source: str) -> dict:
    parsed = generate_json(
        system,
        user_template.format(combined_text=source),
    )
    if not parsed:
        raise ValueError("Group extraction returned empty JSON object.")
    return parsed


def _run_group_pass_with_retry(
    system: str, user_template: str, source: str, label: str
) -> dict:
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            return _run_group_pass(system, user_template, source)
        except Exception as exc:
            last_exc = exc
            log.warning(
                "ADA group extraction '%s' failed (attempt %d/2): %s",
                label,
                attempt + 1,
                exc,
            )
    log.error(
        "ADA group extraction '%s' gave up after retry: %s",
        label,
        last_exc,
    )
    return {}


def _gap_fill_empty_fields(
    system: str, combined_text: str, details: dict
) -> dict:
    """Re-extract empty ADA fields with field-focused retrieved context."""
    missing = empty_fields(details)
    if not missing:
        return apply_empty_field_fallback(details)
    log.info("Gap-filling empty ADA fields: %s", missing)
    updated = dict(details)
    for field in missing:
        label = _FIELD_LABELS.get(field, field)
        source = build_extract_source(combined_text, label)
        field_system = system + f" Return JSON with exactly one key: {field!r} (str)."
        user = f"""\
Analyze the source documentation below and extract only the field "{label}" ({field}).

Return a JSON object with exactly one key "{field}".

Source documentation:
{source}
"""
        try:
            parsed = generate_json(field_system, user)
            if field not in parsed:
                continue
            piece = _normalize_extraction({field: parsed[field]})
            if piece.get(field):
                updated[field] = piece[field]
        except Exception as exc:
            log.warning("ADA gap-fill for field %s failed: %s", field, exc)
    return apply_empty_field_fallback(_normalize_extraction(updated))


def _extract_grouped(system: str, combined_text: str) -> dict:
    """Three parallel LLM calls, each with group-focused retrieved source context."""
    group_queries = [
        (label, _GROUP_QUERIES.get(label, _DEFAULT_EXTRACT_QUERY))
        for label, _ in _GROUP_EXTRACTORS
    ]
    sources = build_group_extract_sources(combined_text, group_queries)
    merged: dict = {}
    max_workers = min(len(_GROUP_EXTRACTORS), 3)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _run_group_pass_with_retry,
                system,
                template,
                sources.get(label, combined_text),
                label,
            ): label
            for label, template in _GROUP_EXTRACTORS
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                merged.update(future.result())
            except Exception as exc:
                log.exception(
                    "Unexpected error collecting ADA group '%s' result: %s",
                    label,
                    exc,
                )
    return _gap_fill_empty_fields(
        system, combined_text, _normalize_extraction(merged)
    )


def _extract_single_pass(system: str, source: str) -> dict:
    parsed = generate_json(
        system,
        EXTRACT_ADA_USER.format(combined_text=source),
    )
    return _normalize_extraction(parsed)


def extract_ada_details(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Analyze combined source text and extract structured ADA report details.

    Uses grouped parallel retrieve-then-extract by default (three LLM calls).
    Returns field values plus ``citations`` keyed by field name.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    system, _source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    details = _extract_grouped(system, combined_text)
    return with_field_citations(combined_text, details, _FIELD_LABELS)


def extract_ada_field(
    combined_text: str,
    field: str,
    current: Optional[dict] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Re-extract a single ADA field from source text.

    Returns a one-key dict plus ``citations`` for that field, e.g.
    ``{"study_title": "...", "citations": {"study_title": [...]}}``.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")
    if field not in EXTRACTABLE_ADA_FIELDS:
        raise ValueError(f"Unknown field: {field}")

    label = _FIELD_LABELS[field]
    system, source = _prepare_extract_documentation(
        combined_text,
        relevant_notes,
        irrelevant_notes,
        query_description=label,
    )
    context_block = ""
    if current:
        context_block = (
            "\n\nCurrent extracted values (for consistency; you may refine the target field):\n"
            + "\n".join(f"- {key}: {value}" for key, value in current.items() if value)
        )

    system = (
        system + f" Return JSON with exactly one key: {field!r} (str)."
    )
    user = f"""\
Analyze the source documentation below and extract only the field "{label}" ({field}).

Return a JSON object with exactly one key "{field}".

Source documentation:
{source}
{context_block}
"""

    parsed = generate_json(system, user)
    if field not in parsed:
        raise ValueError(f"Model response missing field {field!r}.")

    normalized = apply_empty_field_fallback(
        _normalize_extraction({field: parsed[field]})
    )
    return with_field_citations(
        combined_text,
        {field: normalized[field]},
        _FIELD_LABELS,
        fields=[field],
    )
