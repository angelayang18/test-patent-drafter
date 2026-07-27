"""Tests for grant section drafting agents and custom-section support."""

from unittest.mock import patch

import pytest

from drafter.grant_sections import (
    GRANT_SECTIONS,
    draft_all_grant_sections_parallel,
    draft_single_grant_section,
)


def _sample_grant() -> dict:
    return {
        "project_title": "Community AI Literacy Initiative",
        "problem_statement": "Local nonprofits lack AI readiness.",
        "proposed_solution": "Train cohorts with practical AI workflows.",
        "innovation_and_impact": "Measurable digital capacity gains.",
        "target_population": "Nonprofit staff in three counties.",
        "team_qualifications": "Experienced adult educators and technologists.",
        "budget_overview": "Personnel, training materials, and evaluation.",
        "evaluation_plan": "Pre/post skills assessment and retention tracking.",
    }


def test_draft_single_grant_section_returns_content_and_citations_tuple():
    with patch(
        "drafter.grant_sections.generate_text",
        return_value="The project will train nonprofit staff in practical AI workflows.",
    ):
        result = draft_single_grant_section(_sample_grant(), "executive_summary")

    assert isinstance(result, tuple)
    assert len(result) == 2
    content, citations = result
    assert "practical AI workflows" in content
    assert citations == []


def test_draft_all_grant_sections_parallel_covers_all_ids():
    with patch(
        "drafter.grant_sections.generate_text",
        return_value="Drafted grant section body.",
    ):
        sections, citations = draft_all_grant_sections_parallel(_sample_grant())

    assert set(sections) == set(GRANT_SECTIONS)
    assert set(citations) == set(GRANT_SECTIONS)
    for section_id in GRANT_SECTIONS:
        assert sections[section_id] == "Drafted grant section body."
        assert citations[section_id] == []


def test_draft_single_unknown_section_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_single_grant_section(_sample_grant(), "not_a_section")


def test_draft_all_unknown_section_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_all_grant_sections_parallel(
            _sample_grant(), ["executive_summary", "not_a_section"]
        )


def test_draft_custom_section_with_metadata():
    custom = {
        "sustainability": {
            "name": "Sustainability Plan",
            "description": "Describe how the project continues after grant funding ends.",
        }
    }
    with patch(
        "drafter.grant_sections.generate_text",
        return_value="After the grant period, partners will fund a shared training hub.",
    ):
        content, citations = draft_single_grant_section(
            _sample_grant(),
            "sustainability",
            custom_sections=custom,
        )

    assert "training hub" in content
    assert citations == []


def test_draft_custom_section_without_metadata_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_single_grant_section(_sample_grant(), "sustainability")


def test_draft_all_mix_canonical_and_custom():
    custom = {
        "sustainability": {
            "name": "Sustainability Plan",
            "description": "Describe how the project continues after grant funding ends.",
        }
    }

    def _fake_generate(system: str, user: str) -> str:
        if "Sustainability Plan" in system or "Sustainability Plan" in user:
            return "Custom sustainability body."
        return "Canonical executive summary body."

    with patch("drafter.grant_sections.generate_text", side_effect=_fake_generate):
        sections, citations = draft_all_grant_sections_parallel(
            _sample_grant(),
            ["executive_summary", "sustainability"],
            custom_sections=custom,
        )

    assert sections["executive_summary"] == "Canonical executive summary body."
    assert sections["sustainability"] == "Custom sustainability body."
    assert set(citations) == {"executive_summary", "sustainability"}
