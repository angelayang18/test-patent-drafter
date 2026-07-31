"""Extract invention details from raw text using the configured LLM."""

from __future__ import annotations

import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

log = logging.getLogger(__name__)

from .llm_client import generate_json
from .prompts import (
    EXTRACT_GROUP_OVERVIEW_USER,
    EXTRACT_GROUP_SOLUTION_USER,
    EXTRACT_GROUP_STRUCTURE_USER,
    EXTRACT_INVENTION_SYSTEM,
    EXTRACT_INVENTION_USER,
)
from .relevance import extraction_system_prompt, format_relevance_guidance
from .retrieval import with_field_citations
from .source_text import prepare_source_text

EXTRACTABLE_FIELDS = frozenset(
    {
        "invention_title",
        "technical_field",
        "problem_being_solved",
        "core_technical_solution",
        "novel_mechanism",
        "alternative_embodiments",
        "key_components",
    }
)

_FIELD_LABELS = {
    "invention_title": "Invention Title",
    "technical_field": "Technical Field",
    "problem_being_solved": "Technical Problem Being Solved",
    "core_technical_solution": "Technical Solution / Core Mechanism",
    "novel_mechanism": "What Makes It Novel",
    "alternative_embodiments": "Alternative Embodiments",
    "key_components": "Key Components",
}

# Common alternate JSON keys returned by LLMs (camelCase, shortened, or nested labels).
_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "invention_title": ("invention_title", "inventionTitle", "title"),
    "technical_field": ("technical_field", "technicalField", "field"),
    "problem_being_solved": (
        "problem_being_solved",
        "problemBeingSolved",
        "technical_problem",
        "technicalProblem",
        "problem",
    ),
    "core_technical_solution": (
        "core_technical_solution",
        "coreTechnicalSolution",
        "technical_solution",
        "technicalSolution",
        "core_mechanism",
        "coreMechanism",
        "core_solution",
        "coreSolution",
        "solution",
    ),
    "novel_mechanism": (
        "novel_mechanism",
        "novelMechanism",
        "novelty",
        "novel_features",
        "novelFeatures",
        "technical_novelty",
        "technicalNovelty",
        "what_makes_it_novel",
        "whatMakesItNovel",
    ),
    "alternative_embodiments": (
        "alternative_embodiments",
        "alternativeEmbodiments",
        "embodiments",
        "variations",
    ),
    "key_components": (
        "key_components",
        "keyComponents",
        "components",
        "system_components",
        "systemComponents",
    ),
}

_NESTED_PAYLOAD_KEYS = frozenset(
    {
        "solution",
        "invention",
        "invention_details",
        "inventionDetails",
        "fields",
        "result",
        "data",
        "extraction",
    }
)

_GROUP_EXTRACTORS: list[tuple[str, str]] = [
    ("overview", EXTRACT_GROUP_OVERVIEW_USER),
    ("solution", EXTRACT_GROUP_SOLUTION_USER),
    ("structure", EXTRACT_GROUP_STRUCTURE_USER),
]


def _camel_to_snake(name: str) -> str:
    """Convert camelCase or kebab-case keys to snake_case for lookup."""
    step = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name)
    return step.replace("-", "_").lower()


def _flatten_extraction_payload(data: dict) -> dict:
    """Merge nested or wrapper shapes sometimes returned by the LLM."""
    flattened: dict = {}
    for key, value in data.items():
        if isinstance(value, dict) and key in _NESTED_PAYLOAD_KEYS:
            flattened.update(value)
        else:
            flattened[key] = value

    if len(flattened) == 1:
        only_value = next(iter(flattened.values()))
        if isinstance(only_value, dict):
            return only_value

    return flattened


def _build_lookup(data: dict) -> dict[str, object]:
    """Index payload values by exact, snake_case, and lowercase key variants."""
    lookup: dict[str, object] = {}
    for key, value in data.items():
        for variant in {key, _camel_to_snake(key), key.lower()}:
            lookup.setdefault(variant, value)
    return lookup


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


def _as_str_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [_as_str(item) for item in value if _as_str(item)]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _normalize_extraction(data: dict) -> dict:
    """Ensure extraction output contains the expected fields and types."""
    flattened = _flatten_extraction_payload(data)
    return {
        "invention_title": _as_str(_resolve_field(flattened, "invention_title")),
        "technical_field": _as_str(_resolve_field(flattened, "technical_field")),
        "problem_being_solved": _as_str(_resolve_field(flattened, "problem_being_solved")),
        "core_technical_solution": _as_str(
            _resolve_field(flattened, "core_technical_solution")
        ),
        "novel_mechanism": _as_str(_resolve_field(flattened, "novel_mechanism")),
        "alternative_embodiments": _as_str_list(
            _resolve_field(flattened, "alternative_embodiments")
        ),
        "key_components": _as_str_list(_resolve_field(flattened, "key_components")),
    }


def get_extract_mode() -> str:
    """
    Extraction strategy (env EXTRACT_MODE):

    - single: one LLM call for all fields (legacy)
    - grouped: three parallel LLM calls (default, faster wall-clock)
    - parallel: seven parallel per-field calls (slowest token use, max parallelism)
    """
    mode = os.getenv("EXTRACT_MODE", "grouped").strip().lower()
    if mode in ("single", "grouped", "parallel"):
        return mode
    return "grouped"


def _prepare_extract_documentation(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> tuple[str, str]:
    """
    Truncate source text and prepend user relevance guidance (guidance is never truncated).
    """
    body = prepare_source_text(combined_text)
    guidance = format_relevance_guidance(relevant_notes, irrelevant_notes)
    system = extraction_system_prompt(
        EXTRACT_INVENTION_SYSTEM, relevant_notes, irrelevant_notes
    )
    if guidance:
        return system, f"{guidance}\n\n{body}"
    return system, body


def _extract_single_pass(system: str, source: str) -> dict:
    parsed = generate_json(
        system,
        EXTRACT_INVENTION_USER.format(combined_text=source),
    )
    return _normalize_extraction(parsed)


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
    """Run one group extraction pass, retrying once on failure."""
    last_exc: Exception | None = None
    for attempt in range(2):
        try:
            return _run_group_pass(system, user_template, source)
        except Exception as exc:
            last_exc = exc
            log.warning(
                "Group extraction '%s' failed (attempt %d/2): %s",
                label,
                attempt + 1,
                exc,
            )
    log.error(
        "Group extraction '%s' gave up after retry: %s",
        label,
        last_exc,
    )
    return {}


def _extract_grouped(system: str, source: str) -> dict:
    """Three parallel LLM calls, each returning a subset of fields."""
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
                    "Unexpected error collecting group '%s' result: %s",
                    label,
                    exc,
                )
    normalized = _normalize_extraction(merged)
    if not normalized["core_technical_solution"] and not normalized["novel_mechanism"]:
        log.warning(
            "Solution fields empty after grouped extraction; running targeted fallback."
        )
        fallback = _run_group_pass_with_retry(
            system, EXTRACT_GROUP_SOLUTION_USER, source, "solution"
        )
        merged.update(fallback)
        normalized = _normalize_extraction(merged)
    return normalized


def _extract_parallel_fields(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """One LLM call per field, all in parallel."""
    merged: dict = {}
    fields = list(EXTRACTABLE_FIELDS)
    max_workers = min(len(fields), 7)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(
                extract_invention_field,
                combined_text,
                field,
                None,
                relevant_notes,
                irrelevant_notes,
            ): field
            for field in fields
        }
        for future in as_completed(futures):
            payload = future.result()
            # Parallel mode reuses extract_invention_field; drop per-call citations
            # so they are attached once for all fields by extract_invention_details.
            payload.pop("citations", None)
            merged.update(payload)
    return _normalize_extraction(merged)


def extract_invention_details(
    combined_text: str,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Analyze combined source text and extract structured invention details.

    Source text is truncated per EXTRACT_MAX_SOURCE_CHARS. Strategy is controlled
    by EXTRACT_MODE (default: grouped parallel calls).

    Returns field values plus ``citations`` keyed by field name.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    system, source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    mode = get_extract_mode()

    if mode == "single":
        details = _extract_single_pass(system, source)
    elif mode == "parallel":
        details = _extract_parallel_fields(combined_text, relevant_notes, irrelevant_notes)
    else:
        details = _extract_grouped(system, source)
    return with_field_citations(combined_text, details, _FIELD_LABELS)


def extract_invention_field(
    combined_text: str,
    field: str,
    current: Optional[dict] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Re-extract a single invention field from source text.

    Returns a one-key dict plus ``citations`` for that field, e.g.
    ``{"invention_title": "...", "citations": {"invention_title": [...]}}``.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")
    if field not in EXTRACTABLE_FIELDS:
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

    is_list_field = field in ("alternative_embodiments", "key_components")
    value_type = "list[str]" if is_list_field else "str"

    system = (
        system
        + f" Return JSON with exactly one key: {field!r} ({value_type})."
    )
    user = f"""\
Analyze the technical documentation below and extract only the field "{label}" ({field}).

Return a JSON object with exactly one key "{field}".

Technical documentation:
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
