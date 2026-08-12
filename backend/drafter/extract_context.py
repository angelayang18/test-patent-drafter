"""Build focused source context for LLM extraction (retrieve-then-extract)."""

from __future__ import annotations

from .retrieval import format_excerpts_block, retrieve_relevant_excerpts
from .source_chunks import parse_source_chunks
from .source_text import get_max_source_chars, prepare_source_text

# Quality-leaning budgets for long-document extraction context.
EXTRACT_GLOBAL_HEAD_CHARS = 8_000
EXTRACT_MAX_EXCERPTS = 12
EXTRACT_MAX_EXCERPT_CHARS = 12_000


def _global_head(combined_text: str, head_chars: int = EXTRACT_GLOBAL_HEAD_CHARS) -> str:
    """Return the leading slice of combined source text for overview context."""
    text = combined_text.strip()
    if len(text) <= head_chars:
        return text
    cut = text[:head_chars]
    # Prefer breaking on a paragraph boundary when possible.
    last_break = cut.rfind("\n\n")
    if last_break >= head_chars // 2:
        cut = cut[:last_break]
    return cut.rstrip()


def _excerpt_covered_by_head(excerpt_text: str, head: str) -> bool:
    """Return True when the excerpt body is already present in the global head."""
    needle = " ".join(excerpt_text.split())
    haystack = " ".join(head.split())
    if not needle:
        return True
    return needle in haystack


def build_extract_source(combined_text: str, query_description: str) -> str:
    """
    Prepare source text for an extraction LLM call.

    Short documents (within ``EXTRACT_MAX_SOURCE_CHARS``) are passed through in
    full. Longer documents get a global head plus lexically retrieved passages
    for ``query_description``, falling back to head/tail truncation if retrieval
    finds nothing useful.
    """
    text = combined_text.strip()
    if not text:
        return text

    limit = get_max_source_chars()
    if len(text) <= limit:
        return prepare_source_text(text)

    chunks = parse_source_chunks(text)
    if not chunks:
        return prepare_source_text(text)

    head = _global_head(text)
    excerpts, _ = retrieve_relevant_excerpts(
        query_description,
        {},
        chunks,
        [],
        max_excerpts=EXTRACT_MAX_EXCERPTS,
        max_chars=EXTRACT_MAX_EXCERPT_CHARS,
        weighted=True,
        demote_cover_pages=True,
    )
    unique = [
        excerpt
        for excerpt in excerpts
        if not _excerpt_covered_by_head(excerpt.text, head)
    ]
    block = format_excerpts_block(unique)
    if not block.strip():
        # Retrieved hits already sit inside the global head — keep the head
        # rather than falling back to head/tail truncation (which can drop the
        # middle). Only fall back when retrieval found nothing at all.
        if excerpts:
            return head
        return prepare_source_text(text)

    return f"{head}\n\n{block.strip()}"


def build_group_extract_sources(
    combined_text: str,
    groups: list[tuple[str, str]],
) -> dict[str, str]:
    """
    Build a per-group extraction source map.

    ``groups`` is a list of ``(group_label, query_description)`` pairs.
    """
    return {
        label: build_extract_source(combined_text, query_description)
        for label, query_description in groups
    }


def is_empty_field_value(value: object) -> bool:
    """Return True for missing, blank string, or empty list field values."""
    if value is None:
        return True
    if isinstance(value, list):
        return len(value) == 0
    return not str(value).strip()


def empty_fields(details: dict) -> list[str]:
    """Return field names whose values are empty after extraction."""
    return [key for key, value in details.items() if is_empty_field_value(value)]


# Fixed placeholder when the model leaves a field blank after gap-fill.
# Matches the descriptive filler text models often write for other fields.
EMPTY_FIELD_FALLBACK = "Not provided in the source documentation."


def apply_empty_field_fallback(
    details: dict,
    *,
    fallback: str = EMPTY_FIELD_FALLBACK,
) -> dict:
    """
    Replace empty extraction field values with a fixed fallback.

    Empty / blank strings become ``fallback``. Empty lists become
    ``[fallback]`` so list-typed fields stay non-empty for UI consistency.
    Non-empty values are left unchanged.
    """
    updated = dict(details)
    for key, value in details.items():
        if not is_empty_field_value(value):
            continue
        if isinstance(value, list):
            updated[key] = [fallback]
        else:
            updated[key] = fallback
    return updated
