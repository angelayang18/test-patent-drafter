"""Tests for guideline distillation on learning submit."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from learning.guidelines import distill_guidelines_for_submission
from learning.storage import reset_storage


@pytest.fixture
def temp_storage(tmp_path):
    return reset_storage(tmp_path / "learning.db")


@patch("learning.guidelines.generate_text")
@patch("learning.guidelines.is_learning_enabled", return_value=True)
def test_distill_guidelines_updates_section_rules(
    _learning_enabled,
    mock_generate,
    temp_storage,
):
    mock_generate.return_value = "- Updated claims guidance."

    submission_id = temp_storage.submit_draft(
        invention_title="Test",
        technical_field="AI",
        sections={"claims": "1. Final claim."},
        ai_initial_sections={"claims": "Draft claim."},
        attorney_feedback={"claims": "Add dependent claims."},
    )

    distill_guidelines_for_submission(submission_id, storage=temp_storage)

    assert temp_storage.get_guidelines("claims") == "- Updated claims guidance."
    assert mock_generate.call_count == 1


@patch("learning.guidelines.generate_text")
@patch("learning.guidelines.is_learning_enabled", return_value=True)
def test_distill_skips_unchanged_sections_without_feedback(
    _learning_enabled,
    mock_generate,
    temp_storage,
):
    submission_id = temp_storage.submit_draft(
        invention_title="Test",
        technical_field="AI",
        sections={"claims": "1. Final claim."},
        ai_initial_sections={"claims": "1. Final claim."},
    )

    distill_guidelines_for_submission(submission_id, storage=temp_storage)

    mock_generate.assert_not_called()
