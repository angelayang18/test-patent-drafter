"""Extract statement-of-work details from raw source text using the configured LLM."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from .extractor import (
    _build_lookup,
    _flatten_extraction_payload,
)
from .llm_client import generate_json
from .relevance import extraction_system_prompt, format_relevance_guidance
from .source_text import prepare_source_text

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


def _prepare_extract_documentation(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> tuple[str, str]:
    """Truncate source text and prepend user relevance guidance."""
    body = prepare_source_text(combined_text)
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


def _extract_grouped(system: str, source: str) -> dict:
    """Three parallel LLM calls, each returning a subset of SOW fields."""
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
                    "Unexpected error collecting SOW group '%s' result: %s",
                    label,
                    exc,
                )
    return _normalize_extraction(merged)


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

    Uses grouped parallel extraction by default (three LLM calls).
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    system, source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    return _extract_grouped(system, source)


def extract_sow_field(
    combined_text: str,
    field: str,
    current: Optional[dict] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Re-extract a single SOW field from source text.

    Returns a one-key dict, e.g. ``{"engagement_title": "..."}``.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")
    if field not in EXTRACTABLE_SOW_FIELDS:
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
    return {field: normalized[field]}
