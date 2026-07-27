"""Tests for labeled source chunk parsing."""

from drafter.source_chunks import SourceChunk, parse_source_chunks


def test_parse_multiple_labeled_chunks():
    text = (
        "--- notes.pdf ---\n"
        "First source body about prior art.\n\n"
        "--- https://example.com ---\n"
        "Second source body about the mechanism.\n"
    )
    chunks = parse_source_chunks(text)
    assert len(chunks) == 2
    assert chunks[0] == SourceChunk(
        label="notes.pdf",
        text="First source body about prior art.",
    )
    assert chunks[1] == SourceChunk(
        label="https://example.com",
        text="Second source body about the mechanism.",
    )


def test_parse_no_header_falls_back_to_source_material():
    text = "Plain pasted invention notes without headers."
    chunks = parse_source_chunks(text)
    assert chunks == [
        SourceChunk(label="Source material", text=text),
    ]


def test_parse_empty_string_returns_empty_list():
    assert parse_source_chunks("") == []
    assert parse_source_chunks("   \n  ") == []


def test_parse_skips_header_with_empty_body():
    text = (
        "--- empty.pdf ---\n"
        "\n"
        "--- filled.pdf ---\n"
        "Actual content here.\n"
    )
    chunks = parse_source_chunks(text)
    assert len(chunks) == 1
    assert chunks[0].label == "filled.pdf"
    assert chunks[0].text == "Actual content here."
