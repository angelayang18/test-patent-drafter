"""Generate PTO/SB/16-style provisional application cover sheet content."""

from __future__ import annotations

from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt

COVER_SHEET_TITLE = "PROVISIONAL APPLICATION FOR PATENT COVER SHEET (PTO/SB/16)"


def _inventor_residence(filing_info: dict[str, Any]) -> str:
    parts = [
        str(filing_info.get("inventor_city", "")).strip(),
        str(filing_info.get("inventor_state", "")).strip(),
        str(filing_info.get("inventor_country", "")).strip(),
    ]
    return ", ".join(part for part in parts if part)


def _has_cover_sheet_data(filing_info: dict[str, Any] | None, title: str) -> bool:
    if not title.strip():
        return False
    if not filing_info:
        return False
    return any(
        str(filing_info.get(key, "")).strip()
        for key in (
            "inventor_name",
            "inventor_city",
            "correspondence_name",
            "correspondence_address",
        )
    )


def add_cover_sheet_docx(
    doc: Document,
    *,
    invention_title: str,
    filing_info: dict[str, Any] | None,
) -> None:
    """Insert a PTO/SB/16-style cover sheet as the first page of the document."""
    if not _has_cover_sheet_data(filing_info, invention_title):
        return

    info = filing_info or {}
    title = invention_title.strip()
    inventor_name = str(info.get("inventor_name", "")).strip() or "[Inventor name]"
    residence = _inventor_residence(info) or "[City, State, Country]"
    correspondence_name = str(info.get("correspondence_name", "")).strip() or inventor_name
    correspondence_address = (
        str(info.get("correspondence_address", "")).strip() or "[Correspondence address]"
    )
    correspondence_email = str(info.get("correspondence_email", "")).strip()

    heading = doc.add_paragraph()
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = heading.add_run(COVER_SHEET_TITLE)
    run.bold = True
    run.font.size = Pt(12)

    doc.add_paragraph()

    def add_label_value(label: str, value: str) -> None:
        paragraph = doc.add_paragraph()
        label_run = paragraph.add_run(f"{label}: ")
        label_run.bold = True
        paragraph.add_run(value)

    add_label_value("Title of the invention", title)
    add_label_value(
        "Inventor",
        f"{inventor_name}, residing at {residence}",
    )
    add_label_value("Correspondence address", correspondence_name)
    for line in correspondence_address.splitlines():
        if line.strip():
            doc.add_paragraph(line.strip())
    if correspondence_email:
        add_label_value("Email", correspondence_email)

    doc.add_page_break()

