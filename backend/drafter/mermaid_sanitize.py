"""Fix common invalid Mermaid patterns from LLM figure generation."""

from __future__ import annotations

import re

# Empty subgraph titles break the Mermaid parser (e.g. subgraph Left [""]).
_EMPTY_SUBGRAPH_TITLE = re.compile(
    r'(\bsubgraph\s+[\w-]+)\s*\[\s*(?:""|\'\')\s*\]',
    re.IGNORECASE,
)

# Bare auto-generated subgraph IDs like `subgraph sg203` render as ugly labels.
# Strip the bare ID so the subgraph renders without a label.
_BARE_AUTOID_SUBGRAPH = re.compile(
    r"^\s*subgraph\s+(sg\d+)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

# Redundant inside subgraphs; often paired with invalid empty titles.
_SUBGRAPH_DIRECTION = re.compile(
    r"^\s*direction\s+(?:TB|TD|LR|RL|BT)\s*$",
    re.IGNORECASE | re.MULTILINE,
)

_BRACKET_LABEL_RE = re.compile(r'(\[")([^"]*)("\])')
_PARTICIPANT_AS_RE = re.compile(
    r"^(\s*participant\s+\S+\s+as\s+)(.+)$",
    re.IGNORECASE | re.MULTILINE,
)
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html_from_label(label: str) -> str:
    """Remove HTML tags from a Mermaid label; line-break tags become spaces."""
    text = re.sub(r"<br\s*/?>", " ", label, flags=re.IGNORECASE)
    text = _HTML_TAG_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()


def strip_html_from_mermaid_labels(mermaid: str) -> str:
    """Strip HTML tags from quoted node labels and participant aliases."""
    source = mermaid

    def bracket_replacer(match: re.Match[str]) -> str:
        cleaned = _strip_html_from_label(match.group(2))
        return f'{match.group(1)}{cleaned}{match.group(3)}'

    source = _BRACKET_LABEL_RE.sub(bracket_replacer, source)

    def participant_replacer(match: re.Match[str]) -> str:
        cleaned = _strip_html_from_label(match.group(2))
        return f"{match.group(1)}{cleaned}"

    source = _PARTICIPANT_AS_RE.sub(participant_replacer, source)
    return _strip_remaining_html(source)


def _strip_remaining_html(mermaid: str) -> str:
    """Remove any leftover HTML tags from the full Mermaid source."""
    lines: list[str] = []
    for line in mermaid.splitlines():
        if line.strip().startswith("%%"):
            lines.append(line)
            continue
        cleaned = re.sub(r"<br\s*/?>", " ", line, flags=re.IGNORECASE)
        cleaned = _HTML_TAG_RE.sub("", cleaned)
        lines.append(cleaned)
    return "\n".join(lines)


def sanitize_mermaid_source(mermaid: str) -> str:
    """Repair LLM output that uses invalid subgraph or direction syntax."""
    source = mermaid.strip()
    if not source:
        return source

    source = _EMPTY_SUBGRAPH_TITLE.sub(r"\1", source)
    source = _BARE_AUTOID_SUBGRAPH.sub("subgraph", source)
    source = _SUBGRAPH_DIRECTION.sub("", source)
    source = strip_html_from_mermaid_labels(source)
    # Collapse excessive blank lines left after removing direction statements.
    source = re.sub(r"\n{3,}", "\n\n", source)
    return source.strip()
