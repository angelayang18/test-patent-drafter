"""Generate patent figures (Mermaid) via the configured LLM."""

from __future__ import annotations

import asyncio
import logging
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
from .prompts import FIGURES_SYSTEM, get_regenerate_figure_prompt

log = logging.getLogger(__name__)

_MERMAID_FORBIDDEN = re.compile(
    r"\b(classDef|style\s|fill:|stroke:|click\s|linkStyle)\b",
    re.IGNORECASE,
)

_MERMAID_TYPE_RE = re.compile(
    r"^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram-v2|stateDiagram|"
    r"erDiagram|block-beta|block|journey|timeline|mindmap)\b",
    re.IGNORECASE,
)

# Default diagram headers when the model omits a type declaration.
_FIGURE_DEFAULT_HEADER = {
    1: "graph TD",
    2: "flowchart TD",
    3: "flowchart TD",
    4: "classDiagram",
}

_EXPECTED_DIAGRAM_TYPE_PATTERNS: dict[int, re.Pattern[str]] = {
    1: re.compile(r"^graph\s+TD\b", re.IGNORECASE),
    2: re.compile(r"^flowchart\s+TD\b", re.IGNORECASE),
    3: re.compile(r"^flowchart\s+TD\b", re.IGNORECASE),
    4: re.compile(r"^classDiagram\b", re.IGNORECASE),
}

_EXPECTED_DIAGRAM_TYPE_LABELS: dict[int, str] = {
    1: "graph TD",
    2: "flowchart TD",
    3: "flowchart TD",
    4: "classDiagram",
}


def _first_mermaid_declaration_line(mermaid: str) -> str:
    """Return the first non-comment, non-init Mermaid declaration line."""
    in_init_block = False
    for line in mermaid.strip().splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("%%{init:"):
            if stripped.endswith("}%%"):
                continue
            in_init_block = True
            continue
        if in_init_block:
            if stripped.endswith("}%%") or stripped == "%%":
                in_init_block = False
            continue
        if stripped.startswith("%%"):
            continue
        return stripped
    return ""


def _has_diagram_type_declaration(mermaid: str) -> bool:
    """Return True when mermaid source already declares a diagram type."""
    declaration = _first_mermaid_declaration_line(mermaid)
    return bool(declaration and _MERMAID_TYPE_RE.match(declaration))


def detect_mermaid_diagram_type(mermaid: str) -> str:
    """Return a normalized Mermaid diagram type keyword from source."""
    declaration = _first_mermaid_declaration_line(mermaid)
    if declaration:
        match = _MERMAID_TYPE_RE.match(declaration)
        if match:
            diagram_type = match.group(1).lower()
            if diagram_type == "graph":
                return "flowchart"
            if diagram_type == "block":
                return "block-beta"
            return diagram_type
    return "flowchart"


def _is_flowchart_type(diagram_type: str) -> bool:
    return diagram_type in {"flowchart", "graph"}


def _default_diagram_header(number: int) -> str:
    if number in _FIGURE_DEFAULT_HEADER:
        return _FIGURE_DEFAULT_HEADER[number]
    if number >= 4:
        return "classDiagram"
    return "flowchart TD"


def _apply_flowchart_layout_rules(mermaid: str, number: int) -> str:
    """Normalize flowchart/graph direction per figure role without breaking FIG. 1 architecture."""
    if number == 1:
        # FIG. 1 architecture: top-down graph layout for letter-size portrait paper.
        if re.match(r"^\s*flowchart\b", mermaid, re.IGNORECASE):
            mermaid = re.sub(
                r"^flowchart\b",
                "graph",
                mermaid,
                count=1,
                flags=re.IGNORECASE,
            )
        mermaid = re.sub(
            r"^graph\s+LR\b",
            "graph TD",
            mermaid,
            count=1,
            flags=re.IGNORECASE,
        )
        return mermaid

    if number == 2:
        mermaid = re.sub(
            r"^flowchart\s+(?:TB|BT|LR|RL)\b",
            "flowchart TD",
            mermaid,
            count=1,
            flags=re.IGNORECASE,
        )
        return mermaid

    if number == 3:
        # FIG. 3 data flow: force flowchart TD if the model ignored the prompt.
        if re.match(r"^\s*sequenceDiagram\b", mermaid, re.IGNORECASE):
            mermaid = re.sub(
                r"^sequenceDiagram\b",
                "flowchart TD",
                mermaid,
                count=1,
                flags=re.IGNORECASE,
            )
        mermaid = re.sub(
            r"^flowchart\s+(?:TB|BT|LR|RL)\b",
            "flowchart TD",
            mermaid,
            count=1,
            flags=re.IGNORECASE,
        )
        return mermaid

    # Other flowchart figures: prefer top-down layout.
    mermaid = re.sub(
        r"^flowchart\s+(?:LR|RL)\b",
        "flowchart TD",
        mermaid,
        count=1,
        flags=re.IGNORECASE,
    )
    mermaid = re.sub(
        r"^graph\s+(?:LR|RL)\b",
        "graph TD",
        mermaid,
        count=1,
        flags=re.IGNORECASE,
    )
    return mermaid


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

    if _MERMAID_FORBIDDEN.search(mermaid):
        raise ValueError(
            f"Figure {number} mermaid contains disallowed styling directives."
        )

    diagram_type = detect_mermaid_diagram_type(mermaid)
    if not _has_diagram_type_declaration(mermaid):
        mermaid = f"{_default_diagram_header(number)}\n{mermaid}"
        diagram_type = detect_mermaid_diagram_type(mermaid)

    if _is_flowchart_type(diagram_type) or (
        number == 3 and diagram_type == "sequencediagram"
    ):
        mermaid = _apply_flowchart_layout_rules(mermaid, number)

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


def _log_numeral_warnings(numeral_errors: list[str], context: str) -> None:
    """Log non-fatal reference numeral validation issues."""
    log.warning(
        "%s reference numerals inconsistent after retries: %s",
        context,
        "; ".join(numeral_errors),
    )


def validate_figure_diagram_types(figures: list[dict[str, Any]]) -> list[str]:
    """Return warnings when a figure's mermaid does not start with its required type."""
    warnings: list[str] = []
    for fig in figures:
        number = int(fig.get("number", 0))
        pattern = _EXPECTED_DIAGRAM_TYPE_PATTERNS.get(number)
        expected = _EXPECTED_DIAGRAM_TYPE_LABELS.get(number)
        if not pattern or not expected:
            continue

        declaration = _first_mermaid_declaration_line(str(fig.get("mermaid", "")))
        if pattern.match(declaration):
            continue

        warning = (
            f"FIG. {number} uses incorrect diagram type "
            f"(expected mermaid to start with `{expected}`, "
            f"got `{declaration or '(missing)'}`). "
            "Regenerate this figure for the correct diagram structure."
        )
        log.warning(
            "FIG. %s diagram type mismatch: expected %s, got %r",
            number,
            expected,
            declaration,
        )
        warnings.append(warning)
    return warnings


async def generate_single_figure(
    invention: dict,
    description_text: str,
    figure_number: int,
    total_figures: int,
) -> dict[str, Any]:
    """Generate one patent figure asynchronously."""
    from .prompts import get_single_figure_prompt

    prompt = get_single_figure_prompt(
        invention,
        description_text,
        figure_number,
        total_figures,
    )

    last_error: ValueError | None = None
    user_prompt = prompt
    for attempt in range(3):
        raw = await asyncio.to_thread(generate_json, FIGURES_SYSTEM, user_prompt)
        try:
            figure = _figure_from_regenerate_response(raw, figure_number)
            figures = reconcile_figure_labels([figure], description_text)
            figures = repair_figure_numerals(figures, description_text)
            numeral_errors = validate_figure_numerals(figures, description_text)
            if numeral_errors and attempt < 2:
                user_prompt = prompt + format_numeral_validation_errors(numeral_errors)
                continue
            if numeral_errors:
                _log_numeral_warnings(numeral_errors, f"FIG. {figure_number}")
            return figures[0]
        except ValueError as exc:
            last_error = exc
            if attempt < 2 and "figure object" in str(exc).lower():
                user_prompt = prompt + (
                    "\n\nIMPORTANT: Return a JSON object with a figure key containing "
                    "the generated figure. Do not omit the figure key."
                )
                continue
            if attempt < 2:
                continue
            raise exc from None

    if last_error:
        raise last_error
    raise ValueError(
        f"Failed to generate figure {figure_number} with LLM ({get_llm_model()})."
    )


async def generate_patent_figures(
    invention: dict,
    description_text: str = "",
    num_figures: int = 3,
) -> dict[str, Any]:
    """
    Generate patent figures and Brief Description of the Drawings.

    Each figure is generated in a separate parallel LLM call.
    Provisional applications have no USPTO-required minimum figure count; ``num_figures``
    is an applicant choice (default 3: architecture, method, interaction).

    Returns:
        {
            "brief_description_of_drawings": str,
            "figures": list[dict],
            "warnings": list[str] | omitted when numerals are consistent,
        }
    """
    if num_figures < 1:
        raise ValueError("num_figures must be at least 1.")

    tasks = [
        generate_single_figure(invention, description_text, i + 1, num_figures)
        for i in range(num_figures)
    ]
    figures = list(await asyncio.gather(*tasks))

    figures = reconcile_figure_labels(figures, description_text)
    figures = repair_figure_numerals(figures, description_text)
    numeral_errors = validate_figure_numerals(figures, description_text)
    if numeral_errors:
        _log_numeral_warnings(numeral_errors, "Figure")

    brief = "\n\n".join(
        f["brief_description"]
        for f in sorted(figures, key=lambda f: int(f["number"]))
    )
    brief = normalize_brief_description_of_drawings(brief)

    diagram_warnings = validate_figure_diagram_types(figures)
    warnings = [*numeral_errors, *diagram_warnings]
    result: dict[str, Any] = {
        "brief_description_of_drawings": brief,
        "figures": figures,
    }
    if warnings:
        result["warnings"] = warnings
    return result


def _figure_from_regenerate_response(raw: dict[str, Any], figure_number: int) -> dict[str, Any]:
    """Parse a single regenerated figure from LLM JSON."""
    figure_raw = raw.get("figure")
    if not isinstance(figure_raw, dict):
        keys = ", ".join(sorted(raw.keys())) or "(none)"
        raise ValueError(
            f"LLM ({get_llm_model()}) did not return a figure object "
            f"(response keys: {keys})."
        )
    figure = _normalize_figure(figure_raw, figure_number)
    if int(figure["number"]) != figure_number:
        figure["number"] = figure_number
    return figure


def regenerate_patent_figure(
    invention: dict,
    description_text: str,
    figure_number: int,
    existing_figures: list[dict],
) -> dict[str, Any]:
    """
    Regenerate a single patent figure using a diagram type not already in use.

    Returns:
        {
            "figure": normalized figure dict,
            "warnings": list[str] | omitted when numerals are consistent,
        }
    """
    used_types = [
        detect_mermaid_diagram_type(str(fig.get("mermaid", "")))
        for fig in existing_figures
        if int(fig.get("number", 0)) != figure_number
    ]
    prompt = get_regenerate_figure_prompt(
        invention,
        description_text,
        figure_number,
        existing_figures,
        used_types,
    )

    last_error: ValueError | None = None
    user_prompt = prompt
    for attempt in range(3):
        raw = generate_json(FIGURES_SYSTEM, user_prompt)
        try:
            figure = _figure_from_regenerate_response(raw, figure_number)
            figures = reconcile_figure_labels([figure], description_text)
            figures = repair_figure_numerals(figures, description_text)
            numeral_errors = validate_figure_numerals(figures, description_text)
            diagram_warnings = validate_figure_diagram_types(figures)
            if numeral_errors and attempt < 2:
                user_prompt = prompt + format_numeral_validation_errors(numeral_errors)
                continue
            warnings = [*numeral_errors, *diagram_warnings]
            if warnings:
                if numeral_errors:
                    _log_numeral_warnings(
                        numeral_errors,
                        f"FIG. {figure_number}",
                    )
                return {
                    "figure": figures[0],
                    "warnings": warnings,
                }
            return {"figure": figures[0]}
        except ValueError as exc:
            last_error = exc
            if attempt < 2 and "figure object" in str(exc).lower():
                user_prompt = prompt + (
                    "\n\nIMPORTANT: Return a JSON object with a figure key containing "
                    "the regenerated figure. Do not omit the figure key."
                )
                continue
            if attempt < 2:
                continue
            raise exc from None

    if last_error:
        raise last_error
    raise ValueError(
        f"Failed to regenerate figure {figure_number} with LLM ({get_llm_model()})."
    )


async def generate_generic_single_figure(
    document_type_label: str,
    document_title: str,
    combined_text: str,
    figure_number: int,
    total_figures: int,
) -> dict[str, Any]:
    """Generate one supporting diagram for a non-patent document asynchronously."""
    from .prompts import GENERIC_FIGURES_SYSTEM, get_generic_single_figure_prompt

    prompt = get_generic_single_figure_prompt(
        document_type_label,
        document_title,
        combined_text,
        figure_number,
        total_figures,
    )

    last_error: ValueError | None = None
    user_prompt = prompt
    for attempt in range(3):
        raw = await asyncio.to_thread(generate_json, GENERIC_FIGURES_SYSTEM, user_prompt)
        try:
            return _figure_from_regenerate_response(raw, figure_number)
        except ValueError as exc:
            last_error = exc
            if attempt < 2 and "figure object" in str(exc).lower():
                user_prompt = prompt + (
                    "\n\nIMPORTANT: Return a JSON object with a figure key containing "
                    "the generated figure. Do not omit the figure key."
                )
                continue
            if attempt < 2:
                continue
            raise exc from None

    if last_error:
        raise last_error
    raise ValueError(
        f"Failed to generate figure {figure_number} with LLM ({get_llm_model()})."
    )


async def generate_generic_figures(
    document_type_label: str,
    document_title: str,
    combined_text: str,
    num_figures: int = 3,
) -> dict[str, Any]:
    """
    Generate supporting Mermaid diagrams for a non-patent document.

    Returns:
        {
            "figures": list[dict],
            "warnings": list[str] | omitted,
        }
    """
    if num_figures < 1:
        raise ValueError("num_figures must be at least 1.")

    tasks = [
        generate_generic_single_figure(
            document_type_label,
            document_title,
            combined_text,
            i + 1,
            num_figures,
        )
        for i in range(num_figures)
    ]
    figures = list(await asyncio.gather(*tasks))

    diagram_warnings = validate_figure_diagram_types(figures)
    result: dict[str, Any] = {"figures": figures}
    if diagram_warnings:
        result["warnings"] = diagram_warnings
    return result


def regenerate_generic_figure(
    document_type_label: str,
    document_title: str,
    combined_text: str,
    figure_number: int,
    existing_figures: list[dict],
) -> dict[str, Any]:
    """
    Regenerate a single supporting diagram using a diagram type not already in use.

    Returns:
        {
            "figure": normalized figure dict,
            "warnings": list[str] | omitted,
        }
    """
    from .prompts import GENERIC_FIGURES_SYSTEM, get_generic_regenerate_figure_prompt

    used_types = [
        detect_mermaid_diagram_type(str(fig.get("mermaid", "")))
        for fig in existing_figures
        if int(fig.get("number", 0)) != figure_number
    ]
    prompt = get_generic_regenerate_figure_prompt(
        document_type_label,
        document_title,
        combined_text,
        figure_number,
        existing_figures,
        used_types,
    )

    last_error: ValueError | None = None
    user_prompt = prompt
    for attempt in range(3):
        raw = generate_json(GENERIC_FIGURES_SYSTEM, user_prompt)
        try:
            figure = _figure_from_regenerate_response(raw, figure_number)
            diagram_warnings = validate_figure_diagram_types([figure])
            if diagram_warnings:
                return {"figure": figure, "warnings": diagram_warnings}
            return {"figure": figure}
        except ValueError as exc:
            last_error = exc
            if attempt < 2 and "figure object" in str(exc).lower():
                user_prompt = prompt + (
                    "\n\nIMPORTANT: Return a JSON object with a figure key containing "
                    "the regenerated figure. Do not omit the figure key."
                )
                continue
            if attempt < 2:
                continue
            raise exc from None

    if last_error:
        raise last_error
    raise ValueError(
        f"Failed to regenerate figure {figure_number} with LLM ({get_llm_model()})."
    )
