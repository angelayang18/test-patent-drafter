"""Prepare source text for LLM extraction (size limits, truncation)."""

from __future__ import annotations

import os

DEFAULT_MAX_SOURCE_CHARS = 80_000
_HEAD_RATIO = 0.65


def get_max_source_chars() -> int:
    """Max characters of combined source text sent to the extraction LLM."""
    raw = os.getenv("EXTRACT_MAX_SOURCE_CHARS", str(DEFAULT_MAX_SOURCE_CHARS))
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_MAX_SOURCE_CHARS
    return max(value, 4_000)


def prepare_source_text(combined_text: str) -> str:
    """
    Trim source text to a bounded size for faster, more reliable extraction.

    Keeps the beginning (most context-rich) and a slice of the end so late
    sections in long decks are not entirely dropped.
    """
    text = combined_text.strip()
    if not text:
        return text

    limit = get_max_source_chars()
    if len(text) <= limit:
        return text

    head_len = int(limit * _HEAD_RATIO)
    tail_len = limit - head_len - 80
    if tail_len < 1_000:
        head_len = limit - 1_200
        tail_len = 1_000

    omitted = len(text) - head_len - tail_len
    return (
        f"{text[:head_len]}\n\n"
        f"[... {omitted:,} characters omitted from source material ...]\n\n"
        f"{text[-tail_len:]}"
    )
