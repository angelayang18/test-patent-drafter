"""Regression tests for PDF export layout."""

from unittest.mock import patch

from exporter.pdf_export import export_patent_pdf


def test_export_patent_pdf_uses_docx_conversion_pipeline():
    """PDF export should be generated from the DOCX export via conversion."""
    sections = {
        "abstract": "First abstract sentence.\n\nSecond abstract sentence.",
        "claims": (
            "1. A system comprising:\n"
            "  a first module;\n"
            "  a second module.\n\n"
            "2. The system of claim 1, wherein the first module processes data."
        ),
        "description": (
            "1. Overview — Body text for the first subsection.\n\n"
            "2. Architecture — Body text for the second subsection."
        ),
    }
    fake_pdf = b"%PDF-1.7\n% fake converted pdf\n"

    with patch(
        "exporter.pdf_export.convert_docx_bytes_to_pdf",
        return_value=fake_pdf,
    ) as convert_mock:
        buffer = export_patent_pdf(
            sections,
            invention_title="Test invention",
            filing_info={
                "inventor_name": "Jane Inventor",
                "inventor_city": "Boston",
                "correspondence_name": "Jane Inventor",
                "correspondence_address": "1 Main St\nBoston, MA",
            },
        )

    assert buffer.getvalue() == fake_pdf
    convert_mock.assert_called_once()
    docx_bytes = convert_mock.call_args.args[0]
    assert docx_bytes[:2] == b"PK"
