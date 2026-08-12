"""Cross-check draft sections against Review-step invention requirements."""

from __future__ import annotations

import re

from exporter.text_format import sanitize_patent_prose

_STOP_WORDS = frozenset(
    {
        "about",
        "above",
        "after",
        "also",
        "among",
        "and",
        "are",
        "been",
        "being",
        "between",
        "both",
        "but",
        "can",
        "could",
        "each",
        "for",
        "from",
        "have",
        "into",
        "more",
        "other",
        "such",
        "than",
        "that",
        "the",
        "their",
        "them",
        "then",
        "there",
        "these",
        "they",
        "this",
        "through",
        "using",
        "were",
        "when",
        "where",
        "which",
        "while",
        "with",
        "within",
        "without",
    }
)

_MIN_TOKEN_LEN = 4
_PASS_RATIO = 0.45
_WARN_RATIO = 0.2


def _normalize_for_match(text: str) -> str:
    cleaned = sanitize_patent_prose(text).lower()
    cleaned = re.sub(r"[^a-z0-9\s]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _significant_tokens(text: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", _normalize_for_match(text))
    seen: set[str] = set()
    result: list[str] = []
    for token in tokens:
        if len(token) < _MIN_TOKEN_LEN or token in _STOP_WORDS or token in seen:
            continue
        seen.add(token)
        result.append(token)
    return result


def _truncate_quote(text: str, max_len: int = 100) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if len(cleaned) <= max_len:
        return cleaned
    return f"{cleaned[: max_len - 1].rstrip()}…"


def _coverage_status(requirement: str, section_text: str) -> str:
    """Return pass, warn, or fail based on token overlap between requirement and section."""
    requirement_tokens = _significant_tokens(requirement)
    if not requirement_tokens:
        req_norm = _normalize_for_match(requirement)
        sec_norm = _normalize_for_match(section_text)
        if req_norm and req_norm in sec_norm:
            return "pass"
        if req_norm:
            return "fail"
        return "warn"

    section_norm = _normalize_for_match(section_text)
    matched = sum(1 for token in requirement_tokens if token in section_norm)
    ratio = matched / len(requirement_tokens)
    if ratio >= _PASS_RATIO or (matched >= 2 and ratio >= _WARN_RATIO):
        return "pass"
    if matched >= 1:
        return "warn"
    return "fail"


def _alignment_entry(
    *,
    section: str,
    requirement: str,
    section_text: str,
    pass_message: str,
    fail_message: str,
    warn_empty_requirement: str,
    warn_inconclusive: str,
) -> dict:
    requirement = requirement.strip()
    if not requirement:
        return {
            "section": section,
            "status": "warn",
            "messages": [warn_empty_requirement],
        }

    if not section_text.strip():
        quote = _truncate_quote(requirement)
        return {
            "section": section,
            "status": "fail",
            "messages": [fail_message.format(quote=quote)],
        }

    status = _coverage_status(requirement, section_text)
    if status == "pass":
        return {"section": section, "status": "pass", "messages": [pass_message]}
    if status == "warn":
        quote = _truncate_quote(requirement)
        return {
            "section": section,
            "status": "warn",
            "messages": [warn_inconclusive.format(quote=quote)],
        }

    quote = _truncate_quote(requirement)
    return {
        "section": section,
        "status": "fail",
        "messages": [fail_message.format(quote=quote)],
    }


def _check_title_alignment(invention_title: str, sections: dict[str, str]) -> dict:
    title = invention_title.strip()
    if not title:
        return {
            "section": "title",
            "status": "warn",
            "messages": [
                "Cannot verify title alignment: invention title is empty in Review details.",
            ],
        }

    title_norm = _normalize_for_match(title)
    search_sections = [
        sections.get("summary", ""),
        sections.get("abstract", ""),
        sections.get("field", ""),
        *sections.values(),
    ]
    combined_norm = _normalize_for_match(" ".join(search_sections))
    if title_norm and title_norm in combined_norm:
        return {
            "section": "title",
            "status": "pass",
            "messages": ["Draft text references the stated invention title."],
        }

    status = _coverage_status(title, " ".join(search_sections))
    quote = _truncate_quote(title)
    if status == "pass":
        return {
            "section": "title",
            "status": "pass",
            "messages": ["Draft text references the stated invention title."],
        }
    if status == "warn":
        return {
            "section": "title",
            "status": "warn",
            "messages": [
                f"Title alignment is inconclusive — draft may not clearly reference "
                f"the stated invention title: '{quote}'.",
            ],
        }
    return {
        "section": "title",
        "status": "fail",
        "messages": [
            f"Draft does not appear to reference the stated invention title: '{quote}'.",
        ],
    }


_QA_CATEGORY_ALIGNMENT = "Alignment"


def get_invention_alignment_qa_report(
    sections: dict[str, str],
    invention: dict[str, object],
) -> list[dict]:
    """Return QA entries that compare draft sections to Review-step invention requirements."""
    report = [
        _check_title_alignment(str(invention.get("invention_title", "")), sections),
        _alignment_entry(
            section="background",
            requirement=str(invention.get("problem_being_solved", "")),
            section_text=sections.get("background", ""),
            pass_message="Background appears to address the stated technical problem.",
            fail_message=(
                "Background does not appear to address the stated technical problem: '{quote}'."
            ),
            warn_empty_requirement=(
                "Cannot verify background alignment: technical problem is empty in Review details."
            ),
            warn_inconclusive=(
                "Background may only partially address the stated technical problem: '{quote}'."
            ),
        ),
        _alignment_entry(
            section="description",
            requirement=str(invention.get("core_technical_solution", "")),
            section_text=sections.get("description", ""),
            pass_message="Detailed Description appears to cover the stated core technical solution.",
            fail_message=(
                "Detailed Description does not appear to cover the stated core technical "
                "solution: '{quote}'."
            ),
            warn_empty_requirement=(
                "Cannot verify detailed description alignment: core technical solution is empty "
                "in Review details."
            ),
            warn_inconclusive=(
                "Detailed Description may only partially cover the stated core technical "
                "solution: '{quote}'."
            ),
        ),
        _alignment_entry(
            section="claims",
            requirement=str(invention.get("novel_mechanism", "")),
            section_text=sections.get("claims", ""),
            pass_message="Claims appear to capture the stated novel mechanism.",
            fail_message=(
                "Claims do not appear to capture the stated novel mechanism: '{quote}'."
            ),
            warn_empty_requirement=(
                "Cannot verify claims alignment: novel mechanism is empty in Review details."
            ),
            warn_inconclusive=(
                "Claims may only partially capture the stated novel mechanism: '{quote}'."
            ),
        ),
    ]
    for entry in report:
        entry["category"] = _QA_CATEGORY_ALIGNMENT
    return report
