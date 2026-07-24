"""Tests for title suggestion (suggest_titles + /extract/titles)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from drafter.titles import TITLE_MAX_LENGTH, _normalize_titles, suggest_titles
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
