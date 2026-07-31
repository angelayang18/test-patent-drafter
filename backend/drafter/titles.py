"""Generate candidate invention / project titles from source material."""

from __future__ import annotations

from typing import Optional

from drafter.ada_extractor import EXTRACT_ADA_SYSTEM
from drafter.grant_extractor import EXTRACT_GRANT_SYSTEM
from drafter.llm_client import generate_json
from drafter.prompts import EXTRACT_INVENTION_SYSTEM
from drafter.relevance import extraction_system_prompt, format_relevance_guidance
from drafter.retrieval import citations_for_generic_title
from drafter.source_text import prepare_source_text
from drafter.sow_extractor import EXTRACT_SOW_SYSTEM

TITLE_MAX_LENGTH = 500
REQUIRED_TITLE_COUNT = 5
VALID_DOCUMENT_KINDS = frozenset({"patent", "grant", "sow", "ada"})

_PATENT_TITLE_GUIDANCE = (
    "Suggest US provisional patent cover-sheet titles: short and specific "
    "(maximum 15 words); no marketing adjectives or taglines."
)

_GRANT_TITLE_GUIDANCE = (
    "Suggest concise working titles for a grant proposal: descriptive and "
    "funder-facing, focused on the project purpose and impact."
)

_SOW_TITLE_GUIDANCE = (
    "Suggest concise engagement titles for a statement of work: descriptive "
    "of the work being performed, suitable for a contract cover page."
)

_ADA_TITLE_GUIDANCE = (
    "Suggest concise titles for an ADA bioanalytical report: descriptive of "
    "the study/assay, matching the tone of a regulatory/scientific report."
)

# (base_system, tone_guidance, user-prompt label)
_KIND_LOOKUP: dict[str, tuple[str, str, str]] = {
    "patent": (EXTRACT_INVENTION_SYSTEM, _PATENT_TITLE_GUIDANCE, "invention (patent)"),
    "grant": (EXTRACT_GRANT_SYSTEM, _GRANT_TITLE_GUIDANCE, "grant project"),
    "sow": (EXTRACT_SOW_SYSTEM, _SOW_TITLE_GUIDANCE, "statement of work engagement"),
    "ada": (EXTRACT_ADA_SYSTEM, _ADA_TITLE_GUIDANCE, "ADA bioanalytical study"),
}


def _normalize_titles(raw: object) -> list[str]:
    """Strip, dedupe (case-insensitive), and truncate titles to TITLE_MAX_LENGTH."""
    if not isinstance(raw, list):
        raise ValueError("Model response 'titles' must be a list of strings.")

    seen: set[str] = set()
    result: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        title = item.strip()
        if not title:
            continue
        if len(title) > TITLE_MAX_LENGTH:
            title = title[:TITLE_MAX_LENGTH].rstrip()
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(title)
        if len(result) >= REQUIRED_TITLE_COUNT:
            break

    if len(result) < REQUIRED_TITLE_COUNT:
        raise ValueError(
            f"Expected {REQUIRED_TITLE_COUNT} distinct titles, got {len(result)}."
        )
    return result


def suggest_titles(
    combined_text: str,
    document_kind: str,
    current: Optional[str] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> list[str]:
    """
    Suggest exactly five distinct candidate titles from source text.

    ``document_kind`` must be one of ``patent``, ``grant``, ``sow``, or ``ada``
    so the prompt uses the matching title tone.
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    kind = document_kind.strip().lower()
    if kind not in VALID_DOCUMENT_KINDS:
        raise ValueError(
            f"document_kind must be one of {sorted(VALID_DOCUMENT_KINDS)}, got {document_kind!r}."
        )

    body = prepare_source_text(combined_text)
    guidance = format_relevance_guidance(relevant_notes, irrelevant_notes)
    base_system, tone, label = _KIND_LOOKUP[kind]
    system = extraction_system_prompt(base_system, relevant_notes, irrelevant_notes)
    system = (
        f"{system} {tone} "
        f"Return JSON with exactly one key: 'titles' (list of exactly "
        f"{REQUIRED_TITLE_COUNT} distinct strings, each at most {TITLE_MAX_LENGTH} characters)."
    )

    source = f"{guidance}\n\n{body}" if guidance else body
    current_block = ""
    current_title = (current or "").strip()
    if current_title:
        current_block = (
            f"\n\nCurrent title (suggest alternatives; do not merely repeat it):\n"
            f"{current_title}"
        )

    user = f"""\
Analyze the documentation below and suggest exactly {REQUIRED_TITLE_COUNT} distinct \
candidate titles for this {label}.

Return a JSON object with exactly one key "titles" whose value is a list of exactly \
{REQUIRED_TITLE_COUNT} strings. Each title must be at most {TITLE_MAX_LENGTH} characters.

Documentation:
{source}
{current_block}
"""

    parsed = generate_json(system, user)
    if "titles" not in parsed:
        raise ValueError("Model response missing field 'titles'.")
    return _normalize_titles(parsed["titles"])


def suggest_generic_titles(
    combined_text: str,
    document_type_label: str,
    current: Optional[str] = None,
    relevant_notes: str = "",
    irrelevant_notes: str = "",
) -> dict:
    """
    Suggest exactly five distinct candidate titles for a custom/generic document type.

    Uses a minimal inline system prompt keyed off ``document_type_label`` rather than
    a fixed extractor system (custom types have no EXTRACT_*_SYSTEM).

    Returns ``{"titles": [...], "citations": [...]}`` where citations are cheap
    keyword-retrieval hits for the current title (no extra LLM call).
    """
    if not combined_text.strip():
        raise ValueError("combined_text is required.")

    label = document_type_label.strip()
    if not label:
        raise ValueError("document_type_label is required.")

    body = prepare_source_text(combined_text)
    guidance = format_relevance_guidance(relevant_notes, irrelevant_notes)
    system = (
        f"You are drafting a candidate title for a document of type '{label}'. "
        f"Suggest concise, descriptive working titles suited to that document type. "
        f"Return JSON with exactly one key: 'titles' (list of exactly "
        f"{REQUIRED_TITLE_COUNT} distinct strings, each at most {TITLE_MAX_LENGTH} characters)."
    )

    source = f"{guidance}\n\n{body}" if guidance else body
    current_block = ""
    current_title = (current or "").strip()
    if current_title:
        current_block = (
            f"\n\nCurrent title (suggest alternatives; do not merely repeat it):\n"
            f"{current_title}"
        )

    user = f"""\
Analyze the documentation below and suggest exactly {REQUIRED_TITLE_COUNT} distinct \
candidate titles for this {label} document.

Return a JSON object with exactly one key "titles" whose value is a list of exactly \
{REQUIRED_TITLE_COUNT} strings. Each title must be at most {TITLE_MAX_LENGTH} characters.

Documentation:
{source}
{current_block}
"""

    parsed = generate_json(system, user)
    if "titles" not in parsed:
        raise ValueError("Model response missing field 'titles'.")
    titles = _normalize_titles(parsed["titles"])
    citations = citations_for_generic_title(combined_text, label, current_title)
    return {"titles": titles, "citations": citations}
