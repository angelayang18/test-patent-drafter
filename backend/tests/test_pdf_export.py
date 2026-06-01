"""Regression tests for PDF export layout (fpdf2 cursor handling)."""

from io import BytesIO

from fpdf import FPDF

from exporter.cover_sheet import add_cover_sheet_pdf
from exporter.pdf_export import (
    _add_drawing_sheets,
    _sanitize_text,
    _write_description_paragraph,
    export_patent_pdf,
)


def test_pdf_export_multiline_correspondence_address():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    add_cover_sheet_pdf(
        pdf,
        invention_title="Widget Controller",
        filing_info={
            "inventor_name": "Jane Doe",
            "inventor_city": "San Francisco",
            "correspondence_name": "Jane Doe",
            "correspondence_address": "123 Main St\nSuite 400\nSan Francisco, CA",
        },
        sanitize_text=_sanitize_text,
    )
    buffer = BytesIO()
    pdf.output(buffer)


def test_pdf_export_mermaid_fallback_without_png():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    _add_drawing_sheets(
        pdf,
        [{"number": 1, "mermaid": "graph TD\nA-->B"}],
        {},
    )
    buffer = BytesIO()
    pdf.output(buffer)


def test_description_list_item_body_uses_full_page_width():
    """Numbered step bodies must not inherit a mid-page x from inline headers."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_margins(20, 20, 20)
    pdf.set_font("Helvetica", size=11)
    paragraph = (
        "3. Pre-Indexing Knowledge Synthesis: "
        + "The knowledge generation module processes said blocks, "
        + "injecting knowledge-derived tokens into the retrieval index."
    )
    _write_description_paragraph(pdf, paragraph)
    buffer = BytesIO()
    pdf.output(buffer)
    assert buffer.getvalue()[:4] == b"%PDF"


def test_export_patent_pdf_with_figures_and_filing_info():
    buffer = export_patent_pdf(
        {"summary": "A system for processing signals."},
        [{"number": 1, "mermaid": "graph LR\nA-->B"}],
        invention_title="Signal Processor",
        filing_info={
            "inventor_name": "Jane Doe",
            "inventor_city": "Boston",
            "correspondence_name": "Jane Doe",
            "correspondence_address": "1 Patent Way\nFloor 2",
        },
    )
    assert buffer.getvalue()[:4] == b"%PDF"
