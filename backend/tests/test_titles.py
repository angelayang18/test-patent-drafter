"""Tests for title suggestion (suggest_titles + /extract/titles)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from drafter.titles import (
    TITLE_MAX_LENGTH,
    _normalize_titles,
    suggest_generic_titles,
    suggest_titles,
)
from main import app


def _five_titles(*labels: str) -> list[str]:
    base = list(labels) if labels else [f"Title {i}" for i in range(1, 6)]
    while len(base) < 5:
        base.append(f"Extra Title {len(base) + 1}")
    return base[:5]


def test_suggest_titles_patent_returns_five(monkeypatch):
    expected = _five_titles(
        "Adaptive Document Chunking System",
        "Context-Aware Text Segmentation Method",
        "Hierarchical Document Partitioning Apparatus",
        "Semantic Chunk Boundary Detection System",
        "Dynamic Passage Windowing Method",
    )

    with patch("drafter.titles.generate_json", return_value={"titles": expected}) as mock_json:
        result = suggest_titles("Source material about document chunking.", "patent")

    assert result == expected
    mock_json.assert_called_once()
    system_arg = mock_json.call_args[0][0]
    assert "patent" in system_arg.lower() or "provisional" in system_arg.lower()


def test_suggest_titles_grant_returns_five():
    expected = _five_titles(
        "Expanding Community Health Access",
        "Rural Clinic Capacity Building Initiative",
        "Strengthening Preventive Care Networks",
        "Community-Based Wellness Expansion Project",
        "Improving Underserved Patient Outcomes",
    )

    with patch("drafter.titles.generate_json", return_value={"titles": expected}) as mock_json:
        result = suggest_titles("Source material about a community health grant.", "grant")

    assert result == expected
    system_arg = mock_json.call_args[0][0]
    assert "grant" in system_arg.lower()


def test_suggest_titles_sow_returns_five():
    expected = _five_titles(
        "Clinical Data Integration Engagement",
        "Bioanalytical Assay Development Services",
        "Regulatory Submission Support Work Order",
        "Laboratory Method Transfer Engagement",
        "Sample Analysis and Reporting Services",
    )

    with patch("drafter.titles.generate_json", return_value={"titles": expected}) as mock_json:
        result = suggest_titles("Source material about a clinical SOW.", "sow")

    assert result == expected
    system_arg = mock_json.call_args[0][0]
    assert "statement of work" in system_arg.lower() or "engagement" in system_arg.lower()


def test_suggest_titles_ada_returns_five():
    expected = _five_titles(
        "Anti-Drug Antibody Detection Study",
        "Immunogenicity Assay Validation Report",
        "ADA Screening and Confirmatory Analysis",
        "Neutralizing Antibody Bioanalytical Study",
        "Serum ADA Method Qualification Report",
    )

    with patch("drafter.titles.generate_json", return_value={"titles": expected}) as mock_json:
        result = suggest_titles("Source material about an ADA study.", "ada")

    assert result == expected
    system_arg = mock_json.call_args[0][0]
    assert "ada" in system_arg.lower() or "bioanalytical" in system_arg.lower()


def test_suggest_generic_titles_returns_five():
    expected = _five_titles(
        "Quarterly Operations Brief",
        "Internal Process Update Memo",
        "Cross-Team Coordination Summary",
        "Project Status Working Document",
        "Operational Readiness Briefing",
    )

    with patch("drafter.titles.generate_json", return_value={"titles": expected}) as mock_json:
        result = suggest_generic_titles(
            "Source material about an internal brief.",
            "Internal Brief",
            current="Old Brief Title",
        )

    assert result["titles"] == expected
    assert "citations" in result
    assert isinstance(result["citations"], list)
    system_arg = mock_json.call_args[0][0]
    user_arg = mock_json.call_args[0][1]
    assert "Internal Brief" in system_arg
    assert "Old Brief Title" in user_arg


def test_suggest_generic_titles_rejects_empty_label():
    with pytest.raises(ValueError, match="document_type_label"):
        suggest_generic_titles("Some source text.", "   ")


def test_suggest_titles_rejects_empty_combined_text():
    with pytest.raises(ValueError, match="combined_text is required"):
        suggest_titles("   ", "patent")


def test_suggest_titles_rejects_invalid_document_kind():
    with pytest.raises(ValueError, match="document_kind"):
        suggest_titles("Some source text about an invention.", "memo")


def test_normalize_titles_strips_dedupes_and_truncates():
    long = "A" * (TITLE_MAX_LENGTH + 50)
    raw = [
        "  First Title  ",
        "first title",
        "",
        "Second Title",
        long,
        "Third Title",
        "Fourth Title",
        "Fifth Title",
        "Sixth Title",
    ]
    result = _normalize_titles(raw)
    assert len(result) == 5
    assert result[0] == "First Title"
    assert result[1] == "Second Title"
    assert len(result[2]) == TITLE_MAX_LENGTH
    assert result[2] == "A" * TITLE_MAX_LENGTH


def test_normalize_titles_raises_when_fewer_than_five():
    with pytest.raises(ValueError, match="Expected 5"):
        _normalize_titles(["One", "Two", "Three"])


def test_suggest_titles_includes_current_and_relevance_in_prompt():
    expected = _five_titles()
    with patch("drafter.titles.generate_json", return_value={"titles": expected}) as mock_json:
        suggest_titles(
            "Technical docs about widgets.",
            "patent",
            current="Old Widget Title",
            relevant_notes="Focus on the latch mechanism",
            irrelevant_notes="Ignore marketing slides",
        )

    user_arg = mock_json.call_args[0][1]
    assert "Old Widget Title" in user_arg
    assert "latch mechanism" in user_arg
    assert "marketing slides" in user_arg


def test_extract_titles_route_returns_400_for_empty_combined_text():
    client = TestClient(app)
    response = client.post(
        "/extract/titles",
        json={"combined_text": "   ", "document_kind": "patent"},
    )
    assert response.status_code == 400
    assert "combined_text" in response.json()["detail"]


def test_extract_titles_route_returns_titles():
    client = TestClient(app)
    expected = _five_titles(
        "Alpha Title",
        "Beta Title",
        "Gamma Title",
        "Delta Title",
        "Epsilon Title",
    )

    with patch("main.suggest_titles", return_value=expected):
        response = client.post(
            "/extract/titles",
            json={
                "combined_text": "Detailed invention source.",
                "document_kind": "patent",
                "current": "Existing Title",
            },
        )

    assert response.status_code == 200
    assert response.json() == {"titles": expected}


def test_extract_generic_titles_route_returns_titles():
    client = TestClient(app)
    expected = _five_titles(
        "Alpha Title",
        "Beta Title",
        "Gamma Title",
        "Delta Title",
        "Epsilon Title",
    )
    payload = {
        "titles": expected,
        "citations": [
            {
                "label": "brief.pdf",
                "location": "Paragraph 1",
                "excerpt": "Existing Title overview.",
            }
        ],
    }

    with patch("main.suggest_generic_titles", return_value=payload):
        response = client.post(
            "/extract/titles/generic",
            json={
                "combined_text": "Detailed custom document source.",
                "document_type_label": "White Paper",
                "current": "Existing Title",
            },
        )

    assert response.status_code == 200
    assert response.json() == payload


def test_extract_generic_titles_route_returns_400_for_empty_combined_text():
    client = TestClient(app)
    response = client.post(
        "/extract/titles/generic",
        json={"combined_text": "   ", "document_type_label": "Memo"},
    )
    assert response.status_code == 400
    assert "combined_text" in response.json()["detail"]


def test_extract_generic_title_citations_route_returns_citations():
    client = TestClient(app)
    combined = (
        "--- whitepaper.pdf ---\n"
        "The Adaptive Workflow Orchestrator coordinates multi-team handoffs "
        "across quarterly planning cycles and operational readiness reviews.\n"
    )
    response = client.post(
        "/extract/titles/generic/citations",
        json={
            "combined_text": combined,
            "document_type_label": "White Paper",
            "title": "Adaptive Workflow Orchestrator Brief",
        },
    )
    assert response.status_code == 200
    citations = response.json()["citations"]
    assert citations
    assert citations[0]["label"] == "whitepaper.pdf"
    assert "orchestrator" in citations[0]["excerpt"].lower()


def test_extract_generic_title_citations_route_returns_400_for_empty_combined_text():
    client = TestClient(app)
    response = client.post(
        "/extract/titles/generic/citations",
        json={
            "combined_text": "   ",
            "document_type_label": "Memo",
            "title": "Some Title",
        },
    )
    assert response.status_code == 400
    assert "combined_text" in response.json()["detail"]
