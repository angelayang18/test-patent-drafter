"""Extract grant application details from raw source text using the configured LLM."""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from .extractor import (
    _build_lookup,
    _flatten_extraction_payload,
)
from .llm_client import generate_json
from .relevance import extraction_system_prompt, format_relevance_guidance
from .retrieval import with_field_citations
from .source_text import prepare_source_text

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


def _prepare_extract_documentation(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> tuple[str, str]:
    """Truncate source text and prepend user relevance guidance."""
    body = prepare_source_text(combined_text)
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


def _extract_grouped(system: str, source: str) -> dict:
    """Three parallel LLM calls, each returning a subset of grant fields."""
    merged: dict = {}
    max_workers = min(len(_GROUP_EXTRACTORS), 3)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                _run_group_pass_with_retry, system, template, source, label
            ): label
            for label, template in _GROUP_EXTRACTORS
        }
        for future in as_completed(futures):
            label = futures[future]
            try:
                merged.update(future.result())
            except Exception as exc:
                log.exception(
                    "Unexpected error collecting grant group '%s' result: %s",
                    label,
                    exc,
                )
    return _normalize_extraction(merged)


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

    Uses grouped parallel extraction by default (three LLM calls).
    Returns field values plus ``citations`` keyed by field name.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    system, source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    details = _extract_grouped(system, source)
    return with_field_citations(combined_text, details, _FIELD_LABELS)


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

    system, source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    label = _FIELD_LABELS[field]
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

    normalized = _normalize_extraction({field: parsed[field]})
    return with_field_citations(
        combined_text,
        {field: normalized[field]},
        _FIELD_LABELS,
        fields=[field],
    )
