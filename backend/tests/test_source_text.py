"""Tests for extraction source text preparation."""

from drafter.source_text import prepare_source_text


def test_prepare_source_text_unchanged_when_short():
    text = "Short invention notes."
    assert prepare_source_text(text) == text


def test_prepare_source_text_truncates_long_input():
    text = "A" * 200_000
    result = prepare_source_text(text)
    assert len(result) < len(text)
    assert "omitted" in result
    assert result.startswith("A")
