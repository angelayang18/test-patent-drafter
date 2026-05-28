"""Convert LLM section text into clean plain text for Word/PDF export."""

from __future__ import annotations

import re

_HEADING_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
_BULLET_RE = re.compile(r"^[\-*•]\s+", re.MULTILINE)
_ORDERED_BULLET_RE = re.compile(r"^\d+\.\s+", re.MULTILINE)


def strip_markdown(text: str) -> str:
    """Remove common markdown markers while preserving readable plain text."""
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _HEADING_RE.sub("", cleaned)
    cleaned = _BOLD_RE.sub(r"\1", cleaned)
    cleaned = _ITALIC_RE.sub(r"\1", cleaned)
    cleaned = _INLINE_CODE_RE.sub(r"\1", cleaned)
    cleaned = _BULLET_RE.sub("", cleaned)
    return cleaned.strip()


def split_paragraphs(text: str) -> list[str]:
    """
    Split section body into paragraphs for document export.

    Blank lines separate paragraphs. Single newlines within a paragraph are
    collapsed to spaces unless the line looks like a numbered claim.
    """
    normalized = strip_markdown(text)
    if not normalized:
        return []

    blocks = re.split(r"\n\s*\n", normalized)
    paragraphs: list[str] = []

    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        if all(_ORDERED_BULLET_RE.match(line) for line in lines):
            paragraphs.extend(lines)
            continue

        if len(lines) == 1:
            paragraphs.append(lines[0])
            continue

        current = lines[0]
        for line in lines[1:]:
            if _ORDERED_BULLET_RE.match(line):
                paragraphs.append(current)
                current = line
            elif current.endswith(("-", "—")):
                current = current[:-1] + line
            else:
                current = f"{current} {line}"
        paragraphs.append(current)

    return paragraphs
