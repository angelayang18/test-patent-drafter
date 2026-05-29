"""Generate a PDF patent draft by exporting DOCX and converting it to PDF."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from exporter.docx_export import export_patent_docx
from exporter.docx_to_pdf import convert_docx_bytes_to_pdf


def export_patent_pdf(
    sections: dict[str, str],
    figures: list[dict[str, Any]] | None = None,
    *,
    invention_title: str = "",
    filing_info: dict[str, Any] | None = None,
    client_figure_pngs: dict[int, bytes] | None = None,
) -> BytesIO:
    """
    Build a patent draft PDF by generating the DOCX export and converting it.

    This guarantees the PDF matches the Word document formatting exactly.
    """
    docx_buffer = export_patent_docx(
        sections,
        figures,
        invention_title=invention_title,
        filing_info=filing_info,
        client_figure_pngs=client_figure_pngs,
    )
    pdf_bytes = convert_docx_bytes_to_pdf(docx_buffer.getvalue())
    buffer = BytesIO(pdf_bytes)
    buffer.seek(0)
    return buffer
