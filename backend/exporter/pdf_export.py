"""Generate a PDF patent draft from section text and optional figures."""

from __future__ import annotations

import struct
from io import BytesIO
from typing import Any

from fpdf import FPDF

from exporter.cover_sheet import add_cover_sheet_pdf
from exporter.figure_png import prerender_figure_pngs
from exporter.section_format import (
    SECTIONS_REQUIRING_PAGE_BREAK_BEFORE,
    ordered_section_keys,
    section_heading,
)
from exporter.text_format import split_paragraphs

FONT_SIZE_BODY = 11
FONT_SIZE_HEADING = 12
MARGIN_MM = 20
LINE_HEIGHT = 6
MAX_FIGURE_WIDTH_MM = 170
MAX_FIGURE_HEIGHT_MM = 200


class _PatentPdf(FPDF):
    def footer(self) -> None:
        self.set_y(-15)
        self.set_font("Helvetica", size=9)
        self.set_text_color(120, 120, 120)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")


def _sanitize_text(text: str) -> str:
    """Replace characters that core PDF fonts cannot render."""
    return (
        text.replace("\r\n", "\n")
        .replace("\r", "\n")
        .encode("latin-1", errors="replace")
        .decode("latin-1")
    )


def _write_section_body(pdf: FPDF, text: str) -> None:
    for paragraph in split_paragraphs(text):
        pdf.multi_cell(0, LINE_HEIGHT, paragraph)
        pdf.ln(2)


def _png_dimensions(png_bytes: bytes) -> tuple[int, int]:
    if png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Not a PNG image.")
    return struct.unpack(">II", png_bytes[16:24])


def _add_drawing_sheets(
    pdf: FPDF,
    figures: list[dict[str, Any]],
    png_by_number: dict[int, bytes],
) -> None:
    """Insert each figure on its own page with a centered sheet-number header."""
    if not figures:
        return

    sorted_figures = sorted(figures, key=lambda f: int(f.get("number", 0)))
    total_sheets = len(sorted_figures)

    for sheet_index, figure in enumerate(sorted_figures, start=1):
        mermaid = str(figure.get("mermaid", ""))
        number = int(figure.get("number", 0))

        pdf.add_page()
        pdf.set_font("Helvetica", size=11)
        pdf.cell(0, 8, f"{sheet_index}/{total_sheets}", ln=True, align="C")
        pdf.ln(4)

        png_bytes = png_by_number.get(number)
        if png_bytes:
            try:
                width_px, height_px = _png_dimensions(png_bytes)
                aspect = width_px / height_px

                width_mm = min(MAX_FIGURE_WIDTH_MM, MAX_FIGURE_HEIGHT_MM * aspect)
                height_mm = width_mm / aspect
                if height_mm > MAX_FIGURE_HEIGHT_MM:
                    height_mm = MAX_FIGURE_HEIGHT_MM
                    width_mm = height_mm * aspect

                x = (pdf.w - width_mm) / 2
                pdf.image(BytesIO(png_bytes), x=x, w=width_mm, h=height_mm)
            except Exception as exc:
                pdf.set_font("Helvetica", size=FONT_SIZE_BODY)
                pdf.multi_cell(
                    0,
                    LINE_HEIGHT,
                    _sanitize_text(
                        f"[FIG. {number} could not be embedded: {exc}. "
                        f"Mermaid source preserved below for manual export.]"
                    ),
                )
                pdf.multi_cell(0, LINE_HEIGHT, _sanitize_text(mermaid))
        else:
            pdf.set_font("Helvetica", size=FONT_SIZE_BODY)
            pdf.multi_cell(
                0,
                LINE_HEIGHT,
                _sanitize_text(
                    f"[FIG. {number} could not be rendered. "
                    f"Mermaid source preserved below for manual export.]"
                ),
            )
            pdf.multi_cell(0, LINE_HEIGHT, _sanitize_text(mermaid))


def export_patent_pdf(
    sections: dict[str, str],
    figures: list[dict[str, Any]] | None = None,
    *,
    invention_title: str = "",
    filing_info: dict[str, Any] | None = None,
    client_figure_pngs: dict[int, bytes] | None = None,
) -> BytesIO:
    """Build a multi-section patent draft PDF and return it as a BytesIO buffer."""
    pdf = _PatentPdf()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=MARGIN_MM)
    pdf.set_margins(MARGIN_MM, MARGIN_MM, MARGIN_MM)
    pdf.add_page()

    add_cover_sheet_pdf(
        pdf,
        invention_title=invention_title,
        filing_info=filing_info,
        sanitize_text=_sanitize_text,
    )

    figure_list = figures or []
    png_by_number = (
        prerender_figure_pngs(figure_list, client_pngs=client_figure_pngs)
        if figure_list
        else {}
    )
    keys = ordered_section_keys(sections)
    figures_inserted = False

    for key in keys:
        body = sections[key].strip()
        if not body:
            continue

        if key in SECTIONS_REQUIRING_PAGE_BREAK_BEFORE:
            pdf.add_page()

        pdf.set_font("Helvetica", style="BU", size=FONT_SIZE_HEADING)
        pdf.cell(0, 10, _sanitize_text(section_heading(key)), ln=True)
        pdf.set_font("Helvetica", size=FONT_SIZE_BODY)
        _write_section_body(pdf, _sanitize_text(body))
        pdf.ln(4)

        if (
            not figures_inserted
            and figure_list
            and key == "brief_description_of_drawings"
        ):
            _add_drawing_sheets(pdf, figure_list, png_by_number)
            figures_inserted = True

    if figure_list and not figures_inserted:
        _add_drawing_sheets(pdf, figure_list, png_by_number)

    buffer = BytesIO()
    pdf.output(buffer)
    buffer.seek(0)
    return buffer
