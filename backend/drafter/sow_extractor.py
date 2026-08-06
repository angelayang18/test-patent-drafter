"""Extract statement-of-work details from raw source text using the configured LLM."""

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

EXTRACTABLE_SOW_FIELDS = frozenset(
    {
        "engagement_title",
        "client_name",
        "vendor_name",
        "purpose_and_background",
        "objectives",
        "scope_of_work",
        "deliverables",
        "timeline_and_effort",
        "responsibilities_and_inputs",
        "commercial_terms",
    }
)

_FIELD_LABELS = {
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

_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "engagement_title": (
        "engagement_title",
        "engagementTitle",
        "title",
        "project_title",
        "projectTitle",
    ),
    "client_name": (
        "client_name",
        "clientName",
        "client",
        "customer_name",
        "customerName",
        "customer",
    ),
    "vendor_name": (
        "vendor_name",
        "vendorName",
        "vendor",
        "provider_name",
        "providerName",
        "service_provider",
        "serviceProvider",
    ),
    "purpose_and_background": (
        "purpose_and_background",
        "purposeAndBackground",
        "purpose",
        "background",
        "introduction",
    ),
    "objectives": (
        "objectives",
        "goals",
        "engagement_objectives",
        "engagementObjectives",
    ),
    "scope_of_work": (
        "scope_of_work",
        "scopeOfWork",
        "scope",
        "work_scope",
        "workScope",
    ),
    "deliverables": (
        "deliverables",
        "outputs",
        "work_products",
        "workProducts",
    ),
    "timeline_and_effort": (
        "timeline_and_effort",
        "timelineAndEffort",
        "timeline",
        "schedule",
        "effort",
        "effort_estimate",
        "effortEstimate",
    ),
    "responsibilities_and_inputs": (
        "responsibilities_and_inputs",
        "responsibilitiesAndInputs",
        "responsibilities",
        "required_inputs",
        "requiredInputs",
        "roles_and_responsibilities",
        "rolesAndResponsibilities",
    ),
    "commercial_terms": (
        "commercial_terms",
        "commercialTerms",
        "fees",
        "pricing",
        "payment_terms",
        "paymentTerms",
    ),
}

EXTRACT_SOW_SYSTEM = (
    "You are a technical and commercial contracts expert. Your task is to analyze "
    "source documentation and extract structured details needed to draft a clear, "
    "unambiguous Statement of Work. Be precise, obligation-focused, and grounded in "
    "the source material — do not invent commercial terms or scope that is not present."
)

EXTRACT_SOW_USER = """\
Analyze the following source documentation and return a JSON object with exactly \
these keys and value types (all str):

- engagement_title: str (short working title for the SOW)
- client_name: str (the customer/client organization)
- vendor_name: str (the service provider organization)
- purpose_and_background: str (why the engagement is happening and the problem it solves)
- objectives: str (specific, quantifiable goals of the engagement)
- scope_of_work: str (tasks/workstreams covered and the technical approach)
- deliverables: str (what will be delivered, mapped to scope)
- timeline_and_effort: str (phases, estimated hours, and schedule if available)
- responsibilities_and_inputs: str (vendor vs customer ownership and required inputs)
- commercial_terms: str (fees, payment schedule, and separately billed items if present)

Source documentation:
{combined_text}
"""

EXTRACT_SOW_GROUP_IDENTITY_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- engagement_title: str
- client_name: str
- vendor_name: str
- purpose_and_background: str

Source documentation:
{combined_text}
"""

EXTRACT_SOW_GROUP_DELIVERY_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- objectives: str
- scope_of_work: str
- deliverables: str

Source documentation:
{combined_text}
"""

EXTRACT_SOW_GROUP_TERMS_USER = """\
Analyze the source documentation and return a JSON object with exactly these keys:

- timeline_and_effort: str
- responsibilities_and_inputs: str
- commercial_terms: str

Source documentation:
{combined_text}
"""

_GROUP_EXTRACTORS: list[tuple[str, str]] = [
    ("identity", EXTRACT_SOW_GROUP_IDENTITY_USER),
    ("delivery", EXTRACT_SOW_GROUP_DELIVERY_USER),
    ("terms", EXTRACT_SOW_GROUP_TERMS_USER),
]

_GROUP_QUERIES: dict[str, str] = {
    "identity": (
        "engagement title client vendor purpose background parties"
    ),
    "delivery": (
        "objectives scope of work deliverables services milestones"
    ),
    "terms": (
        "timeline effort schedule responsibilities inputs commercial terms "
        "payment fees"
    ),
}

_DEFAULT_EXTRACT_QUERY = (
    "statement of work engagement client vendor objectives scope "
    "deliverables timeline commercial terms"
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
        EXTRACT_SOW_SYSTEM, relevant_notes, irrelevant_notes
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
    """Ensure extraction output contains the expected SOW fields."""
    flattened = _flatten_extraction_payload(data)
    return {
        field: _as_str(_resolve_field(flattened, field))
        for field in EXTRACTABLE_SOW_FIELDS
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
                "SOW group extraction '%s' failed (attempt %d/2): %s",
                label,
                attempt + 1,
                exc,
            )
    log.error(
        "SOW group extraction '%s' gave up after retry: %s",
        label,
        last_exc,
    )
    return {}


def _gap_fill_empty_fields(
    system: str, combined_text: str, details: dict
) -> dict:
    """Re-extract empty SOW fields with field-focused retrieved context."""
    missing = empty_fields(details)
    if not missing:
        return apply_empty_field_fallback(details)
    log.info("Gap-filling empty SOW fields: %s", missing)
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
            log.warning("SOW gap-fill for field %s failed: %s", field, exc)
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
                    "Unexpected error collecting SOW group '%s' result: %s",
                    label,
                    exc,
                )
    return _gap_fill_empty_fields(
        system, combined_text, _normalize_extraction(merged)
    )


def _extract_single_pass(system: str, source: str) -> dict:
    parsed = generate_json(
        system,
        EXTRACT_SOW_USER.format(combined_text=source),
    )
    return _normalize_extraction(parsed)


def extract_sow_details(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Analyze combined source text and extract structured SOW details.

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


def extract_sow_field(
    combined_text: str,
    field: str,
    current: Optional[dict] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Re-extract a single SOW field from source text.

    Returns a one-key dict plus ``citations`` for that field, e.g.
    ``{"engagement_title": "...", "citations": {"engagement_title": [...]}}``.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")
    if field not in EXTRACTABLE_SOW_FIELDS:
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
