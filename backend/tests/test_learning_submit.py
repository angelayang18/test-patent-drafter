"""Tests for POST /learning/submit."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from learning.storage import reset_storage
from main import app


@pytest.fixture
def client(tmp_path):
    reset_storage(tmp_path / "learning.db")
    return TestClient(app)


@patch("main.is_learning_enabled", return_value=True)
@patch("learning.guidelines.generate_text")
def test_submit_succeeds_when_distillation_llm_fails(
    mock_generate,
    _learning_enabled,
    client: TestClient,
):
    mock_generate.side_effect = RuntimeError("Request timed out.")

    response = client.post(
        "/learning/submit",
        json={
            "invention_title": "Hybrid RAG",
            "technical_field": "machine learning",
            "sections": {"claims": "1. A system comprising a retriever."},
            "ai_initial_sections": {"claims": "Draft claim."},
            "attorney_feedback": {"claims": "Use comprising."},
            "include_in_corpus": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["stored"] is True
    assert body["submission_id"] == 1
    assert "distillation_warning" not in body


@patch("main.is_learning_enabled", return_value=True)
@patch("learning.guidelines.generate_text")
def test_submit_skips_distillation_without_feedback_or_edits(
    mock_generate,
    _learning_enabled,
    client: TestClient,
):
    response = client.post(
        "/learning/submit",
        json={
            "invention_title": "Unchanged Draft",
            "technical_field": "robotics",
            "sections": {
                "field": "The field.",
                "claims": "1. A method.",
            },
            "ai_initial_sections": {
                "field": "The field.",
                "claims": "1. A method.",
            },
            "include_in_corpus": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["stored"] is True
    mock_generate.assert_not_called()


@patch("main.is_learning_enabled", return_value=True)
@patch("learning.guidelines.generate_text", return_value="- Updated guidance.")
def test_submit_distills_when_attorney_edited_section(
    mock_generate,
    _learning_enabled,
    client: TestClient,
):
    response = client.post(
        "/learning/submit",
        json={
            "invention_title": "Edited Draft",
            "technical_field": "robotics",
            "sections": {"claims": "1. A system comprising a processor."},
            "ai_initial_sections": {"claims": "1. A system including a processor."},
            "include_in_corpus": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["stored"] is True
    assert mock_generate.call_count == 1
