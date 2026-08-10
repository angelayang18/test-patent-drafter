"""Suggest document-type section outlines from sample report text."""

from __future__ import annotations

from typing import Any, Optional

from drafter.llm_client import generate_json
from drafter.source_text import prepare_source_text

SECTION_NAME_MAX_LENGTH = 120
SECTION_DESCRIPTION_MAX_LENGTH = 500
STYLE_NOTE_MAX_LENGTH = 400
MIN_SAMPLE_CHARS = 80
MIN_SECTIONS = 2
MAX_SECTIONS = 20


def _truncate(value: str, limit: int) -> str:
    """Trim and truncate a string to ``limit`` characters."""
    text = value.strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip()


def _normalize_sections(raw: object) -> list[dict[str, str]]:
    """Validate and normalize model section suggestions."""
    if not isinstance(raw, list):
        raise ValueError("Model response 'sections' must be a list of objects.")

    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name_raw = item.get("name")
        if not isinstance(name_raw, str):
            continue
        name = _truncate(name_raw, SECTION_NAME_MAX_LENGTH)
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)

        desc_raw = item.get("description", "")
        description = (
            _truncate(desc_raw, SECTION_DESCRIPTION_MAX_LENGTH)
            if isinstance(desc_raw, str)
            else ""
        )
        result.append({"name": name, "description": description})
        if len(result) >= MAX_SECTIONS:
            break

    if len(result) < MIN_SECTIONS:
        raise ValueError(
            f"Expected at least {MIN_SECTIONS} distinct sections, got {len(result)}."
        )
    return result


def suggest_sections_from_samples(
    combined_text: str,
    document_type_name: str,
    description: str = "",
) -> dict[str, Any]:
    """
    Infer a reusable section outline from sample report text.

    Returns ``{"sections": [{"name", "description"}, ...], "style_note": str | None}``.
    """
    body = prepare_source_text(combined_text)
    if not body or len(body) < MIN_SAMPLE_CHARS:
        raise ValueError(
            f"Sample text is empty or too short (need at least {MIN_SAMPLE_CHARS} characters)."
        )

    label = document_type_name.strip()
    if not label:
        raise ValueError("document_type_name is required.")

    type_description = description.strip()
    description_block = (
        f"\nDocument type description: {type_description}" if type_description else ""
    )

    system = (
        f"You analyze sample documents to propose a reusable section outline for a "
        f"document type named '{label}'. Infer the major sections that typically appear "
        f"in reports of this kind, using formal drafting language. Prefer clear section "
        f"names and short descriptions of what each section should cover. "
        f"Return JSON with keys: 'sections' (list of objects with 'name' and "
        f"'description' strings, between {MIN_SECTIONS} and {MAX_SECTIONS} items) and "
        f"optional 'style_note' (one short sentence on tone/style inferred from the samples)."
    )

    user = f"""\
Analyze the sample report text below for a document type named "{label}".{description_block}

Infer the section structure a new draft of this type should use. Return a JSON object with:
- "sections": a list of {MIN_SECTIONS}-{MAX_SECTIONS} objects, each with:
  - "name": section title (at most {SECTION_NAME_MAX_LENGTH} characters)
  - "description": what the section should cover (at most {SECTION_DESCRIPTION_MAX_LENGTH} characters)
- "style_note": optional brief note on tone/style (at most {STYLE_NOTE_MAX_LENGTH} characters)

Do not invent highly specific content unique to one sample; generalize into a reusable outline.

Sample documentation:
{body}
"""

    parsed = generate_json(system, user)
    if "sections" not in parsed:
        raise ValueError("Model response missing field 'sections'.")

    sections = _normalize_sections(parsed["sections"])
    style_note: Optional[str] = None
    raw_note = parsed.get("style_note")
    if isinstance(raw_note, str) and raw_note.strip():
        style_note = _truncate(raw_note, STYLE_NOTE_MAX_LENGTH)

    return {"sections": sections, "style_note": style_note}
