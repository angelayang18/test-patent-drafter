"""Deterministic per-section keyword retrieval over labeled source chunks."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .source_chunks import SourceChunk

MAX_EXCERPT_CHARS_PER_SECTION = 3500
MAX_EXCERPTS_PER_SECTION = 6
MIN_PARAGRAPH_CHARS = 40

_WORD_RE = re.compile(r"[a-z0-9]+")

_STOPWORDS = frozenset(
    {
        "a",
        "about",
        "above",
        "after",
        "again",
        "against",
        "all",
        "am",
        "an",
        "and",
        "any",
        "are",
        "as",
        "at",
        "be",
        "because",
        "been",
        "before",
        "being",
        "below",
        "between",
        "both",
        "but",
        "by",
        "can",
        "did",
        "do",
        "does",
        "doing",
        "down",
        "during",
        "each",
        "few",
        "for",
        "from",
        "further",
        "had",
        "has",
        "have",
        "having",
        "he",
        "her",
        "here",
        "hers",
        "herself",
        "him",
        "himself",
        "his",
        "how",
        "i",
        "if",
        "in",
        "into",
        "is",
        "it",
        "its",
        "itself",
        "just",
        "me",
        "more",
        "most",
        "my",
        "myself",
        "no",
        "nor",
        "not",
        "now",
        "of",
        "off",
        "on",
        "once",
        "only",
        "or",
        "other",
        "our",
        "ours",
        "ourselves",
        "out",
        "over",
        "own",
        "same",
        "she",
        "should",
        "so",
        "some",
        "such",
        "than",
        "that",
        "the",
        "their",
        "theirs",
        "them",
        "themselves",
        "then",
        "there",
        "these",
        "they",
        "this",
        "those",
        "through",
        "to",
        "too",
        "under",
        "until",
        "up",
        "very",
        "was",
        "we",
        "were",
        "what",
        "when",
        "where",
        "which",
        "while",
        "who",
        "whom",
        "why",
        "will",
        "with",
        "would",
        "you",
        "your",
        "yours",
        "yourself",
        "yourselves",
    }
)

@dataclass
class Excerpt:
    """A scored source paragraph selected for a section."""

    label: str
    text: str
    score: float


def _words(text: str) -> set[str]:
    """Lowercase tokens, strip stopwords, keep length > 2."""
    return {
        w
        for w in _WORD_RE.findall(text.lower())
        if len(w) > 2 and w not in _STOPWORDS
    }


def _split_paragraphs(text: str) -> list[str]:
    """Split on blank lines and drop short paragraphs."""
    parts = re.split(r"\n\s*\n", text.strip())
    return [p.strip() for p in parts if len(p.strip()) >= MIN_PARAGRAPH_CHARS]


def build_section_query_terms(
    section_description: str,
    invention: dict,
    query_fields: list[str],
) -> set[str]:
    """Build query vocabulary from section description plus allowlisted fields.

    Restricting fields (not just adding description bias) is what actually fixes
    cross-section bleed — a longer, keyword-denser paragraph on the wrong topic can
    still outscore a short on-topic one if its vocabulary is in the query at all.
    """
    parts = [section_description or ""]
    for key in query_fields:
        value = invention.get(key)
        if value:
            parts.append(str(value))
    return _words(" ".join(parts))


def retrieve_relevant_excerpts(
    section_description: str,
    invention: dict,
    chunks: list[SourceChunk],
    query_fields: list[str],
) -> list[Excerpt]:
    """Rank paragraphs by query overlap and return top excerpts within budget.

    Score = |query_terms ∩ paragraph_terms| / sqrt(|query_terms|).
    Returns [] if chunks or query_terms are empty.
    """
    if not chunks:
        return []
    query_terms = build_section_query_terms(
        section_description,
        invention,
        query_fields,
    )
    if not query_terms:
        return []

    denom = math.sqrt(len(query_terms))
    scored: list[Excerpt] = []
    for chunk in chunks:
        for paragraph in _split_paragraphs(chunk.text):
            para_terms = _words(paragraph)
            overlap = len(query_terms & para_terms)
            if overlap <= 0:
                continue
            score = overlap / denom
            scored.append(Excerpt(label=chunk.label, text=paragraph, score=score))

    scored.sort(key=lambda e: e.score, reverse=True)

    selected: list[Excerpt] = []
    total_chars = 0
    for excerpt in scored:
        if len(selected) >= MAX_EXCERPTS_PER_SECTION:
            break
        if total_chars + len(excerpt.text) > MAX_EXCERPT_CHARS_PER_SECTION and selected:
            break
        selected.append(excerpt)
        total_chars += len(excerpt.text)
    return selected


def format_excerpts_block(excerpts: list[Excerpt]) -> str:
    """Render excerpts as a labeled prompt block, or "" if empty."""
    if not excerpts:
        return ""
    lines = [
        "SUPPORTING SOURCE EXCERPTS (drawn specifically for this section; use for factual/"
        "technical grounding, but the invention details above remain the primary source of "
        "truth — do not copy verbatim):",
        "",
    ]
    for excerpt in excerpts:
        lines.append(f"[Source: {excerpt.label}]")
        lines.append(excerpt.text)
        lines.append("")
    return "\n\n" + "\n".join(lines).rstrip() + "\n"


def citations_from_excerpts(excerpts: list[Excerpt]) -> list[dict]:
    """Truncate excerpts for API/UI; dedupe exact (label, text) pairs only."""
    seen: set[tuple[str, str]] = set()
    citations: list[dict] = []
    for excerpt in excerpts:
        text = excerpt.text.strip()
        if len(text) > 220:
            text = text[:220].rstrip() + "…"
        key = (excerpt.label, text)
        if key in seen:
            continue
        seen.add(key)
        citations.append({"label": excerpt.label, "excerpt": text})
    return citations
