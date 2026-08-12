"""Tests for generic (non-patent) figure generation and export embedding."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import patch

from docx import Document
from fastapi.testclient import TestClient

from exporter.grant_export import export_grant_docx
from main import app

client = TestClient(app)

_SAMPLE_FIGURE = {
    "number": 1,
    "title": "System overview",
    "brief_description": "Diagram showing the overall system architecture.",
    "reference_numerals": {},
    "mermaid": "graph TD\nA[Input] --> B[Process]",
}


def _figure_response(number: int = 1) -> dict:
    return {
        "figure": {
            **_SAMPLE_FIGURE,
            "number": number,
            "title": f"Figure {number}",
            "brief_description": f"Supporting diagram {number}.",
            "mermaid": f"flowchart TD\nA{number} --> B{number}",
        }
    }


@patch("drafter.figures.generate_json")
def test_generate_generic_figures_endpoint(mock_generate_json):
    mock_generate_json.side_effect = lambda *_args, **_kwargs: _figure_response(1)

    response = client.post(
        "/figures/generate/generic",
        json={
            "document_type_label": "grant application",
            "document_title": "Climate Resilience Project",
            "combined_text": "A project to improve climate resilience through monitoring.",
            "num_figures": 1,
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "figures" in data
    assert len(data["figures"]) == 1
    assert data["figures"][0]["number"] == 1
    assert data["figures"][0]["mermaid"]
    assert "brief_description_of_drawings" not in data
    mock_generate_json.assert_called()


@patch("drafter.figures.generate_json")
def test_regenerate_generic_figure_endpoint(mock_generate_json):
    mock_generate_json.return_value = {
        "figure": {
            "number": 2,
            "title": "Process flow",
            "brief_description": "Regenerated process diagram.",
            "reference_numerals": {},
            "mermaid": "classDiagram\nclass Foo",
        }
    }

    response = client.post(
        "/figures/regenerate-one/generic",
        json={
            "document_type_label": "SOW",
            "document_title": "Implementation Engagement",
            "combined_text": "Vendor will deliver integration services.",
            "figure_number": 2,
            "existing_figures": [
                {
                    "number": 1,
                    "title": "Overview",
                    "brief_description": "High-level overview.",
                    "reference_numerals": {},
                    "mermaid": "graph TD\nA-->B",
                },
                {
                    "number": 2,
                    "title": "Old process",
                    "brief_description": "Old process diagram.",
                    "reference_numerals": {},
                    "mermaid": "flowchart TD\nX-->Y",
                },
            ],
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert "figure" in data
    assert data["figure"]["number"] == 2
    assert "classDiagram" in data["figure"]["mermaid"]
    mock_generate_json.assert_called()


@patch("exporter.grant_export.prerender_figure_pngs", return_value={})
def test_grant_export_with_figures_embeds_drawing_sheet(mock_prerender):
    sections = {
        "executive_summary": "This grant supports climate monitoring infrastructure.",
        "methodology": "We will deploy sensors and analyze telemetry.",
    }
    figures = [
        {
            "number": 1,
            "title": "Architecture",
            "brief_description": "System architecture diagram.",
            "reference_numerals": {},
            "mermaid": "graph TD\nA-->B",
        }
    ]

    without_figures = export_grant_docx(
        sections,
        project_title="Climate Grant",
    )
    with_figures = export_grant_docx(
        sections,
        figures,
        project_title="Climate Grant",
    )

    doc_without = Document(BytesIO(without_figures.getvalue()))
    doc_with = Document(BytesIO(with_figures.getvalue()))

    assert len(doc_with.paragraphs) > len(doc_without.paragraphs)
    sheet_text = "\n".join(p.text for p in doc_with.paragraphs)
    assert "1/1" in sheet_text
    mock_prerender.assert_called_once()
