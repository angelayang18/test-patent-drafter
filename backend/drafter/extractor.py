"""Extract invention details from raw text using the configured LLM."""

from __future__ import annotations

from .llm_client import generate_json
from .prompts import EXTRACT_INVENTION_SYSTEM, EXTRACT_INVENTION_USER

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


def extract_invention_details(combined_text: str) -> dict:
    """
    Analyze combined source text and extract structured invention details.

    Args:
        combined_text: Raw text from uploaded documents, Confluence, or web sources.

    Returns:
        Dict with invention_title, technical_field, problem_being_solved,
        core_technical_solution, novel_mechanism, alternative_embodiments,
        and key_components.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    parsed = generate_json(
        EXTRACT_INVENTION_SYSTEM,
        EXTRACT_INVENTION_USER.format(combined_text=combined_text),
    )
    return _normalize_extraction(parsed)


def extract_invention_field(combined_text: str, field: str, current: dict | None = None) -> dict:
    """
    Re-extract a single invention field from source text.

    Returns a one-key dict, e.g. ``{"invention_title": "..."}``.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")
    if field not in EXTRACTABLE_FIELDS:
        raise ValueError(f"Unknown field: {field}")

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
        EXTRACT_INVENTION_SYSTEM
        + f" Return JSON with exactly one key: {field!r} ({value_type})."
    )
    user = f"""\
Analyze the technical documentation below and extract only the field "{label}" ({field}).

Return a JSON object with exactly one key "{field}".

Technical documentation:
{combined_text}
{context_block}
"""

    parsed = generate_json(system, user)
    if field not in parsed:
        raise ValueError(f"Model response missing field {field!r}.")

    normalized = _normalize_extraction({field: parsed[field]})
    return {field: normalized[field]}
