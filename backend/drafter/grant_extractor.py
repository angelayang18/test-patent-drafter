"""Extract grant application details from raw source text using the configured LLM."""

from __future__ import annotations

import logging
import re
import time
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

EXTRACTABLE_GRANT_FIELDS = frozenset(
    {
        "project_title",
        "problem_statement",
        "proposed_solution",
        "innovation_and_impact",
        "target_population",
        "team_qualifications",
        "budget_overview",
        "evaluation_plan",
    }
)

_FIELD_LABELS = {
    "project_title": "Project Title",
    "problem_statement": "Problem Statement",
    "proposed_solution": "Proposed Solution",
    "innovation_and_impact": "Innovation and Impact",
    "target_population": "Target Population",
    "team_qualifications": "Team Qualifications",
    "budget_overview": "Budget Overview",
    "evaluation_plan": "Evaluation Plan",
}

_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "project_title": ("project_title", "projectTitle", "title"),
    "problem_statement": (
        "problem_statement",
        "problemStatement",
        "problem",
        "need_statement",
        "needStatement",
    ),
    "proposed_solution": (
        "proposed_solution",
        "proposedSolution",
        "solution",
        "approach",
    ),
    "innovation_and_impact": (
        "innovation_and_impact",
        "innovationAndImpact",
        "innovation",
        "impact",
    ),
    "target_population": (
        "target_population",
        "targetPopulation",
        "beneficiaries",
        "audience",
    ),
    "team_qualifications": (
        "team_qualifications",
        "teamQualifications",
        "team",
        "organizational_capacity",
    ),
    "budget_overview": (
        "budget_overview",
        "budgetOverview",
        "budget",
        "funding",
    ),
    "evaluation_plan": (
        "evaluation_plan",
        "evaluationPlan",
        "evaluation",
        "metrics",
    ),
}

EXTRACT_GRANT_SYSTEM = (
    "You are a grant writing expert. Your task is to analyze source documentation "
    "and extract structured details needed to draft a competitive grant application. "
    "Be precise, evidence-based, and focused on outcomes, feasibility, and impact."
)

EXTRACT_GRANT_USER = """\
Analyze the following source documentation and return a JSON object with exactly \
these keys and value types (all str):

- project_title: str (concise working title for the grant project)
- problem_statement: str (the need or gap the project addresses)
- proposed_solution: str (what the project will do and how)
- innovation_and_impact: str (what is novel and the expected impact)
- target_population: str (who benefits and at what scale)
- team_qualifications: str (relevant expertise and organizational capacity)
- budget_overview: str (high-level budget categories and rationale if available)
- evaluation_plan: str (how success will be measured)

Source documentation:
{combined_text}
"""

EXTRACT_GRANT_GROUP_OVERVIEW_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- project_title: str
- problem_statement: str
- proposed_solution: str

Source documentation:
{combined_text}
"""

EXTRACT_GRANT_GROUP_IMPACT_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- innovation_and_impact: str
- target_population: str
- evaluation_plan: str

Source documentation:
{combined_text}
"""

EXTRACT_GRANT_GROUP_CAPACITY_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- team_qualifications: str
- budget_overview: str

Source documentation:
{combined_text}
"""

_GROUP_EXTRACTORS: list[tuple[str, str]] = [
    ("overview", EXTRACT_GRANT_GROUP_OVERVIEW_USER),
    ("impact", EXTRACT_GRANT_GROUP_IMPACT_USER),
    ("capacity", EXTRACT_GRANT_GROUP_CAPACITY_USER),
]

_GROUP_QUERIES: dict[str, str] = {
    "overview": (
        "project title problem statement proposed solution need gap approach"
    ),
    "impact": (
        "innovation impact target population beneficiaries evaluation plan "
        "metrics benchmarks outcomes success measured"
    ),
    "capacity": (
        "team qualifications organizational capacity budget overview funding"
    ),
}

_DEFAULT_EXTRACT_QUERY = (
    "grant project title problem solution innovation impact population "
    "team budget evaluation metrics"
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
        EXTRACT_GRANT_SYSTEM, relevant_notes, irrelevant_notes
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
    """Ensure extraction output contains the expected grant fields."""
    flattened = _flatten_extraction_payload(data)
    return {
        field: _as_str(_resolve_field(flattened, field))
        for field in EXTRACTABLE_GRANT_FIELDS
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
                "Grant group extraction '%s' failed (attempt %d/2): %s",
                label,
                attempt + 1,
                exc,
            )
    log.error(
        "Grant group extraction '%s' gave up after retry: %s",
        label,
        last_exc,
    )
    return {}


def _gap_fill_empty_fields(
    system: str, combined_text: str, details: dict
) -> dict:
    """Re-extract empty grant fields with field-focused retrieved context."""
    missing = empty_fields(details)
    if not missing:
        log.info("Grant gap-fill skipped — no empty fields")
        return apply_empty_field_fallback(details)
    log.info(
        "Gap-filling empty grant fields (%d): %s",
        len(missing),
        missing,
    )
    updated = dict(details)
    gap_started = time.monotonic()
    for index, field in enumerate(missing, start=1):
        label = _FIELD_LABELS.get(field, field)
        retrieve_started = time.monotonic()
        source = build_extract_source(combined_text, label)
        retrieve_s = time.monotonic() - retrieve_started
        field_system = system + f" Return JSON with exactly one key: {field!r} (str)."
        user = f"""\
Analyze the source documentation below and extract only the field "{label}" ({field}).

Return a JSON object with exactly one key "{field}".

Source documentation:
{source}
"""
        try:
            llm_started = time.monotonic()
            parsed = generate_json(field_system, user)
            llm_s = time.monotonic() - llm_started
            log.info(
                "Grant gap-fill field %d/%d '%s': retrieve=%.2fs llm=%.2fs "
                "running_total=%.2fs",
                index,
                len(missing),
                field,
                retrieve_s,
                llm_s,
                time.monotonic() - gap_started,
            )
            if field not in parsed:
                continue
            piece = _normalize_extraction({field: parsed[field]})
            if piece.get(field):
                updated[field] = piece[field]
        except Exception as exc:
            log.warning(
                "Grant gap-fill for field %s failed after retrieve=%.2fs: %s",
                field,
                retrieve_s,
                exc,
            )
    log.info(
        "Grant gap-fill finished %d fields in %.2fs",
        len(missing),
        time.monotonic() - gap_started,
    )
    return apply_empty_field_fallback(_normalize_extraction(updated))


def _timed_group_pass(
    system: str, user_template: str, source: str, label: str
) -> dict:
    """Run one group extraction pass and log its wall time."""
    started = time.monotonic()
    try:
        return _run_group_pass_with_retry(system, user_template, source, label)
    finally:
        log.info(
            "Grant group '%s' finished in %.2fs",
            label,
            time.monotonic() - started,
        )


def _extract_grouped(system: str, combined_text: str) -> dict:
    """Three parallel LLM calls, each with group-focused retrieved source context."""
    group_queries = [
        (label, _GROUP_QUERIES.get(label, _DEFAULT_EXTRACT_QUERY))
        for label, _ in _GROUP_EXTRACTORS
    ]
    retrieve_started = time.monotonic()
    sources = build_group_extract_sources(combined_text, group_queries)
    log.info(
        "Grant group source prep for %d groups took %.2fs",
        len(group_queries),
        time.monotonic() - retrieve_started,
    )
    merged: dict = {}
    max_workers = min(len(_GROUP_EXTRACTORS), 3)
    log.info(
        "Grant grouped extraction starting %d parallel group calls",
        len(_GROUP_EXTRACTORS),
    )
    groups_started = time.monotonic()
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _timed_group_pass,
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
                log.info(
                    "Grant group '%s' collected (wall since pool start=%.2fs)",
                    label,
                    time.monotonic() - groups_started,
                )
            except Exception as exc:
                log.exception(
                    "Unexpected error collecting grant group '%s' result: %s",
                    label,
                    exc,
                )
    log.info(
        "Grant grouped extraction parallel phase finished in %.2fs",
        time.monotonic() - groups_started,
    )
    return _gap_fill_empty_fields(
        system, combined_text, _normalize_extraction(merged)
    )


def _extract_single_pass(system: str, source: str) -> dict:
    parsed = generate_json(
        system,
        EXTRACT_GRANT_USER.format(combined_text=source),
    )
    return _normalize_extraction(parsed)


def extract_grant_details(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Analyze combined source text and extract structured grant application details.

    Uses grouped parallel retrieve-then-extract by default (three LLM calls).
    Returns field values plus ``citations`` keyed by field name.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    started = time.monotonic()
    log.info(
        "extract_grant_details start (source_chars=%d)",
        len(combined_text),
    )
    system, _source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    details = _extract_grouped(system, combined_text)
    cite_started = time.monotonic()
    result = with_field_citations(combined_text, details, _FIELD_LABELS)
    log.info(
        "extract_grant_details citations took %.2fs; total=%.2fs",
        time.monotonic() - cite_started,
        time.monotonic() - started,
    )
    return result


def extract_grant_field(
    combined_text: str,
    field: str,
    current: Optional[dict] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Re-extract a single grant field from source text.

    Returns a one-key dict plus ``citations`` for that field, e.g.
    ``{"project_title": "...", "citations": {"project_title": [...]}}``.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")
    if field not in EXTRACTABLE_GRANT_FIELDS:
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
