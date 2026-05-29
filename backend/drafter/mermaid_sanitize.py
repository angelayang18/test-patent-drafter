"""Fix common invalid Mermaid patterns from LLM figure generation."""

from __future__ import annotations

import re

# Empty subgraph titles break the Mermaid parser (e.g. subgraph Left [""]).
_EMPTY_SUBGRAPH_TITLE = re.compile(
    r'(\bsubgraph\s+[\w-]+)\s*\[\s*(?:""|\'\')\s*\]',
    re.IGNORECASE,
)

# Redundant inside subgraphs; often paired with invalid empty titles.
_SUBGRAPH_DIRECTION = re.compile(
    r"^\s*direction\s+(?:TB|TD|LR|RL|BT)\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def sanitize_mermaid_source(mermaid: str) -> str:
    """Repair LLM output that uses invalid subgraph or direction syntax."""
    source = mermaid.strip()
    if not source:
        return source

    source = _EMPTY_SUBGRAPH_TITLE.sub(r"\1", source)
    source = _SUBGRAPH_DIRECTION.sub("", source)
    # Collapse excessive blank lines left after removing direction statements.
    source = re.sub(r"\n{3,}", "\n\n", source)
    return source.strip()
