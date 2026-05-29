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
_CLAIM_NUMBER_RE = re.compile(r"^\d+\.\s+")
_CLAIM_ELEMENT_LINE_RE = re.compile(r"^\s{2,}\S")
_ABSTRACT_MAX_WORDS = 150


def truncate_abstract(text: str, max_words: int = _ABSTRACT_MAX_WORDS) -> str:
    """Trim abstract to USPTO word limit, preferring sentence boundaries."""
    cleaned = sanitize_patent_prose(text).replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned

    truncated = " ".join(words[:max_words])
    last_period = truncated.rfind(".")
    if last_period > len(truncated) * 0.6:
        return truncated[: last_period + 1].strip()
    return f"{truncated.rstrip(' ,;')}."


def normalize_claims(text: str) -> str:
    """
    Normalize claim formatting: one claim per block, blank lines between claims,
    indented element lines preserved.
    """
    cleaned = sanitize_patent_prose(text)
    if not cleaned:
        return cleaned

    lines = cleaned.split("\n")
    claims: list[str] = []
    current_lines: list[str] = []

    def flush_claim() -> None:
        if not current_lines:
            return
        claim_text = "\n".join(current_lines).strip()
        if claim_text:
            claims.append(claim_text)
        current_lines.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines:
                flush_claim()
            continue

        if _CLAIM_NUMBER_RE.match(stripped):
            if current_lines:
                flush_claim()
            current_lines.append(stripped)
        elif _CLAIM_ELEMENT_LINE_RE.match(line) or (
            current_lines and stripped.endswith(";")
        ):
            current_lines.append(f"   {stripped.lstrip()}")
        elif current_lines:
            current_lines[-1] = f"{current_lines[-1]} {stripped}"
        else:
            current_lines.append(stripped)

    flush_claim()

    if len(claims) <= 1 and not any("\n" in claim for claim in claims):
        # Fallback: split run-on claims like "1. ... 2. ..."
        single = claims[0] if claims else cleaned
        parts = re.split(r"(?<=\.)\s+(?=\d+\.\s+)", single)
        if len(parts) > 1:
            claims = [part.strip() for part in parts if part.strip()]

    return "\n\n".join(claims)


def sanitize_section_output(section: str, text: str) -> str:
    """Apply section-specific post-processing after LLM generation."""
    cleaned = sanitize_patent_prose(text)
    if section == "abstract":
        return truncate_abstract(cleaned)
    if section == "claims":
        return normalize_claims(cleaned)
    return cleaned


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
    collapsed to spaces unless the line looks like a numbered claim or
    an indented claim element.
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
            elif _CLAIM_ELEMENT_LINE_RE.match(f"   {line}"):
                paragraphs.append(current)
                current = line
            elif current.endswith(("-", "—")):
                current = current[:-1] + line
            else:
                current = f"{current} {line}"
        paragraphs.append(current)

    return paragraphs


def split_claim_blocks(text: str) -> list[list[str]]:
    """Split claims text into blocks of lines (one block per claim)."""
    normalized = strip_markdown(text)
    if not normalized:
        return []

    blocks = re.split(r"\n\s*\n", normalized)
    claim_blocks: list[list[str]] = []
    for block in blocks:
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if lines:
            claim_blocks.append(lines)
    return claim_blocks


def is_claim_element_line(line: str) -> bool:
    """True if line is an indented claim element (not the claim preamble)."""
    return bool(_CLAIM_ELEMENT_LINE_RE.match(line))


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
