"""Generate patent figures (Mermaid) via the configured LLM."""

from __future__ import annotations

import re
from typing import Any

from .llm_client import generate_json
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
    numerals_raw = raw.get("reference_numerals") or {}
    reference_numerals: dict[str, str] = {}
    if isinstance(numerals_raw, dict):
        reference_numerals = {
            str(k): str(v) for k, v in numerals_raw.items()
        }

    if not mermaid.lower().startswith("flowchart"):
        direction = _default_flowchart_direction(number)
        mermaid = f"flowchart {direction}\n{mermaid}"
    elif re.match(r"^flowchart\s+LR\b", mermaid, re.IGNORECASE):
        # Avoid purely horizontal layouts that are hard to read in Word.
        mermaid = re.sub(
            r"^flowchart\s+LR\b",
            f"flowchart {_default_flowchart_direction(number)}",
            mermaid,
            count=1,
            flags=re.IGNORECASE,
        )

    if _MERMAID_FORBIDDEN.search(mermaid):
        raise ValueError(
            f"Figure {number} mermaid contains disallowed styling directives."
        )

    return {
        "number": number,
        "title": title,
        "brief_description": brief_description,
        "reference_numerals": reference_numerals,
        "mermaid": mermaid,
    }


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
    raw = generate_json(FIGURES_SYSTEM, prompt)

    brief = str(
        raw.get("brief_description_of_drawings", "")
    ).strip()
    figures_raw = raw.get("figures")
    if not isinstance(figures_raw, list) or not figures_raw:
        raise ValueError("Gemini did not return a non-empty figures list.")

    figures = [
        _normalize_figure(item, index + 1)
        for index, item in enumerate(figures_raw)
        if isinstance(item, dict)
    ]
    if not figures:
        raise ValueError("No valid figures were parsed from Gemini output.")

    if not brief:
        brief = "\n\n".join(f["brief_description"] for f in figures)

    return {
        "brief_description_of_drawings": brief,
        "figures": figures,
    }
