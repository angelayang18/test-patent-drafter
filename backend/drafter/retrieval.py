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
# Preview highlight target: full matched paragraph (not the 220-char list quote).
# Cap is a safety bound only; typical paragraphs are far smaller. Truncate on a
# sentence/word boundary if ever exceeded — never reuse the short quote budget.
MAX_FULL_CITATION_EXCERPT_CHARS = 4000

# Stricter budgets / gates for field citations (quality over weak matches).
MAX_CITATION_CANDIDATE_EXCERPTS = 12
MIN_WEIGHTED_CITATION_SCORE = 0.55
MIN_DISTINCTIVE_TERM_HITS = 2
# Sparse extracted values get non-generic label terms mixed in as anchors.
# Threshold is inclusive: 1–2 surviving value tokens still get label help.
_SPARSE_VALUE_TERM_THRESHOLD = 2
COVER_PAGE_SCORE_PENALTY = 0.45
# Must match drafter.extract_context.EMPTY_FIELD_FALLBACK (avoid circular import).
_EMPTY_FIELD_FALLBACK = "Not provided in the source documentation."

# Generic field-label nouns that latch onto cover pages ("Implementation Plan").
_GENERIC_LABEL_TERMS = frozenset(
    {
        "plan",
        "overview",
        "title",
        "statement",
        "section",
        "summary",
        "details",
        "description",
        "application",
        "document",
        "report",
        "field",
        "name",
        "background",
        "purpose",
        "scope",
        "work",
        "terms",
        "data",
    }
)

_COVER_PAGE_PHRASES = (
    "prepared by",
    "implementation plan",
    "internship",
    "working day",
    "platform expansion",
    "document drafter",
)

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
    """Lowercase tokens, strip stopwords, keep length >= 2.

    Length 2 is required so technical tokens (CV, AI, ng, ml) remain matchable
    for field citations; common English two-letter words are already stopwords.
    """
    return {
        w
        for w in _WORD_RE.findall(text.lower())
        if len(w) >= 2 and w not in _STOPWORDS
    }


def _looks_like_cover_page(text: str) -> bool:
    """Return True for title-page / admin header paragraphs."""
    lower = text.lower()
    hits = sum(1 for phrase in _COVER_PAGE_PHRASES if phrase in lower)
    return hits >= 2


def _paragraph_term_dfs(paragraphs: list[str]) -> tuple[dict[str, int], int]:
    """Document frequency of terms across paragraphs (each para is a 'doc')."""
    df: dict[str, int] = {}
    for paragraph in paragraphs:
        for term in _words(paragraph):
            df[term] = df.get(term, 0) + 1
    return df, len(paragraphs)


def _term_weight(term: str, df: dict[str, int], n_docs: int) -> float:
    """IDF × length bonus so rare / longer tokens dominate citation ranking."""
    if n_docs <= 0:
        idf = 1.0
    else:
        idf = math.log(1.0 + n_docs / (1.0 + df.get(term, 0)))
    length_bonus = 1.0 + max(0, len(term) - 5) * 0.15
    return idf * length_bonus


def _distinctive_query_terms(
    query_terms: set[str],
    df: dict[str, int],
    n_docs: int,
) -> set[str]:
    """Terms that are long or relatively rare in the passage corpus."""
    if not query_terms:
        return set()
    weights = {t: _term_weight(t, df, n_docs) for t in query_terms}
    if not weights:
        return set()
    median = sorted(weights.values())[len(weights) // 2]
    return {t for t, w in weights.items() if len(t) >= 6 or w >= median}


def _filter_generic_label_terms(terms: set[str]) -> set[str]:
    """Drop generic label nouns; keep the rest (or originals if all filtered)."""
    filtered = {t for t in terms if t not in _GENERIC_LABEL_TERMS}
    return filtered or terms


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


def _full_citation_excerpt(text: str) -> str:
    """Return the full matched paragraph for preview highlighting.

    Uses the complete paragraph (whitespace-collapsed) rather than the 220-char
    list quote. ``MAX_FULL_CITATION_EXCERPT_CHARS`` is only a safety bound; when
    hit, truncate on a sentence or word boundary so highlights do not end mid-word.
    """
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        return ""
    if len(cleaned) <= MAX_FULL_CITATION_EXCERPT_CHARS:
        return cleaned

    window = cleaned[:MAX_FULL_CITATION_EXCERPT_CHARS]
    best_end = -1
    min_cut = MAX_FULL_CITATION_EXCERPT_CHARS // 3
    for sep in (". ", "? ", "! "):
        idx = window.rfind(sep)
        if idx >= min_cut:
            best_end = max(best_end, idx + 1)
    if best_end > 0:
        return window[:best_end].rstrip()
    space_idx = window.rfind(" ")
    if space_idx > MAX_FULL_CITATION_EXCERPT_CHARS // 2:
        return window[:space_idx].rstrip() + "…"
    return window.rstrip() + "…"


def _field_value_query_text(value: object) -> str:
    """Normalize an extracted field value into query vocabulary text.

    Empty-field fallback placeholders are treated as absent so they do not
    latch onto generic phrases like "source documentation".
    """
    if value is None:
        return ""
    if isinstance(value, list):
        parts = [
            str(item).strip()
            for item in value
            if item and str(item).strip() and str(item).strip() != _EMPTY_FIELD_FALLBACK
        ]
        return " ".join(parts)
    text = str(value).strip()
    if text == _EMPTY_FIELD_FALLBACK:
        return ""
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
    *,
    max_excerpts: int | None = None,
    max_chars: int | None = None,
    weighted: bool = False,
    demote_cover_pages: bool = False,
    min_score: float = 0.0,
    query_terms_override: set[str] | None = None,
) -> tuple[list[Excerpt], set[str]]:
    """Rank paragraphs by query overlap and return top excerpts within budget.

    Default score = |query ∩ para| / sqrt(|query|).
    When ``weighted`` is True, use IDF × length-weighted overlap (citation mode).

    Returns ``([], set())`` if chunks or query_terms are empty.
    """
    if not chunks:
        return [], set()
    query_terms = (
        query_terms_override
        if query_terms_override is not None
        else build_section_query_terms(
            section_description,
            invention,
            query_fields,
        )
    )
    if not query_terms:
        return [], set()

    located: list[tuple[str, str, str]] = []
    for chunk in chunks:
        for location, paragraph in _split_located_paragraphs(chunk.text):
            located.append((chunk.label, location, paragraph))

    paragraphs = [p for _, _, p in located]
    df, n_docs = _paragraph_term_dfs(paragraphs) if weighted else ({}, 0)
    denom = math.sqrt(len(query_terms)) or 1.0

    scored: list[Excerpt] = []
    for label, location, paragraph in located:
        para_terms = _words(paragraph)
        overlap_terms = query_terms & para_terms
        if not overlap_terms:
            continue

        if weighted:
            score = sum(_term_weight(t, df, n_docs) for t in overlap_terms) / denom
            distinctive = _distinctive_query_terms(query_terms, df, n_docs)
            distinctive_hits = len(overlap_terms & distinctive) if distinctive else 0
            # Cap required hits at available distinctive terms so single-token
            # values like "ELISA" / "MSD" are not impossible to cite.
            required_hits = min(MIN_DISTINCTIVE_TERM_HITS, len(distinctive))
            if (
                distinctive
                and distinctive_hits < required_hits
                and score < MIN_WEIGHTED_CITATION_SCORE
            ):
                continue
        else:
            score = len(overlap_terms) / denom

        if demote_cover_pages and _looks_like_cover_page(paragraph):
            score *= COVER_PAGE_SCORE_PENALTY

        if score < min_score:
            continue

        scored.append(
            Excerpt(
                label=label,
                text=paragraph,
                score=score,
                location=location,
            )
        )

    scored.sort(key=lambda e: e.score, reverse=True)

    excerpt_limit = MAX_EXCERPTS_PER_SECTION if max_excerpts is None else max_excerpts
    char_limit = MAX_EXCERPT_CHARS_PER_SECTION if max_chars is None else max_chars

    selected: list[Excerpt] = []
    total_chars = 0
    for excerpt in scored:
        if len(selected) >= excerpt_limit:
            break
        if total_chars + len(excerpt.text) > char_limit and selected:
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
    *,
    require_distinctive: set[str] | None = None,
) -> list[dict]:
    """Build citation dicts with label, location, and a clean quote; dedupe triples.

    When ``query_terms`` is provided, quote windows prefer sentences that contain
    those terms so long paragraphs do not surface leading boilerplate.

    When ``require_distinctive`` is set, skip quotes that share none of those terms
    (avoids cover-page truncations that never mention the extracted evidence).
    """
    seen: set[tuple[str, str, str]] = set()
    citations: list[dict] = []
    for excerpt in excerpts:
        quote = _citation_quote(excerpt.text, query_terms)
        if not quote:
            continue
        if require_distinctive and not (_words(quote) & require_distinctive):
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
                # Full paragraph for SourceTextPreviewModal highlighting; list UI
                # continues to show the short ``excerpt`` quote.
                "full_excerpt": _full_citation_excerpt(excerpt.text),
            }
        )
    return citations


def _field_citation_query_terms(label: str, extracted_value: str) -> set[str]:
    """Build citation query terms from value + non-generic label anchors.

    Prefer extracted-value vocabulary. When the value tokenizes to nothing
    (e.g. ``%CV under 20%`` after stopword/length filters) or is very sparse,
    mix in scrubbed label terms so fields with real source support still cite.
    Generic label nouns alone are never enough to revive a cover-page latch.
    """
    label_terms = _filter_generic_label_terms(_words(label))
    if not extracted_value.strip():
        return label_terms
    value_terms = _words(extracted_value)
    if not value_terms:
        return label_terms
    if len(value_terms) <= _SPARSE_VALUE_TERM_THRESHOLD:
        return value_terms | label_terms
    return value_terms


def citations_for_fields(
    combined_text: str,
    fields: list[str],
    field_labels: dict[str, str],
    details: dict | None = None,
) -> dict[str, list[dict]]:
    """Build per-field citation lists using extracted values as primary vocabulary.

    Extracted values drive the query; non-generic label terms are mixed in only
    when the value is absent or tokenizes too sparsely (keeps symbol-heavy ADA
    metrics and short names citable without reviving cover-page latching).
    Weak / cover-page-only matches are omitted rather than shown.
    """
    chunks = parse_source_chunks(combined_text)
    citations_by_field: dict[str, list[dict]] = {}
    if not chunks:
        return {field: [] for field in fields}
    details = details or {}
    for field in fields:
        label = field_labels.get(field, field)
        extracted_value = _field_value_query_text(details.get(field))
        query_terms = _field_citation_query_terms(label, extracted_value)
        if not query_terms:
            citations_by_field[field] = []
            continue

        # Collect candidate paragraphs for IDF / distinctive-term gating.
        all_paragraphs: list[str] = []
        for chunk in chunks:
            all_paragraphs.extend(p for _, p in _split_located_paragraphs(chunk.text))
        df, n_docs = _paragraph_term_dfs(all_paragraphs)
        distinctive = _distinctive_query_terms(query_terms, df, n_docs)

        # Value-backed queries keep a score floor; label-only / sparse fallbacks
        # rely on distinctive-term gating + cover-page demotion instead.
        value_term_count = len(_words(extracted_value))
        use_value_floor = value_term_count > _SPARSE_VALUE_TERM_THRESHOLD
        excerpts, _ = retrieve_relevant_excerpts(
            "",
            {},
            chunks,
            [],
            max_excerpts=MAX_CITATION_CANDIDATE_EXCERPTS,
            weighted=True,
            demote_cover_pages=True,
            min_score=MIN_WEIGHTED_CITATION_SCORE if use_value_floor else 0.0,
            query_terms_override=query_terms,
        )
        citations_by_field[field] = citations_from_excerpts(
            excerpts,
            query_terms,
            require_distinctive=distinctive if use_value_floor else None,
        )
    return citations_by_field


def citations_for_generic_title(
    combined_text: str,
    document_type_label: str,
    title: str,
) -> list[dict]:
    """Citations for a custom type's title, using the label + current title as query vocabulary.

    No LLM call — pure retrieval, safe to run on every title change, not just on suggestion.
    """
    chunks = parse_source_chunks(combined_text)
    if not chunks:
        return []
    description = f"{document_type_label} title {title}".strip()
    excerpts, query_terms = retrieve_relevant_excerpts(description, {}, chunks, [])
    return citations_from_excerpts(excerpts, query_terms)


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
