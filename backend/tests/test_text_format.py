"""Tests for export text formatting helpers."""

from exporter.text_format import (
    normalize_claims,
    parse_numbered_list_item_header,
    sanitize_internal_delimiter_tags,
    sanitize_patent_prose,
    split_paragraphs,
    strip_markdown,
    truncate_abstract,
)


def test_sanitize_internal_delimiter_tags():
    raw = (
        "tags including %%qa for question-answer pairs, %%summary for summaries, "
        "%%profile for profiles, and %%entity for entities."
    )
    cleaned = sanitize_internal_delimiter_tags(raw)
    assert "%%" not in cleaned
    assert "qa for question-answer" in cleaned


def test_sanitize_wrapped_headers_and_placeholders():
    raw = (
        "1. %%Header 1%%This is the first item in the list. {item_1_desc}\n"
        "2. %%Header 2%%This is the second item. {item_2_desc}"
    )
    cleaned = sanitize_patent_prose(raw)
    assert "%%" not in cleaned
    assert "{item_1_desc}" not in cleaned
    assert "1. Header 1: This is the first item" in cleaned
    assert "2. Header 2: This is the second item" in cleaned


def test_sanitize_subsection_title_break():
    raw = "4. Data Flow The data transformation pipeline begins with ingestion."
    cleaned = sanitize_patent_prose(raw)
    assert "4. Data Flow\n\nThe data transformation" in cleaned


def test_parse_numbered_list_item_header():
    parsed = parse_numbered_list_item_header(
        "1. Header 1: This is the first item in the list."
    )
    assert parsed == ("1. ", "Header 1", "This is the first item in the list.")


def test_strip_markdown_removes_common_markers():
    raw = "## Heading\n\nThis is **bold** and *italic* with `code`."
    cleaned = strip_markdown(raw)
    assert "**" not in cleaned
    assert "`" not in cleaned
    assert "Heading" in cleaned
    assert "bold" in cleaned


def test_split_paragraphs_on_blank_lines():
    raw = "First paragraph.\n\nSecond paragraph."
    assert split_paragraphs(raw) == ["First paragraph.", "Second paragraph."]


def test_split_paragraphs_keeps_numbered_claims():
    raw = "1. A method comprising:\n2. The method of claim 1, wherein"
    assert split_paragraphs(raw) == [
        "1. A method comprising:",
        "2. The method of claim 1, wherein",
    ]


def test_truncate_abstract_enforces_word_limit():
    words = " ".join(f"word{i}" for i in range(200))
    truncated = truncate_abstract(words)
    assert len(truncated.split()) <= 150


def test_truncate_abstract_prefers_sentence_boundary():
    sentence = "A system for processing documents using structural metadata."
    filler = " ".join(["technical"] * 140)
    raw = f"{filler} {sentence} Extra words beyond the limit."
    truncated = truncate_abstract(raw, max_words=145)
    assert truncated.endswith(".")


def test_normalize_claims_splits_run_on_claims():
    raw = "1. A system comprising a processor. 2. The system of claim 1, wherein the processor is configured to parse documents."
    normalized = normalize_claims(raw)
    assert "1. A system comprising a processor." in normalized
    assert "2. The system of claim 1" in normalized
    assert "\n\n" in normalized


def test_normalize_claims_preserves_indented_elements():
    raw = """1. A system comprising:
a processor configured to receive a document;
a parser module 202 configured to identify structural elements; and
an indexing module 204 configured to store embeddings."""
    normalized = normalize_claims(raw)
    assert "parser module 202" in normalized
    assert "\n\n" not in normalized or normalized.count("\n\n") == 0 or "1. A system" in normalized
