"""Tests for learning storage and retrieval."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from learning.storage import LearningStorage, reset_storage


@pytest.fixture
def temp_storage(tmp_path: Path) -> LearningStorage:
    db_path = tmp_path / "learning.db"
    return reset_storage(db_path)


def test_submit_draft_persists_snapshots_and_feedback(temp_storage: LearningStorage):
    submission_id = temp_storage.submit_draft(
        invention_title="Hybrid RAG System",
        technical_field="machine learning",
        sections={"claims": "1. A system comprising a retriever."},
        ai_initial_sections={"claims": "1. A system including a retriever."},
        attorney_feedback={"claims": "Use comprising, not including."},
        attorney_feedback_global="Overall tone is good.",
    )

    assert submission_id == 1
    snapshots = temp_storage.get_submission_snapshots(submission_id)
    assert len(snapshots) == 1
    assert snapshots[0]["final_text"].startswith("1. A system comprising")

    feedback = temp_storage.get_submission_feedback(submission_id)
    sections = {row["section"]: row["comment"] for row in feedback}
    assert sections["claims"] == "Use comprising, not including."
    assert sections[None] == "Overall tone is good."


def test_retrieve_exemplars_prefers_matching_technical_field(temp_storage: LearningStorage):
    temp_storage.submit_draft(
        invention_title="A",
        technical_field="robotics",
        sections={"field": "Robotics field text."},
    )
    temp_storage.submit_draft(
        invention_title="B",
        technical_field="machine learning",
        sections={"field": "ML field text."},
    )

    exemplars = temp_storage.retrieve_exemplars("field", "machine learning", limit=1)
    assert len(exemplars) == 1
    assert exemplars[0].text == "ML field text."


def test_upsert_and_list_guidelines(temp_storage: LearningStorage):
    temp_storage.upsert_guidelines("claims", "- Rule one.", source_feedback_count=2)
    temp_storage.upsert_guidelines("claims", "- Updated rule.", source_feedback_count=3)

    assert temp_storage.get_guidelines("claims") == "- Updated rule."
    assert temp_storage.list_all_guidelines()["claims"] == "- Updated rule."
