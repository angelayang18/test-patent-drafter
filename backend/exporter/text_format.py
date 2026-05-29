"""Convert LLM section text into clean plain text for Word/PDF export."""

from __future__ import annotations

import re

_HEADING_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
_BULLET_RE = re.compile(r"^[\-*•]\s+", re.MULTILINE)
_ORDERED_BULLET_RE = re.compile(r"^\d+\.\s+", re.MULTILINE)
# Paired internal markers from source docs: %%Header 1%%, %%summary%%, etc.
_WRAPPED_INTERNAL_TAG_RE = re.compile(r"%%([^%]+)%%\s*")
# Bare chunk tags: %%qa (when not wrapped).
_INTERNAL_DELIMITER_TAG_RE = re.compile(r"%%([a-zA-Z][a-zA-Z0-9_]*)")
# Template placeholders copied from source templates: {item_1_desc}, {foo_bar}.
_TEMPLATE_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
# Subsection titles run into the next sentence: "4. Data Flow The pipeline..."
_SUBSECTION_TITLE_RUN_IN_RE = re.compile(
    r"(^|\n)(\d+\.\s+)"
    r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5})"
    r"(\s+)(?=(?:The|A|An|Each|This|Unlike|Upon|In|Each|Where)\s)",
    re.MULTILINE,
)
# Numbered list item with a short title before the body: "1. Header 1: body..."
_LIST_ITEM_WITH_TITLE_RE = re.compile(r"^(\d+\.\s+)([^:]+):\s+(.+)$", re.DOTALL)


def sanitize_patent_prose(text: str) -> str:
    """
    Normalize LLM/source-artifact markup into readable patent prose.

    - ``%%Header 1%%`` wrappers become ``Header 1: `` (visible separation)
    - bare ``%%qa`` tags become ``qa``
    - template braces like ``{item_1_desc}`` are removed
    - subsection headings like ``4. Data Flow The...`` get a paragraph break
    """
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _WRAPPED_INTERNAL_TAG_RE.sub(
        lambda match: f"{match.group(1).strip()}: ",
        cleaned,
    )
    cleaned = _INTERNAL_DELIMITER_TAG_RE.sub(r"\1", cleaned)
    cleaned = _TEMPLATE_PLACEHOLDER_RE.sub("", cleaned)
    cleaned = _SUBSECTION_TITLE_RUN_IN_RE.sub(r"\1\2\3\n\n", cleaned)
    cleaned = re.sub(r"[ \t]+\.", ".", cleaned)
    cleaned = re.sub(r"  +", " ", cleaned)
    cleaned = re.sub(r" *\n *\n *", "\n\n", cleaned)
    return cleaned.strip()


def sanitize_internal_delimiter_tags(text: str) -> str:
    """Backward-compatible alias for :func:`sanitize_patent_prose`."""
    return sanitize_patent_prose(text)


def strip_markdown(text: str) -> str:
    """Remove common markdown markers while preserving readable plain text."""
    cleaned = sanitize_patent_prose(text)
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


def parse_numbered_list_item_header(paragraph: str) -> tuple[str, str, str] | None:
    """
    If *paragraph* is a numbered list line with a title clause, return
    (prefix, title, body) e.g. ("1. ", "Header 1", "This is the first item.").
    """
    match = _LIST_ITEM_WITH_TITLE_RE.match(paragraph.strip())
    if not match:
        return None
    prefix, title, body = match.group(1), match.group(2).strip(), match.group(3).strip()
    if not title or not body:
        return None
    if len(title) > 80:
        return None
    return prefix, title, body
