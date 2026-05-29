"""Tests for Mermaid PNG rendering helpers."""

from exporter.mermaid_render import apply_patent_mermaid_theme, sanitize_mermaid_for_headless


def test_sanitize_ampersands_in_labels():
    source = 'flowchart TB\nA["Tokenize & Extract"] --> B["Dense & Sparse"]'
    assert " and " in sanitize_mermaid_for_headless(source)
    assert "&" not in sanitize_mermaid_for_headless(source)


def test_apply_theme_sanitizes_before_init():
    source = 'flowchart TB\nA["Tags & Taxonomy"] --> B["Done"]'
    themed = apply_patent_mermaid_theme(source)
    assert "Tags and Taxonomy" in themed
    assert themed.startswith("%%{init:")
