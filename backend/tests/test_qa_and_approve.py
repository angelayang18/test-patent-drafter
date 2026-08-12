"""Tests for format QA reporting and learning exemplar approval."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from exporter.invention_qa import get_invention_alignment_qa_report
from exporter.text_format import get_format_qa_report
from drafter.grant_sections import GRANT_SECTIONS
from drafter.prompts import PATENT_SECTIONS
from drafter.sow_sections import SOW_SECTIONS
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
        "category": "Format",
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
    assert field_entry == {
        "section": "field",
        "category": "Format",
        "status": "pass",
        "messages": [],
    }


def test_get_format_qa_report_warns_on_insufficient_source_language():
    text = (
        "The provided source material does not provide sufficient detail to draft this section."
    )
    report = get_format_qa_report({"background": text}, document_type="patent")
    background_entry = next(entry for entry in report if entry["section"] == "background")
    assert background_entry["category"] == "Format"
    assert background_entry["status"] == "warn"
    assert background_entry["messages"] == [
        (
            "This section states the source material was insufficient — review before filing. "
            "Try adding more detail to the Technical Problem Being Solved field on the Review "
            "tab, or uploading a source document that covers it."
        ),
    ]


def test_get_format_qa_report_insufficient_source_falls_back_without_hint():
    """Unmapped sections keep the generic insufficient-source message."""
    text = (
        "The provided source material does not provide sufficient detail to draft this section."
    )
    report = get_format_qa_report(
        {"out_of_scope": text},
        canonical_sections=list(SOW_SECTIONS),
        document_type="sow",
    )
    entry = next(item for item in report if item["section"] == "out_of_scope")
    assert entry["status"] == "warn"
    assert entry["messages"] == [
        "This section states the source material was insufficient — review before filing.",
    ]


def test_get_format_qa_report_insufficient_source_hint_for_grant_budget():
    text = (
        "The provided source material does not provide sufficient detail to draft this section."
    )
    report = get_format_qa_report(
        {"budget_narrative": text},
        canonical_sections=list(GRANT_SECTIONS),
        document_type="grant",
    )
    entry = next(item for item in report if item["section"] == "budget_narrative")
    assert entry["status"] == "warn"
    assert entry["messages"] == [
        (
            "This section states the source material was insufficient — review before filing. "
            "Try adding more detail to the Budget Overview field on the Review tab, "
            "or uploading a source document that covers it."
        ),
    ]


def test_get_format_qa_report_fails_invalid_claims():
    report = get_format_qa_report({"claims": "1. First claim.\n\n3. Third claim."})
    claims_entry = next(entry for entry in report if entry["section"] == "claims")
    assert claims_entry["status"] == "fail"
    assert claims_entry["category"] == "Format"
    assert claims_entry["messages"]
    # Format fail messages are unchanged; insufficient-source enrichment is absent here.
    assert all(
        "insufficient" not in message.lower() for message in claims_entry["messages"]
    )
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
    assert response.json() == get_format_qa_report(sections, document_type="patent")


def test_get_format_qa_report_respects_grant_canonical_sections():
    text = (
        "The provided source material does not provide sufficient detail to draft this section."
    )
    report = get_format_qa_report(
        {"executive_summary": text},
        canonical_sections=list(GRANT_SECTIONS),
        document_type="grant",
    )
    assert len(report) == len(GRANT_SECTIONS)
    assert {entry["section"] for entry in report} == set(GRANT_SECTIONS)
    assert all(entry["section"] not in PATENT_SECTIONS for entry in report)
    summary = next(entry for entry in report if entry["section"] == "executive_summary")
    assert summary["status"] == "warn"
    assert summary["messages"] == [
        (
            "This section states the source material was insufficient — review before filing. "
            "Try adding more detail to the Problem Statement and Proposed Solution fields "
            "on the Review tab, or uploading a source document that covers it."
        ),
    ]


def test_format_qa_report_endpoint_for_grant(client: TestClient):
    text = (
        "The provided source material does not provide sufficient detail to draft this section."
    )
    sections = {"executive_summary": text, "problem_statement": "Clear problem narrative."}
    response = client.post(
        "/format-qa-report",
        json={"sections": sections, "document_type": "grant"},
    )
    assert response.status_code == 200
    assert response.json() == get_format_qa_report(
        sections,
        canonical_sections=list(GRANT_SECTIONS),
        document_type="grant",
    )
    assert all(entry["category"] == "Format" for entry in response.json())
    assert not any(entry.get("category") == "Alignment" for entry in response.json())


def test_format_qa_report_endpoint_for_sow(client: TestClient):
    sections = {"purpose": "Engagement purpose and background."}
    response = client.post(
        "/format-qa-report",
        json={"sections": sections, "document_type": "sow"},
    )
    assert response.status_code == 200
    report = response.json()
    assert report == get_format_qa_report(
        sections,
        canonical_sections=list(SOW_SECTIONS),
        document_type="sow",
    )
    assert len(report) == len(SOW_SECTIONS)
    purpose = next(entry for entry in report if entry["section"] == "purpose")
    assert purpose["status"] == "pass"


def test_get_invention_alignment_qa_report_passes_when_draft_covers_requirements():
    invention = {
        "invention_title": "Hybrid Retrieval Pipeline",
        "problem_being_solved": "Existing retrieval systems fail to combine vector and keyword search.",
        "core_technical_solution": "A hybrid retrieval pipeline merges dense embeddings with BM25 scoring.",
        "novel_mechanism": "Dynamic query routing selects retrieval mode based on query intent.",
    }
    sections = {
        "summary": "The Hybrid Retrieval Pipeline addresses limitations in prior search systems.",
        "background": (
            "Existing retrieval systems fail to combine vector and keyword search effectively."
        ),
        "description": (
            "The hybrid retrieval pipeline merges dense embeddings with BM25 scoring during indexing."
        ),
        "claims": (
            "1. A method comprising dynamically routing queries based on query intent classification."
        ),
    }
    report = get_invention_alignment_qa_report(sections, invention)
    assert len(report) == 4
    assert all(entry["status"] == "pass" for entry in report)
    assert all(entry["category"] == "Alignment" for entry in report)


def test_get_invention_alignment_qa_report_warns_on_empty_requirements():
    invention = {
        "invention_title": "",
        "problem_being_solved": "",
        "core_technical_solution": "",
        "novel_mechanism": "",
    }
    sections = {"background": "Some background text."}
    report = get_invention_alignment_qa_report(sections, invention)
    assert len(report) == 4
    assert all(entry["status"] == "warn" for entry in report)
    assert all(entry["category"] == "Alignment" for entry in report)


def test_get_invention_alignment_qa_report_fails_when_section_misses_requirement():
    invention = {
        "invention_title": "Zephyr Flux Harmonizer",
        "problem_being_solved": "Distributed caches suffer from stale invalidation under burst traffic.",
        "core_technical_solution": "An adaptive invalidation scheduler coordinates TTL refresh.",
        "novel_mechanism": "Probabilistic bloom-filter prechecks reduce invalidation fan-out.",
    }
    sections = {
        "background": "Machine learning models require efficient data access.",
        "description": "The system includes a processor and memory.",
        "claims": "1. A system comprising a processor configured to execute instructions.",
    }
    report = get_invention_alignment_qa_report(sections, invention)
    by_section = {entry["section"]: entry for entry in report}
    assert by_section["title"]["status"] == "fail"
    assert by_section["background"]["status"] == "fail"
    assert "technical problem" in by_section["background"]["messages"][0]
    assert by_section["description"]["status"] == "fail"
    assert by_section["claims"]["status"] == "fail"


def test_qa_report_endpoint_includes_invention_alignment(client: TestClient):
    sections = {
        "field": "The present invention relates to data processing.",
        "background": "Existing retrieval systems fail to combine vector and keyword search.",
        "description": "A hybrid retrieval pipeline merges dense embeddings with BM25 scoring.",
        "claims": "1. A method comprising dynamically routing queries based on query intent.",
        "summary": "The Hybrid Retrieval Pipeline improves search quality.",
        "abstract": "A hybrid retrieval pipeline is disclosed.",
    }
    invention = {
        "invention_title": "Hybrid Retrieval Pipeline",
        "technical_field": "information retrieval",
        "problem_being_solved": "Existing retrieval systems fail to combine vector and keyword search.",
        "core_technical_solution": "A hybrid retrieval pipeline merges dense embeddings with BM25 scoring.",
        "novel_mechanism": "Dynamic query routing selects retrieval mode based on query intent.",
        "alternative_embodiments": [],
        "key_components": [],
    }
    response = client.post("/qa-report", json={"sections": sections, "invention": invention})
    assert response.status_code == 200
    report = response.json()
    assert report[: len(PATENT_SECTIONS)] == get_format_qa_report(
        sections, document_type="patent"
    )
    assert report[len(PATENT_SECTIONS) :] == get_invention_alignment_qa_report(sections, invention)
    assert all(entry["category"] == "Format" for entry in report[: len(PATENT_SECTIONS)])
    assert all(entry["category"] == "Alignment" for entry in report[len(PATENT_SECTIONS) :])


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
