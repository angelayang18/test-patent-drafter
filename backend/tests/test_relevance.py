"""Tests for user relevance guidance formatting."""

from drafter.relevance import extraction_system_prompt, format_relevance_guidance


def test_format_relevance_guidance_empty():
    assert format_relevance_guidance("", "") == ""
    assert format_relevance_guidance("  ", "\n") == ""


def test_format_relevance_guidance_includes_both_sections():
    text = format_relevance_guidance(
        "RAG pipeline and embeddings",
        "Sales deck and HR wiki pages",
    )
    assert "Relevant" in text
    assert "RAG pipeline" in text
    assert "Irrelevant" in text
    assert "Sales deck" in text


def test_extraction_system_prompt_unchanged_without_guidance():
    base = "Base system."
    assert extraction_system_prompt(base, "", "") == base


def test_extraction_system_prompt_augmented_with_guidance():
    base = "Base system."
    augmented = extraction_system_prompt(base, "core ML", "")
    assert augmented.startswith(base)
    assert "relevant" in augmented.lower()
