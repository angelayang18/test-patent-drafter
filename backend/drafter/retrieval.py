"""Deterministic per-section keyword retrieval over labeled source chunks."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from .source_chunks import SourceChunk, parse_source_chunks

MAX_EXCERPT_CHARS_PER_SECTION = 3500
MAX_EXCERPTS_PER_SECTION = 6
MIN_PARAGRAPH_CHARS = 40
MAX_CITATION_QUOTE_CHARS = 220

_WORD_RE = re.compile(r"[a-z0-9]+")

# Matches === Page N ===, === Paragraph N ===, === Slide N ===, === Slide N: Title ===
_LOCATION_MARKER_RE = re.compile(r"^===\s*(.+?)\s*===$")
_PAGE_BODY_RE = re.compile(r"^Page\s+(\d+)$", re.IGNORECASE)
_PARAGRAPH_BODY_RE = re.compile(r"^Paragraph\s+(\d+)$", re.IGNORECASE)
_SLIDE_BODY_RE = re.compile(r"^Slide\s+(\d+)(?:\s*:.*)?$", re.IGNORECASE)

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
    location: str = ""


def _words(text: str) -> set[str]:
    """Lowercase tokens, strip stopwords, keep length > 2."""
    return {
        w
        for w in _WORD_RE.findall(text.lower())
        if len(w) > 2 and w not in _STOPWORDS
    }


def _parse_location_marker(line: str) -> str | None:
    """Return a display location from a marker line, or None if not a marker.

    Recognizes ``=== Page N ===``, ``=== Paragraph N ===``, and
    ``=== Slide N ===`` / ``=== Slide N: Title ===``.
    """
    match = _LOCATION_MARKER_RE.match(line.strip())
    if not match:
        return None
    body = match.group(1).strip()
    page_match = _PAGE_BODY_RE.match(body)
    if page_match:
        return f"Page {page_match.group(1)}"
    paragraph_match = _PARAGRAPH_BODY_RE.match(body)
    if paragraph_match:
        return f"Paragraph {paragraph_match.group(1)}"
    slide_match = _SLIDE_BODY_RE.match(body)
    if slide_match:
        return f"Slide {slide_match.group(1)}"
    return None


def _text_has_location_markers(text: str) -> bool:
    """Return True if any line in ``text`` is a recognized location marker."""
    for line in text.splitlines():
        if _parse_location_marker(line) is not None:
            return True
    return False


def _split_located_paragraphs(text: str) -> list[tuple[str, str]]:
    """Split on blank lines and attach a location to each kept paragraph.

    Marker lines (``=== Page/Paragraph/Slide … ===``) are stripped and the most
    recent preceding marker becomes the location for subsequent paragraphs.
    Sources with no markers are numbered sequentially as ``Paragraph N``.
    """
    stripped = text.strip()
    if not stripped:
        return []

    has_markers = _text_has_location_markers(stripped)
    parts = re.split(r"\n\s*\n", stripped)
    results: list[tuple[str, str]] = []
    current_location: str | None = None
    sequential = 0

    for part in parts:
        lines = part.splitlines()
        body_start = 0
        while body_start < len(lines):
            location = _parse_location_marker(lines[body_start])
            if location is None:
                break
            current_location = location
            body_start += 1

        body = "\n".join(lines[body_start:]).strip()
        if len(body) < MIN_PARAGRAPH_CHARS:
            continue

        if has_markers and current_location is not None:
            location_label = current_location
        else:
            sequential += 1
            location_label = f"Paragraph {sequential}"

        results.append((location_label, body))

    return results


def _split_paragraphs(text: str) -> list[str]:
    """Split on blank lines and drop short paragraphs (location discarded)."""
    return [paragraph for _, paragraph in _split_located_paragraphs(text)]


def _split_sentence_spans(cleaned: str) -> list[tuple[int, int]]:
    """Return (start, end) spans for sentences split on ``. `` / ``? `` / ``! ``."""
    spans: list[tuple[int, int]] = []
    start = 0
    i = 0
    while i < len(cleaned):
        if cleaned[i] in ".?!" and i + 1 < len(cleaned) and cleaned[i + 1] == " ":
            end = i + 1  # include punctuation, exclude trailing space
            spans.append((start, end))
            start = i + 2
            i = start
            continue
        i += 1
    if start < len(cleaned):
        spans.append((start, len(cleaned)))
    return spans


def _trim_citation_window(window: str, *, preserve_through: int = 0) -> str:
    """Trim a char-budget window at a sentence or word boundary.

    ``preserve_through`` is an end-index that must remain in the quote (used so a
    query-matching sentence is not discarded by trailing sentence-boundary trim).
    """
    min_cut = max(MAX_CITATION_QUOTE_CHARS // 3, preserve_through)
    best_end = -1
    for sep in (". ", "? ", "! "):
        idx = window.rfind(sep)
        if idx >= min_cut:
            # Include the sentence-ending punctuation
            best_end = max(best_end, idx + 1)

    if best_end > 0:
        return window[:best_end].rstrip()

    if preserve_through > 0 and preserve_through <= len(window):
        # Keep the preserved span; soft-trim only the trailing remainder.
        space_idx = window.rfind(" ")
        if space_idx >= preserve_through:
            return window[:space_idx].rstrip() + "…"
        return window.rstrip() + ("…" if len(window) >= MAX_CITATION_QUOTE_CHARS else "")

    space_idx = window.rfind(" ")
    if space_idx > MAX_CITATION_QUOTE_CHARS // 2:
        return window[:space_idx].rstrip() + "…"
    return window.rstrip() + "…"


def _citation_quote(text: str, query_terms: set[str] | None = None) -> str:
    """Return a clean verbatim-ish quote for citations (not a mid-word cut).

    Whitespace is collapsed for display. Truncation prefers a sentence boundary;
    an ellipsis is appended only when the quote is genuinely truncated.

    When ``query_terms`` is provided and the text exceeds the quote budget, prefer
    a window centered on the first sentence that contains a query term rather than
    always truncating from character 0 (which can hide the matched content behind
    leading boilerplate).
    """
    cleaned = " ".join(text.split()).strip()
    if len(cleaned) <= MAX_CITATION_QUOTE_CHARS:
        return cleaned

    window_start = 0
    preserve_through = 0
    if query_terms:
        for sent_start, sent_end in _split_sentence_spans(cleaned):
            sentence = cleaned[sent_start:sent_end]
            if not (_words(sentence) & query_terms):
                continue
            sent_len = sent_end - sent_start
            if sent_len >= MAX_CITATION_QUOTE_CHARS:
                window_start = sent_start
            else:
                pad = MAX_CITATION_QUOTE_CHARS - sent_len
                window_start = max(0, sent_start - (pad // 2))
                if window_start + MAX_CITATION_QUOTE_CHARS > len(cleaned):
                    window_start = max(0, len(cleaned) - MAX_CITATION_QUOTE_CHARS)
                # Keep the matching sentence fully inside the window when possible.
                if window_start > sent_start:
                    window_start = sent_start
                if window_start + MAX_CITATION_QUOTE_CHARS < sent_end:
                    window_start = max(0, sent_end - MAX_CITATION_QUOTE_CHARS)
            preserve_through = min(
                MAX_CITATION_QUOTE_CHARS, max(0, sent_end - window_start)
            )
            break

    window = cleaned[window_start : window_start + MAX_CITATION_QUOTE_CHARS]
    return _trim_citation_window(window, preserve_through=preserve_through)


def _field_value_query_text(value: object) -> str:
    """Normalize an extracted field value into query vocabulary text."""
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(str(item) for item in value if item)
    text = str(value).strip()
    return text


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
) -> tuple[list[Excerpt], set[str]]:
    """Rank paragraphs by query overlap and return top excerpts within budget.

    Score = |query_terms ∩ paragraph_terms| / sqrt(|query_terms|).
    Returns ``([], set())`` if chunks or query_terms are empty.

    The query-term set is returned alongside excerpts so citation quotes can
    window on the matched vocabulary rather than always truncating from the start.
    """
    if not chunks:
        return [], set()
    query_terms = build_section_query_terms(
        section_description,
        invention,
        query_fields,
    )
    if not query_terms:
        return [], set()

    denom = math.sqrt(len(query_terms))
    scored: list[Excerpt] = []
    for chunk in chunks:
        for location, paragraph in _split_located_paragraphs(chunk.text):
            para_terms = _words(paragraph)
            overlap = len(query_terms & para_terms)
            if overlap <= 0:
                continue
            score = overlap / denom
            scored.append(
                Excerpt(
                    label=chunk.label,
                    text=paragraph,
                    score=score,
                    location=location,
                )
            )

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
    return selected, query_terms


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
        location_suffix = f" · {excerpt.location}" if excerpt.location else ""
        lines.append(f"[Source: {excerpt.label}{location_suffix}]")
        lines.append(excerpt.text)
        lines.append("")
    return "\n\n" + "\n".join(lines).rstrip() + "\n"


def citations_from_excerpts(
    excerpts: list[Excerpt],
    query_terms: set[str] | None = None,
) -> list[dict]:
    """Build citation dicts with label, location, and a clean quote; dedupe triples.

    When ``query_terms`` is provided, quote windows prefer sentences that contain
    those terms so long paragraphs do not surface leading boilerplate.
    """
    seen: set[tuple[str, str, str]] = set()
    citations: list[dict] = []
    for excerpt in excerpts:
        quote = _citation_quote(excerpt.text, query_terms)
        if not quote:
            continue
        location = excerpt.location or ""
        key = (excerpt.label, location, quote)
        if key in seen:
            continue
        seen.add(key)
        citations.append(
            {
                "label": excerpt.label,
                "location": location,
                "excerpt": quote,
            }
        )
    return citations


def citations_for_fields(
    combined_text: str,
    fields: list[str],
    field_labels: dict[str, str],
    details: dict | None = None,
) -> dict[str, list[dict]]:
    """Build per-field citation lists using each field's label plus extracted value.

    The extracted value supplies the vocabulary that actually informed the answer,
    so retrieval prefers source paragraphs about that content rather than weak
    label-only overlaps with administrative boilerplate.
    """
    chunks = parse_source_chunks(combined_text)
    citations_by_field: dict[str, list[dict]] = {}
    if not chunks:
        return {field: [] for field in fields}
    details = details or {}
    for field in fields:
        label = field_labels.get(field, field)
        extracted_value = _field_value_query_text(details.get(field))
        description = f"{label} {extracted_value}" if extracted_value else label
        excerpts, query_terms = retrieve_relevant_excerpts(description, {}, chunks, [])
        citations_by_field[field] = citations_from_excerpts(excerpts, query_terms)
    return citations_by_field


def with_field_citations(
    combined_text: str,
    details: dict,
    field_labels: dict[str, str],
    fields: list[str] | None = None,
) -> dict:
    """Return ``details`` plus a ``citations`` map for the given (or all labeled) fields."""
    target_fields = list(fields) if fields is not None else list(field_labels.keys())
    return {
        **details,
        "citations": citations_for_fields(
            combined_text, target_fields, field_labels, details
        ),
    }
