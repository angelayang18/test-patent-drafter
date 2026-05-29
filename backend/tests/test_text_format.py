"""Tests for export text formatting helpers."""

from exporter.text_format import (
    parse_numbered_list_item_header,
    sanitize_internal_delimiter_tags,
    sanitize_patent_prose,
    split_paragraphs,
    strip_markdown,
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
