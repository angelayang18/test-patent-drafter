"""Tests for export text formatting helpers."""

from exporter.text_format import split_paragraphs, strip_markdown


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
