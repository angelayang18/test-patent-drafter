"""Tests for section reflection and org-guidance injection."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from drafter.section_agents import draft_section_agent
from exporter.text_format import validate_section_output


def test_validate_section_output_flags_empty_claims():
    errors = validate_section_output("claims", "")
    assert errors
    assert "No claims" in errors[0]


def test_validate_section_output_flags_long_abstract():
    words = " ".join(["word"] * 160)
    errors = validate_section_output("abstract", words)
    assert any("150 words" in error for error in errors)


@patch("drafter.section_agents.is_section_reflection_enabled", return_value=True)
@patch("drafter.section_agents.generate_text")
@patch("drafter.section_agents.retrieve_drafting_context")
def test_reflection_retries_on_validation_errors(
    mock_retrieve,
    mock_generate,
    _mock_reflection_enabled,
):
    from learning.storage import DraftingContext

    mock_retrieve.return_value = DraftingContext("", "", [])

    bad_claims = "A system comprising a processor."
    good_claims = "1. A system comprising a processor configured to retrieve documents."
    mock_generate.side_effect = [bad_claims, good_claims]

    invention = {"technical_field": "AI", "invention_title": "Test"}
    content, citations = draft_section_agent(invention, "claims")

    assert content.startswith("1.")
    assert citations == []
    assert mock_generate.call_count == 2


@patch("drafter.section_agents.generate_text")
@patch("drafter.section_agents.retrieve_drafting_context")
def test_draft_includes_org_guidance_in_prompt(mock_retrieve, mock_generate):
    from learning.storage import DraftingContext

    mock_retrieve.return_value = DraftingContext(
        section_guidelines="- Prefer comprising.",
        global_guidelines="- Formal tone.",
        exemplars=[],
    )
    mock_generate.return_value = "1. A method comprising steps."

    invention = {
        "invention_title": "Test",
        "technical_field": "AI",
        "problem_being_solved": "Problem",
        "core_technical_solution": "Solution",
        "novel_mechanism": "Mechanism",
        "alternative_embodiments": [],
        "key_components": [],
    }

    draft_section_agent(
        invention,
        "claims",
        prior_draft="Old draft",
        attorney_feedback="Use narrower scope.",
    )

    user_prompt = mock_generate.call_args[0][1]
    assert "ORG-WIDE DRAFTING GUIDELINES" in user_prompt
    assert "Prefer comprising" in user_prompt
    assert "SAME-DRAFT REFINEMENT CONTEXT" in user_prompt
    assert "Use narrower scope." in user_prompt
