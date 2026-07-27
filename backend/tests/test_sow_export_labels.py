"""Tests for SOW export heading label overrides."""

from docx import Document

from exporter.sow_export import export_sow_docx


def test_sow_docx_uses_section_labels_for_custom_ids():
    buffer = export_sow_docx(
        {
            "purpose": "Purpose body.",
            "risk_register": "Risk register body.",
        },
        engagement_title="Portal SOW",
        section_labels={"risk_register": "Risk Register"},
    )
    doc = Document(buffer)
    texts = [p.text for p in doc.paragraphs]
    assert any("2. Risk Register" in text for text in texts)
    assert not any("risk_register" in text for text in texts)
