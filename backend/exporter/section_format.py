"""USPTO-style section titles and formatting constants for patent export."""

from __future__ import annotations

SECTION_DISPLAY_ORDER = [
    "cross_reference",
    "field",
    "background",
    "summary",
    "brief_description_of_drawings",
    "description",
    "claims",
    "abstract",
]

# All-caps headings without "of the Invention" suffixes (matches sample filings).
SECTION_TITLES = {
    "cross_reference": "CROSS-REFERENCE TO RELATED APPLICATIONS",
    "field": "FIELD",
    "background": "BACKGROUND",
    "summary": "SUMMARY",
    "brief_description_of_drawings": "BRIEF DESCRIPTION OF THE DRAWINGS",
    "description": "DETAILED DESCRIPTION",
    "claims": "CLAIMS",
    "abstract": "ABSTRACT",
}

SECTIONS_REQUIRING_PAGE_BREAK_BEFORE = frozenset({"claims", "abstract"})
SECTIONS_REQUIRING_PAGE_BREAK_AFTER = frozenset({"claims"})

# Sections always included in export/preview even when not in the drafted sections dict.
STATIC_SECTION_KEYS = frozenset({"cross_reference"})


def cross_reference_body(filing_info: dict | None) -> str:
    """Return Cross-Reference to Related Applications text for export/preview."""
    if not filing_info:
        return "Not Applicable."
    related = str(filing_info.get("related_applications", "")).strip()
    if not related:
        return "Not Applicable."
    return related


def ordered_section_keys(sections: dict[str, str]) -> list[str]:
    """Return section keys in patent document order."""
    ordered = [
        key
        for key in SECTION_DISPLAY_ORDER
        if key in STATIC_SECTION_KEYS
        or (key in sections and sections[key].strip())
    ]
    for key in sections:
        if key not in ordered and sections[key].strip():
            ordered.append(key)
    return ordered


def section_heading(key: str) -> str:
    return SECTION_TITLES.get(key, key.replace("_", " ").upper())
