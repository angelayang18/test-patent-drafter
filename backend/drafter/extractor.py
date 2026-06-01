"""Extract invention details from raw text using the configured LLM."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from .llm_client import generate_json
from .prompts import (
    EXTRACT_GROUP_OVERVIEW_USER,
    EXTRACT_GROUP_SOLUTION_USER,
    EXTRACT_GROUP_STRUCTURE_USER,
    EXTRACT_INVENTION_SYSTEM,
    EXTRACT_INVENTION_USER,
)
from .relevance import extraction_system_prompt, format_relevance_guidance
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

_GROUP_EXTRACTORS: list[tuple[str, str]] = [
    ("overview", EXTRACT_GROUP_OVERVIEW_USER),
    ("solution", EXTRACT_GROUP_SOLUTION_USER),
    ("structure", EXTRACT_GROUP_STRUCTURE_USER),
]


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
    return {
        "invention_title": _as_str(data.get("invention_title")),
        "technical_field": _as_str(data.get("technical_field")),
        "problem_being_solved": _as_str(data.get("problem_being_solved")),
        "core_technical_solution": _as_str(data.get("core_technical_solution")),
        "novel_mechanism": _as_str(data.get("novel_mechanism")),
        "alternative_embodiments": _as_str_list(data.get("alternative_embodiments")),
        "key_components": _as_str_list(data.get("key_components")),
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
    return parsed


def _extract_grouped(system: str, source: str) -> dict:
    """Three parallel LLM calls, each returning a subset of fields."""
    merged: dict = {}
    max_workers = min(len(_GROUP_EXTRACTORS), 3)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_run_group_pass, system, template, source): label
            for label, template in _GROUP_EXTRACTORS
        }
        for future in as_completed(futures):
            merged.update(future.result())
    return _normalize_extraction(merged)


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
            merged.update(future.result())
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
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    system, source = _prepare_extract_documentation(
        combined_text, relevant_notes, irrelevant_notes
    )
    mode = get_extract_mode()

    if mode == "single":
        return _extract_single_pass(system, source)
    if mode == "parallel":
        return _extract_parallel_fields(combined_text, relevant_notes, irrelevant_notes)
    return _extract_grouped(system, source)


def extract_invention_field(
    combined_text: str,
    field: str,
    current: Optional[dict] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Re-extract a single invention field from source text.

    Returns a one-key dict, e.g. ``{"invention_title": "..."}``.
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
    return {field: normalized[field]}
