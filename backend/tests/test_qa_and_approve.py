"""Tests for format QA reporting and learning exemplar approval."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from exporter.text_format import get_format_qa_report
from drafter.prompts import PATENT_SECTIONS
from learning.storage import reset_storage
from main import app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    reset_storage(tmp_path / "learning.db")
    return TestClient(app)


def test_get_format_qa_report_warns_on_empty_section():
    report = get_format_qa_report({"field": "   "})
    assert len(report) == len(PATENT_SECTIONS)
    field_entry = next(entry for entry in report if entry["section"] == "field")
    assert field_entry == {
        "section": "field",
        "status": "warn",
        "messages": ["Section is empty."],
    }
    assert sum(1 for entry in report if entry["status"] == "warn") == len(PATENT_SECTIONS)


def test_get_format_qa_report_warns_for_all_missing_sections():
    report = get_format_qa_report({})
    assert len(report) == len(PATENT_SECTIONS)
    assert {entry["section"] for entry in report} == set(PATENT_SECTIONS)
    assert all(entry["status"] == "warn" for entry in report)
    assert all(entry["messages"] == ["Section is empty."] for entry in report)


def test_get_format_qa_report_warns_for_all_sections_when_only_one_key_sent():
    """Payloads may only include keys the client has touched — still check all six sections."""
    report = get_format_qa_report({"field": ""})
    assert len(report) == len(PATENT_SECTIONS)
    assert {entry["section"] for entry in report} == set(PATENT_SECTIONS)
    assert all(entry["status"] == "warn" for entry in report)
    assert all(entry["messages"] == ["Section is empty."] for entry in report)


def test_get_format_qa_report_warns_only_for_unfilled_sections():
    report = get_format_qa_report(
        {"field": "The present invention relates to data processing."},
    )
    assert len(report) == len(PATENT_SECTIONS)
    field_entry = next(entry for entry in report if entry["section"] == "field")
    assert field_entry["status"] == "pass"
    empty_entries = [entry for entry in report if entry["section"] != "field"]
    assert len(empty_entries) == len(PATENT_SECTIONS) - 1
    assert all(entry["status"] == "warn" for entry in empty_entries)


def test_get_format_qa_report_passes_valid_section():
    report = get_format_qa_report({"field": "The present invention relates to data processing."})
    field_entry = next(entry for entry in report if entry["section"] == "field")
    assert field_entry == {"section": "field", "status": "pass", "messages": []}


def test_get_format_qa_report_fails_invalid_claims():
    report = get_format_qa_report({"claims": "1. First claim.\n\n3. Third claim."})
    claims_entry = next(entry for entry in report if entry["section"] == "claims")
    assert claims_entry["status"] == "fail"
    assert claims_entry["messages"]
    empty_entries = [entry for entry in report if entry["section"] != "claims"]
    assert len(empty_entries) == len(PATENT_SECTIONS) - 1
    assert all(entry["status"] == "warn" for entry in empty_entries)


def test_qa_report_endpoint_returns_format_qa_report(client: TestClient):
    sections = {
        "field": "",
        "claims": "1. A system comprising a processor.",
    }
    response = client.post("/qa-report", json={"sections": sections})
    assert response.status_code == 200
    assert response.json() == get_format_qa_report(sections)


@patch("main.is_learning_enabled", return_value=True)
def test_approve_exemplar_endpoint_marks_snapshot(
    _mock_learning_enabled: object,
    client: TestClient,
    tmp_path: Path,
):
    storage = reset_storage(tmp_path / "learning.db")
    submission_id = storage.submit_draft(
        invention_title="Test",
        technical_field="machine learning",
        sections={"field": "Approved field text."},
    )

    response = client.post(
        f"/learning/submissions/{submission_id}/approve",
        json={"section": "field"},
    )
    assert response.status_code == 200
    assert response.json() == {"success": True, "approved": True}

    exemplars = storage.retrieve_exemplars("field", "machine learning", limit=1)
    assert len(exemplars) == 1
    assert exemplars[0].text == "Approved field text."


@patch("main.is_learning_enabled", return_value=False)
def test_approve_exemplar_endpoint_skips_when_learning_disabled(
    _mock_learning_enabled: object,
    client: TestClient,
):
    response = client.post("/learning/submissions/1/approve", json={"section": "field"})
    assert response.status_code == 200
    assert response.json()["approved"] is False
