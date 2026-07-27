"""Parse combined source text into labeled chunks using --- label --- headers."""

from __future__ import annotations

import re
from dataclasses import dataclass

_CHUNK_HEADER_RE = re.compile(r"^--- (.+?) ---$", re.MULTILINE)


@dataclass
class SourceChunk:
    """A labeled block of source material."""

    label: str
    text: str


def parse_source_chunks(combined_text: str) -> list[SourceChunk]:
    """Split combined text on ``--- {label} ---`` headers into labeled chunks.

    Falls back to a single unlabeled "Source material" chunk when no headers
    are present. Headers with empty bodies between them are skipped.
    """
    text = combined_text.strip()
    if not text:
        return []
    matches = list(_CHUNK_HEADER_RE.finditer(text))
    if not matches:
        return [SourceChunk(label="Source material", text=text)]
    chunks: list[SourceChunk] = []
    for i, m in enumerate(matches):
        label = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        if body:
            chunks.append(SourceChunk(label=label, text=body))
    return chunks
