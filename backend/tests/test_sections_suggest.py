"""Tests for section outline suggestion from sample reports."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from drafter.sections_suggest import (
    MIN_SAMPLE_CHARS,
    suggest_sections_from_samples,
)
from main import app


def _sample_sections() -> list[dict[str, str]]:
    return [
        {"name": "Executive Summary", "description": "High-level findings and recommendations."},
        {"name": "Methods", "description": "Study design and analytical approach."},
        {"name": "Results", "description": "Key quantitative and qualitative outcomes."},
        {"name": "Discussion", "description": "Interpretation and limitations."},
    ]


def _long_sample_text() -> str:
    return (
        "--- quarterly_brief.pdf ---\n"
        "This quarterly operations brief covers executive findings, methods used "
        "to gather metrics, detailed results across product lines, and a discussion "
        "of risks and recommended next steps for the leadership team. " * 3
    )


def test_suggest_sections_from_samples_happy_path():
    expected = _sample_sections()
    style_note = "Formal, concise, leadership-facing tone."

    with patch(
        "drafter.sections_suggest.generate_json",
        return_value={"sections": expected, "style_note": style_note},
    ) as mock_json:
        result = suggest_sections_from_samples(
            _long_sample_text(),
            "Operations Brief",
            description="Internal quarterly ops summary",
        )

    assert result["sections"] == expected
    assert result["style_note"] == style_note
    mock_json.assert_called_once()
    system_arg = mock_json.call_args[0][0]
    user_arg = mock_json.call_args[0][1]
    assert "Operations Brief" in system_arg
    assert "Internal quarterly ops summary" in user_arg


def test_suggest_sections_from_samples_rejects_empty_text():
    with pytest.raises(ValueError, match="empty or too short"):
        suggest_sections_from_samples("   ", "Memo")


def test_suggest_sections_from_samples_rejects_insufficient_text():
    short = "a" * (MIN_SAMPLE_CHARS - 1)
    with pytest.raises(ValueError, match="empty or too short"):
        suggest_sections_from_samples(short, "Memo")


def test_suggest_sections_from_samples_rejects_empty_name():
    with pytest.raises(ValueError, match="document_type_name"):
        suggest_sections_from_samples(_long_sample_text(), "   ")


def test_suggest_document_type_sections_route_happy_path():
    client = TestClient(app)
    expected = _sample_sections()
    payload = {"sections": expected, "style_note": "Formal tone."}

    with patch("main.suggest_sections_from_samples", return_value=payload):
        response = client.post(
            "/document-types/suggest-sections",
            json={
                "combined_text": _long_sample_text(),
                "document_type_name": "Operations Brief",
                "description": "Quarterly ops summary",
            },
        )

    assert response.status_code == 200
    assert response.json() == payload


def test_suggest_document_type_sections_route_empty_combined_text():
    client = TestClient(app)
    response = client.post(
        "/document-types/suggest-sections",
        json={
            "combined_text": "   ",
            "document_type_name": "Memo",
        },
    )
    assert response.status_code == 400
    assert "combined_text" in response.json()["detail"]


def test_suggest_document_type_sections_route_insufficient_sample_text():
    client = TestClient(app)
    short = "short sample " * 2  # well under MIN_SAMPLE_CHARS after strip
    assert len(short.strip()) < MIN_SAMPLE_CHARS

    response = client.post(
        "/document-types/suggest-sections",
        json={
            "combined_text": short,
            "document_type_name": "Memo",
        },
    )
    assert response.status_code == 400
    detail = response.json()["detail"].lower()
    assert "empty" in detail or "short" in detail
