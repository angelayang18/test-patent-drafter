"""Convert LLM section text into clean plain text for Word/PDF export."""

from __future__ import annotations

import re

from drafter.prompts import PATENT_SECTIONS
from drafter.review_field_sources import (
    ADA_REVIEW_FIELD_LABELS,
    GRANT_REVIEW_FIELD_LABELS,
    PATENT_REVIEW_FIELD_LABELS,
    SOW_REVIEW_FIELD_LABELS,
)

_HEADING_RE = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)")
_INLINE_CODE_RE = re.compile(r"`([^`]+)`")
_BULLET_RE = re.compile(r"^[\-*•]\s+", re.MULTILINE)
_ORDERED_BULLET_RE = re.compile(r"^\d+\.\s+", re.MULTILINE)
# Paired internal markers from source docs: %%Header 1%%, %%summary%%, etc.
_WRAPPED_INTERNAL_TAG_RE = re.compile(r"%%([^%]+)%%\s*")
# Bare chunk tags: %%qa (when not wrapped).
_INTERNAL_DELIMITER_TAG_RE = re.compile(r"%%([a-zA-Z][a-zA-Z0-9_]*)")
# Template placeholders copied from source templates: {item_1_desc}, {foo_bar}.
_TEMPLATE_PLACEHOLDER_RE = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")
# Subsection titles run into the next sentence: "4. Data Flow The pipeline..."
_SUBSECTION_TITLE_RUN_IN_RE = re.compile(
    r"(^|\n)(\d+\.\s+)"
    r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5})"
    r"(\s+)(?=(?:The|A|An|Each|This|Unlike|Upon|In|Each|Where)\s)",
    re.MULTILINE,
)
# Numbered list item with a short title before the body: "1. Header 1: body..."
_LIST_ITEM_WITH_TITLE_RE = re.compile(r"^(\d+\.\s+)([^:]+):\s+(.+)$", re.DOTALL)
# Detailed-description sub-heading with em dash: "1. System Overview — body..."
_LIST_ITEM_WITH_EMDASH_TITLE_RE = re.compile(
    r"^(\d+\.\s+)(.+?)\s*[—–-]\s*(.+)$",
    re.DOTALL,
)
_CLAIM_COMPRISE_RE = re.compile(r"\bcomprising\s*:", re.IGNORECASE)
_CLAIM_NUMBER_RE = re.compile(r"^\d+\.\s+")
_CLAIM_ELEMENT_LINE_RE = re.compile(r"^\s{2,}\S")
_ABSTRACT_MAX_WORDS = 150
_FIG_BRIEF_START_RE = re.compile(r"FIG\.\s*\d+\s+is\s+", re.IGNORECASE)

# Standard technical acronyms — lowercase key maps to preferred form in claims/prose.
_TECHNICAL_ACRONYMS: dict[str, str] = {
    "ai": "AI",
    "api": "API",
    "ascii": "ASCII",
    "bm25": "BM25",
    "cpu": "CPU",
    "csv": "CSV",
    "cuda": "CUDA",
    "dns": "DNS",
    "gpu": "GPU",
    "html": "HTML",
    "http": "HTTP",
    "https": "HTTPS",
    "iot": "IoT",
    "ip": "IP",
    "jpeg": "JPEG",
    "json": "JSON",
    "jwt": "JWT",
    "lanczos": "LANCZOS",
    "llm": "LLM",
    "ml": "ML",
    "nlp": "NLP",
    "ocr": "OCR",
    "pdf": "PDF",
    "png": "PNG",
    "rag": "RAG",
    "ram": "RAM",
    "rest": "REST",
    "sdk": "SDK",
    "sql": "SQL",
    "tcp": "TCP",
    "tiff": "TIFF",
    "url": "URL",
    "utf": "UTF",
    "uuid": "UUID",
    "vllm": "vLLM",
    "xml": "XML",
}


def truncate_abstract(text: str, max_words: int = _ABSTRACT_MAX_WORDS) -> str:
    """Trim abstract to USPTO word limit, preferring sentence boundaries."""
    cleaned = sanitize_patent_prose(text).replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split()
    if len(words) <= max_words:
        return cleaned

    truncated = " ".join(words[:max_words])
    last_period = truncated.rfind(".")
    if last_period > len(truncated) * 0.6:
        return truncated[: last_period + 1].strip()
    return f"{truncated.rstrip(' ,;')}."


def capitalize_technical_acronyms(text: str) -> str:
    """Normalize common technical acronyms to their standard capitalized forms."""
    if not text:
        return text
    result = text
    for lower, proper in _TECHNICAL_ACRONYMS.items():
        result = re.sub(rf"\b{re.escape(lower)}\b", proper, result, flags=re.IGNORECASE)
    return result


def normalize_brief_description_of_drawings(text: str) -> str:
    """
    Format Brief Description of the Drawings as one sentence per figure.

    USPTO samples list each FIG. N sentence on its own line with blank lines between.
    """
    cleaned = sanitize_patent_prose(text).strip()
    if not cleaned:
        return cleaned

    parts = re.split(r"(?=FIG\.\s*\d+\s+is\s+)", cleaned, flags=re.IGNORECASE)
    sentences = [part.strip() for part in parts if part.strip()]
    if len(sentences) >= 2:
        return "\n\n".join(sentences)

    lines = [line.strip() for line in cleaned.split("\n") if line.strip()]
    fig_lines = [line for line in lines if _FIG_BRIEF_START_RE.match(line)]
    if len(fig_lines) >= 2:
        return "\n\n".join(fig_lines)

    return cleaned


def split_brief_description_paragraphs(text: str) -> list[str]:
    """Split brief description text into one paragraph per figure sentence."""
    normalized = normalize_brief_description_of_drawings(text)
    if not normalized:
        return []
    return [part.strip() for part in re.split(r"\n\s*\n", normalized) if part.strip()]


def _expand_claim_block_lines(lines: list[str]) -> list[str]:
    """
    Split semicolon-joined claim elements onto separate indented lines.

    Fixes run-on method steps like 'appending...; transforming...; and executing...'
    on a single line.
    """
    if not lines:
        return lines

    result = [lines[0]]
    for line in lines[1:]:
        stripped = line.strip()
        if not stripped:
            continue
        if ";" not in stripped or re.search(r";\s*and\s*$", stripped, re.IGNORECASE):
            result.append(f"   {stripped.lstrip()}")
            continue

        parts = re.split(r";\s+", stripped)
        for index, part in enumerate(parts):
            part = part.strip()
            if not part:
                continue
            if index < len(parts) - 1:
                part = part.rstrip(";") + ";"
            else:
                part = part.rstrip(";")
            result.append(f"   {part}")
    return result


def _ensure_claim_element_punctuation(lines: list[str]) -> list[str]:
    """
    Ensure independent-claim element lines use semicolons between elements.

    USPTO sample format requires each element after 'comprising:' to end with ';'
    except the final element, which ends with '.' (often prefixed with 'and').
    """
    if len(lines) <= 1:
        return lines

    if not _CLAIM_COMPRISE_RE.search(lines[0]):
        return lines

    elements = [line.strip().lstrip() for line in lines[1:] if line.strip()]
    if not elements:
        return lines

    normalized_elements: list[str] = []
    for index, element in enumerate(elements):
        cleaned = element.rstrip()
        is_last = index == len(elements) - 1
        is_penultimate = index == len(elements) - 2
        if is_last:
            cleaned = cleaned.rstrip(";,")
            if not cleaned.endswith("."):
                cleaned = f"{cleaned}."
        elif is_penultimate:
            last_element = elements[-1]
            if re.match(r"^and\s+", last_element, flags=re.IGNORECASE):
                cleaned = cleaned.rstrip(".,")
                if not cleaned.endswith(";"):
                    cleaned = f"{cleaned};"
            else:
                cleaned = re.sub(r";\s*and\s*$", "", cleaned.rstrip(".,"), flags=re.IGNORECASE)
                cleaned = re.sub(r"\band\s*$", "", cleaned.rstrip(".,"), flags=re.IGNORECASE)
                cleaned = cleaned.rstrip(";").strip()
                cleaned = f"{cleaned}; and"
        else:
            cleaned = cleaned.rstrip(".,")
            if not cleaned.endswith(";"):
                cleaned = f"{cleaned};"
        normalized_elements.append(f"   {cleaned}")

    return [lines[0], *normalized_elements]


def _follows_comprising_preamble(current_lines: list[str]) -> bool:
    """True when the current claim block is a multi-element comprising claim."""
    return bool(current_lines) and bool(_CLAIM_COMPRISE_RE.search(current_lines[0]))


def normalize_claims(text: str) -> str:
    """
    Normalize claim formatting: one claim per block, blank lines between claims,
    indented element lines preserved.
    """
    cleaned = sanitize_patent_prose(text)
    if not cleaned:
        return cleaned

    lines = cleaned.split("\n")
    claims: list[str] = []
    current_lines: list[str] = []

    def flush_claim() -> None:
        if not current_lines:
            return
        expanded = _ensure_claim_element_punctuation(
            _expand_claim_block_lines(current_lines)
        )
        claim_text = "\n".join(expanded).strip()
        if claim_text:
            claims.append(claim_text)
        current_lines.clear()

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current_lines:
                flush_claim()
            continue

        if _CLAIM_NUMBER_RE.match(stripped):
            if current_lines:
                flush_claim()
            current_lines.append(stripped)
        elif _CLAIM_ELEMENT_LINE_RE.match(line) or (
            _follows_comprising_preamble(current_lines)
            and not _CLAIM_NUMBER_RE.match(stripped)
        ) or (current_lines and stripped.endswith(";")):
            current_lines.append(f"   {stripped.lstrip()}")
        elif current_lines:
            current_lines[-1] = f"{current_lines[-1]} {stripped}"
        else:
            current_lines.append(stripped)

    flush_claim()

    if len(claims) <= 1 and not any("\n" in claim for claim in claims):
        # Fallback: split run-on claims like "1. ... 2. ..."
        single = claims[0] if claims else cleaned
        parts = re.split(r"(?<=\.)\s+(?=\d+\.\s+)", single)
        if len(parts) > 1:
            claims = [part.strip() for part in parts if part.strip()]

    return "\n\n".join(claims)


def count_claims(text: str) -> int:
    """Return the number of numbered claims in the text."""
    normalized = normalize_claims(text)
    if not normalized:
        return 0
    return len(re.findall(r"^\d+\.\s+", normalized, flags=re.MULTILINE))


def validate_claim_count(text: str) -> list[str]:
    """Return errors when claims are missing or not consecutively numbered from 1."""
    errors: list[str] = []
    normalized = normalize_claims(text)
    if not normalized:
        return ["No claims were found in the output."]

    numbers = [int(match.group(1)) for match in re.finditer(r"^(\d+)\.\s+", normalized, flags=re.MULTILINE)]
    if not numbers:
        return ["No numbered claims were found in the output."]

    expected = list(range(1, len(numbers) + 1))
    if numbers != expected:
        missing = [str(n) for n in expected if n not in numbers]
        if missing:
            errors.append(
                "Claims must be numbered consecutively in Arabic numerals from 1 — "
                "missing claim(s): "
                + ", ".join(missing)
                + "."
            )
        extra = [str(n) for n in numbers if n not in expected]
        if extra and not missing:
            errors.append(
                "Claims must be numbered consecutively in Arabic numerals from 1 — "
                "unexpected numbering: "
                + ", ".join(str(n) for n in numbers)
                + "."
            )

    return errors


def validate_abstract_word_count(text: str, max_words: int = _ABSTRACT_MAX_WORDS) -> list[str]:
    """Return errors when abstract exceeds the USPTO word limit."""
    cleaned = sanitize_patent_prose(text).replace("\n", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    words = cleaned.split()
    if len(words) > max_words:
        return [
            f"Abstract exceeds {max_words} words (found {len(words)}). "
            "Shorten while preserving the core technical disclosure."
        ]
    if not words:
        return ["Abstract is empty."]
    return []


def validate_section_output(section: str, text: str) -> list[str]:
    """Return validation errors for a generated section before export."""
    if section == "claims":
        return validate_claim_count(text)
    if section == "abstract":
        return validate_abstract_word_count(text)
    if not text.strip():
        return [f"The {section} section is empty."]
    return []


_EMPTY_SECTION_MESSAGE = "Section is empty."
_INSUFFICIENT_SOURCE_MESSAGE = (
    "This section states the source material was insufficient — review before filing."
)
_QA_CATEGORY_FORMAT = "Format"

# Section id → Review-tab field label(s) most likely to fill sparse source material.
# Labels match ``*_REVIEW_FIELD_LABELS`` in ``drafter.review_field_sources`` exactly.
# Unmapped sections intentionally keep the generic insufficient-source message.
PATENT_SECTION_SOURCE_HINTS: dict[str, list[str]] = {
    "field": [PATENT_REVIEW_FIELD_LABELS["technical_field"]],
    "background": [PATENT_REVIEW_FIELD_LABELS["problem_being_solved"]],
    "summary": [
        PATENT_REVIEW_FIELD_LABELS["core_technical_solution"],
        PATENT_REVIEW_FIELD_LABELS["novel_mechanism"],
    ],
    "description": [
        PATENT_REVIEW_FIELD_LABELS["core_technical_solution"],
        PATENT_REVIEW_FIELD_LABELS["key_components"],
    ],
    "claims": [
        PATENT_REVIEW_FIELD_LABELS["core_technical_solution"],
        PATENT_REVIEW_FIELD_LABELS["novel_mechanism"],
    ],
    "abstract": [PATENT_REVIEW_FIELD_LABELS["core_technical_solution"]],
}

GRANT_SECTION_SOURCE_HINTS: dict[str, list[str]] = {
    "executive_summary": [
        GRANT_REVIEW_FIELD_LABELS["problem_statement"],
        GRANT_REVIEW_FIELD_LABELS["proposed_solution"],
    ],
    "problem_statement": [GRANT_REVIEW_FIELD_LABELS["problem_statement"]],
    "project_description": [
        GRANT_REVIEW_FIELD_LABELS["proposed_solution"],
        GRANT_REVIEW_FIELD_LABELS["innovation_and_impact"],
    ],
    "methodology": [GRANT_REVIEW_FIELD_LABELS["proposed_solution"]],
    "evaluation": [GRANT_REVIEW_FIELD_LABELS["evaluation_plan"]],
    "budget_narrative": [GRANT_REVIEW_FIELD_LABELS["budget_overview"]],
    "organizational_capacity": [GRANT_REVIEW_FIELD_LABELS["team_qualifications"]],
}

SOW_SECTION_SOURCE_HINTS: dict[str, list[str]] = {
    "purpose": [SOW_REVIEW_FIELD_LABELS["purpose_and_background"]],
    "objectives": [SOW_REVIEW_FIELD_LABELS["objectives"]],
    "scope_of_work": [SOW_REVIEW_FIELD_LABELS["scope_of_work"]],
    "deliverables": [SOW_REVIEW_FIELD_LABELS["deliverables"]],
    "development_areas_effort_schedule": [SOW_REVIEW_FIELD_LABELS["timeline_and_effort"]],
    "responsibilities_required_inputs": [
        SOW_REVIEW_FIELD_LABELS["responsibilities_and_inputs"],
    ],
    "commercial_terms": [SOW_REVIEW_FIELD_LABELS["commercial_terms"]],
}

ADA_SECTION_SOURCE_HINTS: dict[str, list[str]] = {
    "study_overview": [
        ADA_REVIEW_FIELD_LABELS["study_title"],
        ADA_REVIEW_FIELD_LABELS["study_objective"],
    ],
    "method_summary": [ADA_REVIEW_FIELD_LABELS["assay_platform"]],
    "study_samples": [ADA_REVIEW_FIELD_LABELS["sample_matrix"]],
    "cut_point_determination": [ADA_REVIEW_FIELD_LABELS["cut_point_methodology"]],
    "sensitivity": [ADA_REVIEW_FIELD_LABELS["sensitivity_data"]],
    "specificity_selectivity": [ADA_REVIEW_FIELD_LABELS["specificity_data"]],
    "precision_reproducibility_robustness": [ADA_REVIEW_FIELD_LABELS["precision_data"]],
    "stability": [ADA_REVIEW_FIELD_LABELS["stability_data"]],
    "sample_analysis_results": [ADA_REVIEW_FIELD_LABELS["results_summary"]],
    "data_analysis_conclusion": [ADA_REVIEW_FIELD_LABELS["results_summary"]],
}

_SECTION_SOURCE_HINTS_BY_DOCUMENT_TYPE: dict[str, dict[str, list[str]]] = {
    "patent": PATENT_SECTION_SOURCE_HINTS,
    "grant": GRANT_SECTION_SOURCE_HINTS,
    "sow": SOW_SECTION_SOURCE_HINTS,
    "ada": ADA_SECTION_SOURCE_HINTS,
}

# Phrases the section agents are instructed to emit when source material is too sparse.
_INSUFFICIENT_SOURCE_PATTERNS = (
    re.compile(r"does\s+not\s+provide\s+sufficient\s+detail", re.IGNORECASE),
    re.compile(r"insufficient\s+(?:detail|documentation|source|information|material)", re.IGNORECASE),
    re.compile(r"source\s+material\s+(?:was\s+|is\s+)?insufficient", re.IGNORECASE),
    re.compile(r"too\s+sparse\s+to\s+(?:describe|draft)", re.IGNORECASE),
    re.compile(r"not\s+enough\s+(?:detail|information|documentation)\s+to\s+draft", re.IGNORECASE),
)


def _has_insufficient_source_language(text: str) -> bool:
    """Return True when section text admits source material was insufficient to draft."""
    return any(pattern.search(text) for pattern in _INSUFFICIENT_SOURCE_PATTERNS)


def _format_review_field_hint_phrase(field_labels: list[str]) -> str:
    """Format Review field label(s) for the actionable insufficient-source message."""
    if len(field_labels) == 1:
        return f"the {field_labels[0]} field"
    if len(field_labels) == 2:
        return f"the {field_labels[0]} and {field_labels[1]} fields"
    # Defensive: hint maps are capped at two fields, but keep wording correct.
    leading = ", ".join(field_labels[:-1])
    return f"the {leading}, and {field_labels[-1]} fields"


def _insufficient_source_message(section: str, document_type: str) -> str:
    """Return insufficient-source warning, with Review-tab field hint when mapped."""
    hints = _SECTION_SOURCE_HINTS_BY_DOCUMENT_TYPE.get(document_type, {}).get(section)
    if not hints:
        return _INSUFFICIENT_SOURCE_MESSAGE
    fields_phrase = _format_review_field_hint_phrase(hints)
    return (
        f"{_INSUFFICIENT_SOURCE_MESSAGE} "
        f"Try adding more detail to {fields_phrase} on the Review tab, "
        f"or uploading a source document that covers it."
    )


def _ordered_section_keys(
    sections: dict[str, str],
    canonical_sections: list[str] | None = None,
) -> list[str]:
    """Order keys for QA: canonical list first, then any extra payload keys.

    Defaults to PATENT_SECTIONS so patent callers keep full-coverage empty checks
    even when the client omits untouched section keys. Grant/SOW pass their own
    canonical lists so they are not padded with patent section ids.
    """
    ordered = list(canonical_sections if canonical_sections is not None else PATENT_SECTIONS)
    known = set(ordered)
    for key in sections:
        if key not in known:
            ordered.append(key)
    return ordered


def get_format_qa_report(
    sections: dict[str, str],
    *,
    canonical_sections: list[str] | None = None,
    document_type: str = "patent",
) -> list[dict]:
    """Run format validation on each draft section and summarize pass/warn/fail status.

    Generic over ``dict[str, str]``. Patent-specific claim/abstract validators only
    apply when those section keys are present. Pass ``canonical_sections`` for
    non-patent document types (e.g. grant/SOW) so missing patent keys are not warned.

    ``document_type`` selects Review-tab field hints for insufficient-source warnings
    (``patent``, ``grant``, ``sow``, or ``ada``).
    """
    report: list[dict] = []

    for section in _ordered_section_keys(sections, canonical_sections):
        text = sections.get(section, "")
        if not text or not text.strip():
            report.append(
                {
                    "section": section,
                    "category": _QA_CATEGORY_FORMAT,
                    "status": "warn",
                    "messages": [_EMPTY_SECTION_MESSAGE],
                }
            )
            continue

        messages = list(validate_section_output(section, text))
        has_format_errors = bool(messages)
        if _has_insufficient_source_language(text):
            messages.append(_insufficient_source_message(section, document_type))

        if has_format_errors:
            status = "fail"
        elif messages:
            status = "warn"
        else:
            status = "pass"

        report.append(
            {
                "section": section,
                "category": _QA_CATEGORY_FORMAT,
                "status": status,
                "messages": messages,
            }
        )

    return report


def normalize_claims_text(text: str) -> str:
    """Normalize claim formatting and standardize technical acronym capitalization."""
    return capitalize_technical_acronyms(normalize_claims(text))


def prepare_sections_for_export(sections: dict[str, str]) -> dict[str, str]:
    """Re-apply section sanitization before Word/PDF export."""
    prepared: dict[str, str] = {}
    for key, body in sections.items():
        if not body or not body.strip():
            prepared[key] = body
            continue
        if key == "claims":
            prepared[key] = normalize_claims_text(body)
        elif key == "abstract":
            prepared[key] = truncate_abstract(body)
        elif key == "brief_description_of_drawings":
            prepared[key] = normalize_brief_description_of_drawings(body)
        else:
            prepared[key] = sanitize_patent_prose(body)
    return prepared


def sanitize_section_output(section: str, text: str) -> str:
    """Apply section-specific post-processing after LLM generation."""
    cleaned = sanitize_patent_prose(text)
    if section == "abstract":
        return truncate_abstract(cleaned)
    if section == "claims":
        return normalize_claims_text(cleaned)
    if section == "brief_description_of_drawings":
        return normalize_brief_description_of_drawings(cleaned)
    return cleaned


def sanitize_patent_prose(text: str) -> str:
    """
    Normalize LLM/source-artifact markup into readable patent prose.

    - ``%%Header 1%%`` wrappers become ``Header 1: `` (visible separation)
    - bare ``%%qa`` tags become ``qa``
    - template braces like ``{item_1_desc}`` are removed
    - subsection headings like ``4. Data Flow The...`` get a paragraph break
    """
    cleaned = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned = _WRAPPED_INTERNAL_TAG_RE.sub(
        lambda match: f"{match.group(1).strip()}: ",
        cleaned,
    )
    cleaned = _INTERNAL_DELIMITER_TAG_RE.sub(r"\1", cleaned)
    cleaned = _TEMPLATE_PLACEHOLDER_RE.sub("", cleaned)
    cleaned = _SUBSECTION_TITLE_RUN_IN_RE.sub(r"\1\2\3\n\n", cleaned)
    cleaned = re.sub(r"[ \t]+\.", ".", cleaned)
    cleaned = re.sub(r"  +", " ", cleaned)
    cleaned = re.sub(r" *\n *\n *", "\n\n", cleaned)
    return cleaned.strip()


def sanitize_internal_delimiter_tags(text: str) -> str:
    """Backward-compatible alias for :func:`sanitize_patent_prose`."""
    return sanitize_patent_prose(text)


def strip_markdown(text: str) -> str:
    """Remove common markdown markers while preserving readable plain text."""
    cleaned = sanitize_patent_prose(text)
    cleaned = _HEADING_RE.sub("", cleaned)
    cleaned = _BOLD_RE.sub(r"\1", cleaned)
    cleaned = _ITALIC_RE.sub(r"\1", cleaned)
    cleaned = _INLINE_CODE_RE.sub(r"\1", cleaned)
    cleaned = _BULLET_RE.sub("", cleaned)
    return cleaned.strip()


def split_paragraphs(text: str) -> list[str]:
    """
    Split section body into paragraphs for document export.

    Blank lines separate paragraphs. Single newlines within a paragraph are
    collapsed to spaces unless the line looks like a numbered claim or
    an indented claim element.
    """
    normalized = strip_markdown(text)
    if not normalized:
        return []

    blocks = re.split(r"\n\s*\n", normalized)
    paragraphs: list[str] = []

    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        if all(_ORDERED_BULLET_RE.match(line) for line in lines):
            paragraphs.extend(lines)
            continue

        if len(lines) == 1:
            paragraphs.append(lines[0])
            continue

        current = lines[0]
        for line in lines[1:]:
            if _ORDERED_BULLET_RE.match(line):
                paragraphs.append(current)
                current = line
            elif _CLAIM_ELEMENT_LINE_RE.match(f"   {line}"):
                paragraphs.append(current)
                current = line
            elif current.endswith(("-", "—")):
                current = current[:-1] + line
            else:
                current = f"{current} {line}"
        paragraphs.append(current)

    return paragraphs


def split_claim_blocks(text: str) -> list[list[str]]:
    """Split claims text into blocks of lines (one block per claim)."""
    normalized = normalize_claims_text(text)
    if not normalized:
        return []

    blocks = re.split(r"\n\s*\n", normalized)
    claim_blocks: list[list[str]] = []
    for block in blocks:
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if lines:
            claim_blocks.append(lines)
    return claim_blocks


def is_claim_element_line(line: str) -> bool:
    """True if line is an indented claim element (not the claim preamble)."""
    return bool(_CLAIM_ELEMENT_LINE_RE.match(line))


def parse_numbered_list_item_header(
    paragraph: str,
) -> tuple[str, str, str, str] | None:
    """
    If *paragraph* is a numbered list line with a title clause, return
    (prefix, title, body, separator) e.g. ("1. ", "Header 1", "body", ": ").
    """
    stripped = paragraph.strip()
    match = _LIST_ITEM_WITH_TITLE_RE.match(stripped)
    if match:
        prefix, title, body = match.group(1), match.group(2).strip(), match.group(3).strip()
        separator = ": "
    else:
        match = _LIST_ITEM_WITH_EMDASH_TITLE_RE.match(stripped)
        if not match:
            return None
        prefix, title, body = match.group(1), match.group(2).strip(), match.group(3).strip()
        separator = " — "

    if not title or not body:
        return None
    if len(title) > 80:
        return None
    return prefix, title, body, separator
