"""USPTO-style section titles and formatting constants for patent export."""

from __future__ import annotations

SECTION_DISPLAY_ORDER = [
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
    "field": "FIELD",
    "background": "BACKGROUND",
    "summary": "SUMMARY",
    "brief_description_of_drawings": "BRIEF DESCRIPTION OF THE DRAWINGS",
    "description": "DETAILED DESCRIPTION",
    "claims": "CLAIMS",
    "abstract": "ABSTRACT",
}

SECTIONS_REQUIRING_PAGE_BREAK_BEFORE = frozenset({"claims", "abstract"})


def section_heading(key: str) -> str:
    return SECTION_TITLES.get(key, key.replace("_", " ").upper())


def ordered_section_keys(sections: dict[str, str]) -> list[str]:
    """Return section keys in patent document order."""
    ordered = [
        key
        for key in SECTION_DISPLAY_ORDER
        if key in sections and sections[key].strip()
    ]
    for key in sections:
        if key not in ordered and sections[key].strip():
            ordered.append(key)
    return ordered
