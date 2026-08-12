"""Generate a PDF patent draft from section text and optional figures."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from fpdf import FPDF
from fpdf.enums import XPos, YPos

from exporter.cover_sheet import add_cover_sheet_pdf
from exporter.figure_png import prerender_figure_pngs
from exporter.figure_sheets import add_drawing_sheets_pdf
from exporter.section_format import (
    SECTIONS_REQUIRING_PAGE_BREAK_BEFORE,
    cross_reference_body,
    ordered_section_keys,
    section_heading,
)
from exporter.text_format import (
    parse_numbered_list_item_header,
    prepare_sections_for_export,
    split_brief_description_paragraphs,
    split_claim_blocks,
    split_paragraphs,
)

FONT_SIZE_BODY = 11
FONT_SIZE_HEADING = 12
MARGIN_MM = 20
LINE_HEIGHT = 6

# fpdf2 leaves the cursor at the right margin after multi_cell; reset x so
# back-to-back cells (e.g. multiline address, mermaid fallback) keep full width.
_MULTI_CELL_KW = {"new_x": XPos.LMARGIN, "new_y": YPos.NEXT}

# Backward-compatible alias for tests that import the former private helper.
_add_drawing_sheets = add_drawing_sheets_pdf


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


def _multi_cell_paragraph(
    pdf: FPDF,
    text: str,
    *,
    h: float = LINE_HEIGHT,
    **kwargs,
) -> None:
    pdf.multi_cell(0, h, text, **_MULTI_CELL_KW, **kwargs)


def _write_description_paragraph(pdf: FPDF, paragraph: str) -> None:
    """Write a detailed-description paragraph, styling numbered sub-headings."""
    header = parse_numbered_list_item_header(paragraph)
    if header:
        prefix, title, body, separator = header
        # Header and body each get a full-width cell. write()+multi_cell() would
        # start the body at the header's end-of-line x; when the header wraps,
        # fpdf2 keeps that narrow width for every body line (ragged right column).
        pdf.set_font("Helvetica", style="BU", size=FONT_SIZE_BODY)
        _multi_cell_paragraph(pdf, _sanitize_text(f"{prefix}{title}{separator}"))
        pdf.set_font("Helvetica", size=FONT_SIZE_BODY)
        _multi_cell_paragraph(pdf, _sanitize_text(body))
    else:
        _multi_cell_paragraph(pdf, _sanitize_text(paragraph))
    pdf.ln(2)


def _write_section_body(pdf: FPDF, text: str, section_key: str = "") -> None:
    if section_key == "claims":
        for block in split_claim_blocks(text):
            for index, line in enumerate(block):
                if index > 0:
                    pdf.set_x(pdf.l_margin + 10)
                _multi_cell_paragraph(pdf, line.strip())
            pdf.ln(2)
        return

    if section_key == "brief_description_of_drawings":
        for paragraph in split_brief_description_paragraphs(text):
            _multi_cell_paragraph(pdf, paragraph)
            pdf.ln(2)
        return

    for paragraph in split_paragraphs(text):
        if section_key == "description":
            _write_description_paragraph(pdf, paragraph)
        else:
            _multi_cell_paragraph(pdf, paragraph)
            pdf.ln(2)


def export_patent_pdf(
    sections: dict[str, str],
    figures: list[dict[str, Any]] | None = None,
    *,
    invention_title: str = "",
    filing_info: dict[str, Any] | None = None,
    client_figure_pngs: dict[int, bytes] | None = None,
    section_labels: dict[str, str] | None = None,
) -> BytesIO:
    """Build a multi-section patent draft PDF and return it as a BytesIO buffer."""
    sections = prepare_sections_for_export(sections)
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
        if key == "cross_reference":
            body = cross_reference_body(filing_info)
        else:
            body = sections.get(key, "").strip()
        if not body:
            continue

        if key in SECTIONS_REQUIRING_PAGE_BREAK_BEFORE:
            pdf.add_page()

        pdf.set_font("Helvetica", style="BU", size=FONT_SIZE_HEADING)
        pdf.cell(
            0,
            10,
            _sanitize_text(section_heading(key, section_labels)),
            new_x=XPos.LMARGIN,
            new_y=YPos.NEXT,
        )
        pdf.set_font("Helvetica", size=FONT_SIZE_BODY)
        _write_section_body(pdf, _sanitize_text(body), key)
        pdf.ln(4)

        if (
            not figures_inserted
            and figure_list
            and key == "brief_description_of_drawings"
        ):
            add_drawing_sheets_pdf(pdf, figure_list, png_by_number)
            figures_inserted = True

    if figure_list and not figures_inserted:
        add_drawing_sheets_pdf(pdf, figure_list, png_by_number)

    buffer = BytesIO()
    pdf.output(buffer)
    buffer.seek(0)
    return buffer
