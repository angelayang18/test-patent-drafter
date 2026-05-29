"""Tests for USPTO section heading format."""

from exporter.section_format import (
    SECTION_TITLES,
    SECTIONS_REQUIRING_PAGE_BREAK_BEFORE,
    ordered_section_keys,
    section_heading,
)


def test_section_titles_are_uppercase_without_suffixes():
    assert SECTION_TITLES["field"] == "FIELD"
    assert SECTION_TITLES["background"] == "BACKGROUND"
    assert SECTION_TITLES["description"] == "DETAILED DESCRIPTION"
    assert SECTION_TITLES["claims"] == "CLAIMS"


def test_claims_and_abstract_require_page_breaks():
    assert "claims" in SECTIONS_REQUIRING_PAGE_BREAK_BEFORE
    assert "abstract" in SECTIONS_REQUIRING_PAGE_BREAK_BEFORE
    assert "summary" not in SECTIONS_REQUIRING_PAGE_BREAK_BEFORE


def test_ordered_section_keys_skips_empty_sections():
    sections = {
        "claims": "1. A system comprising...",
        "field": "   ",
        "summary": "Summary text.",
    }
    assert ordered_section_keys(sections) == ["summary", "claims"]


def test_section_heading_fallback():
    assert section_heading("custom_section") == "CUSTOM SECTION"
