"""Tests for baseline drafting guidelines and retrieval merge."""

from __future__ import annotations

from learning.baseline_guidelines import (
    GLOBAL_GUIDELINE_SECTION,
    get_baseline_guidelines,
    merge_guidelines,
)
from learning.guidelines import retrieve_drafting_context
from learning.storage import reset_storage

from drafter.drafting_guidance import format_org_drafting_guidance


def test_baseline_global_guidelines_include_story_arc():
    text = get_baseline_guidelines(GLOBAL_GUIDELINE_SECTION)
    assert "Tell the story" in text
    assert "112(a)" in text
    assert "As used herein" in text


def test_baseline_background_includes_admissions_caution():
    text = get_baseline_guidelines("background")
    assert "admissions" in text.lower()
    assert "Do NOT describe the inventive solution" in text


def test_merge_guidelines_combines_baseline_and_learned():
    merged = merge_guidelines("- Baseline rule.", "- Learned rule.")
    assert "- Baseline rule." in merged
    assert "- Learned rule." in merged


def test_merge_guidelines_returns_baseline_when_learned_empty():
    assert merge_guidelines("- Baseline only.", "") == "- Baseline only."


def test_retrieve_drafting_context_includes_baseline_without_corpus(tmp_path):
    storage = reset_storage(tmp_path / "learning.db")
    context = retrieve_drafting_context("background", "machine learning", storage=storage)
    assert "admissions" in context.global_guidelines.lower()
    assert "problem" in context.section_guidelines.lower()
    assert context.exemplars == []


def test_retrieve_drafting_context_merges_learned_over_baseline(tmp_path):
    storage = reset_storage(tmp_path / "learning.db")
    storage.upsert_guidelines("summary", "- Attorney rule.", source_feedback_count=1)

    context = retrieve_drafting_context("summary", "", storage=storage)
    assert "problem → solution bridge" in context.section_guidelines
    assert "- Attorney rule." in context.section_guidelines


def test_format_org_drafting_guidance_includes_baseline_without_corpus(tmp_path):
    storage = reset_storage(tmp_path / "learning.db")
    context = retrieve_drafting_context("description", "", storage=storage)
    block = format_org_drafting_guidance("description", context)
    assert "ORG-WIDE DRAFTING GUIDELINES" in block
    assert "As used herein" in block
    assert "Definitions" in block or "Definitions subsection" in block
