"""Generate patent figures (Mermaid) via the configured LLM."""

from __future__ import annotations

import re
from typing import Any

from exporter.mermaid_render import apply_patent_mermaid_theme
from exporter.text_format import normalize_brief_description_of_drawings

from .figure_numerals import (
    format_numeral_validation_errors,
    reconcile_figure_labels,
    repair_figure_numerals,
    validate_figure_numerals,
)
from .llm_client import generate_json, get_llm_model
from .mermaid_sanitize import sanitize_mermaid_source
from .prompts import FIGURES_SYSTEM, get_figures_prompt

_MERMAID_FORBIDDEN = re.compile(
    r"\b(classDef|style\s|fill:|stroke:|click\s|linkStyle)\b",
    re.IGNORECASE,
)

# Default compact layouts when the model omits a flowchart direction.
_FIGURE_DEFAULT_DIRECTION = {
    1: "TB",
    2: "TB",
    3: "TB",
}


def _default_flowchart_direction(number: int) -> str:
    return _FIGURE_DEFAULT_DIRECTION.get(number, "TB")


def _normalize_figure(raw: dict[str, Any], index: int) -> dict[str, Any]:
    """Validate and normalize a single figure from model output."""
    number = int(raw.get("number", index))
    title = str(raw.get("title", f"Figure {number}")).strip()
    brief_description = str(
        raw.get("brief_description", f"FIG. {number} illustrates the invention.")
    ).strip()
    mermaid = str(raw.get("mermaid", "")).strip()
    mermaid = sanitize_mermaid_source(mermaid)
    numerals_raw = raw.get("reference_numerals") or {}
    reference_numerals: dict[str, str] = {}
    if isinstance(numerals_raw, dict):
        reference_numerals = {
            str(k): str(v) for k, v in numerals_raw.items()
        }

    if not mermaid.lower().startswith("flowchart"):
        direction = _default_flowchart_direction(number)
        mermaid = f"flowchart {direction}\n{mermaid}"

    if _MERMAID_FORBIDDEN.search(mermaid):
        raise ValueError(
            f"Figure {number} mermaid contains disallowed styling directives."
        )

    mermaid = apply_patent_mermaid_theme(mermaid)

    return {
        "number": number,
        "title": title,
        "brief_description": brief_description,
        "reference_numerals": reference_numerals,
        "mermaid": mermaid,
    }


def _extract_figures_list(raw: dict[str, Any]) -> list[Any]:
    """Normalize figure lists from common LLM JSON shapes."""
    for key in ("figures", "Figures", "figure_list", "drawings"):
        value = raw.get(key)
        if isinstance(value, list) and value:
            return value
        if isinstance(value, dict) and value:
            return list(value.values())
    return []


def _figures_from_response(raw: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    """Parse brief description and normalized figures from LLM JSON."""
    brief = str(raw.get("brief_description_of_drawings", "")).strip()
    figures_raw = _extract_figures_list(raw)
    if not figures_raw:
        keys = ", ".join(sorted(raw.keys())) or "(none)"
        raise ValueError(
            f"LLM ({get_llm_model()}) did not return a non-empty figures list "
            f"(response keys: {keys}). "
            "Verify LLM_BASE_URL, LLM_MODEL, and LLM_API_KEY in .env, then restart the backend."
        )

    figures = [
        _normalize_figure(item, index + 1)
        for index, item in enumerate(figures_raw)
        if isinstance(item, dict)
    ]
    if not figures:
        raise ValueError(
            f"No valid figures were parsed from LLM ({get_llm_model()}) output."
        )

    if not brief and figures:
        brief = "\n\n".join(
            f["brief_description"]
            for f in sorted(figures, key=lambda f: int(f["number"]))
            if f.get("brief_description")
        )
    elif figures:
        per_figure = "\n\n".join(
            f["brief_description"]
            for f in sorted(figures, key=lambda f: int(f["number"]))
            if f.get("brief_description")
        )
        if per_figure:
            brief = per_figure

    brief = normalize_brief_description_of_drawings(brief)

    return brief, figures


def generate_patent_figures(
    invention: dict,
    description_text: str = "",
) -> dict[str, Any]:
    """
    Generate patent figures and Brief Description of the Drawings.

    Returns:
        {
            "brief_description_of_drawings": str,
            "figures": list[dict],
        }
    """
    prompt = get_figures_prompt(invention, description_text)

    last_error: ValueError | None = None
    user_prompt = prompt
    for attempt in range(3):
        raw = generate_json(FIGURES_SYSTEM, user_prompt)
        try:
            brief, figures = _figures_from_response(raw)
            figures = reconcile_figure_labels(figures, description_text)
            figures = repair_figure_numerals(figures, description_text)
            numeral_errors = validate_figure_numerals(figures, description_text)
            if numeral_errors and attempt < 2:
                user_prompt = prompt + format_numeral_validation_errors(numeral_errors)
                continue
            if numeral_errors:
                raise ValueError(
                    "Figure reference numerals are inconsistent after retries: "
                    + "; ".join(numeral_errors)
                )
            return {
                "brief_description_of_drawings": brief,
                "figures": figures,
            }
        except ValueError as exc:
            last_error = exc
            if attempt < 2 and "figures list" in str(exc).lower():
                user_prompt = prompt + (
                    "\n\nIMPORTANT: Return a JSON object with a non-empty figures array. "
                    "Do not omit the figures key."
                )
                continue
            if attempt < 2:
                continue
            raise exc from None

    if last_error:
        raise last_error
    raise ValueError(f"Failed to generate figures with LLM ({get_llm_model()}).")
