"""Generate a PDF patent draft from section text."""

from __future__ import annotations

from io import BytesIO

from fpdf import FPDF

from exporter.docx_export import SECTION_TITLES, _ordered_section_keys

FONT_SIZE_BODY = 11
FONT_SIZE_HEADING = 14
FONT_SIZE_TITLE = 18
MARGIN_MM = 20
LINE_HEIGHT = 6


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


def _write_paragraph(pdf: FPDF, text: str) -> None:
    for paragraph in text.split("\n"):
        line = paragraph.strip()
        if not line:
            pdf.ln(LINE_HEIGHT / 2)
            continue
        pdf.multi_cell(0, LINE_HEIGHT, line)
        pdf.ln(2)


def export_patent_pdf(sections: dict[str, str]) -> BytesIO:
    """Build a multi-section patent draft PDF and return it as a BytesIO buffer."""
    pdf = _PatentPdf()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=MARGIN_MM)
    pdf.set_margins(MARGIN_MM, MARGIN_MM, MARGIN_MM)
    pdf.add_page()

    pdf.set_font("Helvetica", style="B", size=FONT_SIZE_TITLE)
    pdf.cell(0, 12, "Provisional Patent Application Draft", ln=True)
    pdf.ln(4)

    for key in _ordered_section_keys(sections):
        heading = SECTION_TITLES.get(key, key.replace("_", " ").title())
        body = sections[key].strip()
        if not body:
            continue

        pdf.set_font("Helvetica", style="B", size=FONT_SIZE_HEADING)
        pdf.cell(0, 10, _sanitize_text(heading), ln=True)
        pdf.set_font("Helvetica", size=FONT_SIZE_BODY)
        _write_paragraph(pdf, _sanitize_text(body))
        pdf.ln(4)

    buffer = BytesIO()
    pdf.output(buffer)
    buffer.seek(0)
    return buffer
