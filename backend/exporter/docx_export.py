"""Generate a .docx patent draft with optional embedded figures."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from docx import Document
from docx.shared import Inches

from exporter.mermaid_render import render_mermaid_to_png

SECTION_DISPLAY_ORDER = [
    "field",
    "background",
    "summary",
    "brief_description_of_drawings",
    "description",
    "claims",
    "abstract",
]

SECTION_TITLES = {
    "field": "Field of the Invention",
    "background": "Background of the Invention",
    "summary": "Summary of the Invention",
    "brief_description_of_drawings": "Brief Description of the Drawings",
    "description": "Detailed Description of Preferred Embodiments",
    "claims": "Claims",
    "abstract": "Abstract",
}


def _section_heading(key: str) -> str:
    return SECTION_TITLES.get(key, key.replace("_", " ").title())


def _ordered_section_keys(sections: dict[str, str]) -> list[str]:
    """Return section keys in patent document order."""
    ordered = [key for key in SECTION_DISPLAY_ORDER if key in sections and sections[key].strip()]
    for key in sections:
        if key not in ordered and sections[key].strip():
            ordered.append(key)
    return ordered


def _add_figures_to_doc(doc: Document, figures: list[dict[str, Any]]) -> None:
    """Insert rendered figure images and captions into the document."""
    if not figures:
        return

    doc.add_heading("Drawings", level=1)
    sorted_figures = sorted(figures, key=lambda f: int(f.get("number", 0)))

    for figure in sorted_figures:
        number = int(figure.get("number", 0))
        title = str(figure.get("title", f"Figure {number}"))
        brief = str(figure.get("brief_description", ""))
        mermaid = str(figure.get("mermaid", ""))

        doc.add_heading(f"FIG. {number} — {title}", level=2)
        if brief:
            doc.add_paragraph(brief)

        try:
            png_bytes = render_mermaid_to_png(mermaid)
            doc.add_picture(BytesIO(png_bytes), width=Inches(6.0))
        except Exception as exc:
            doc.add_paragraph(
                f"[Figure {number} could not be rendered: {exc}. "
                f"Mermaid source preserved below for manual export.]"
            )
            doc.add_paragraph(mermaid)


def export_patent_docx(
    sections: dict[str, str],
    figures: list[dict[str, Any]] | None = None,
) -> BytesIO:
    """
    Build a DOCX patent draft from text sections and optional figures.

    Figures are rendered to PNG and inserted after Brief Description of the Drawings
    when that section is present, otherwise before Detailed Description.
    """
    doc = Document()
    doc.add_heading("Patent Application Draft", level=0)

    figure_list = figures or []
    keys = _ordered_section_keys(sections)
    figures_inserted = False

    for key in keys:
        doc.add_heading(_section_heading(key), level=1)
        doc.add_paragraph(sections[key])

        if (
            not figures_inserted
            and figure_list
            and key == "brief_description_of_drawings"
        ):
            _add_figures_to_doc(doc, figure_list)
            figures_inserted = True

    if figure_list and not figures_inserted:
        _add_figures_to_doc(doc, figure_list)

    buffer = BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer
