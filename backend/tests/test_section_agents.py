"""Tests for per-section drafting agents."""

from unittest.mock import patch

import pytest

from drafter.patent_template import (
    PROVISIONAL_FILING_OVERVIEW,
    get_section_template_instructions,
)
from drafter.section_agents import (
    draft_all_sections_parallel,
    draft_section_agent,
    get_custom_section_agent_system,
    get_section_agent_system,
)
from drafter.prompts import PATENT_SECTIONS


def _sample_invention() -> dict:
    return {
        "invention_title": "Retrieval-Augmented Search System",
        "technical_field": "Artificial intelligence",
        "problem_being_solved": "Ungrounded answers in enterprise search.",
        "core_technical_solution": "Hybrid retrieval with citation grounding.",
        "novel_mechanism": "Query-aware chunk reranking.",
        "key_components": ["retriever", "reranker"],
        "alternative_embodiments": ["On-prem deployment"],
        "industries": "Enterprise software",
    }


def test_agent_system_is_section_specific():
    field_sys = get_section_agent_system("field")
    claims_sys = get_section_agent_system("claims")
    assert "Field of the Invention" in field_sys
    assert "Informal Patent Claims" in claims_sys
    assert field_sys != claims_sys


def test_provisional_overview_covers_enablement_and_deadline():
    assert "112(a)" in PROVISIONAL_FILING_OVERVIEW
    assert "12 months" in PROVISIONAL_FILING_OVERVIEW


def test_claims_slot_requires_at_least_one_claim():
    claims = get_section_template_instructions("claims")
    assert "at least one claim" in claims.lower()


def test_template_instructions_cover_all_sections():
    for section in PATENT_SECTIONS:
        text = get_section_template_instructions(section)
        assert "TEMPLATE SLOT" in text


def test_parallel_draft_rejects_unknown_section():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_all_sections_parallel({}, ["not_a_section"])


def test_custom_section_agent_system_includes_name_and_description():
    system = get_custom_section_agent_system(
        "Best Mode",
        "Describe the best mode contemplated by the inventors.",
    )
    assert "Best Mode" in system
    assert "best mode contemplated" in system
    assert PROVISIONAL_FILING_OVERVIEW in system


def test_draft_custom_section_with_metadata():
    custom = {
        "best_mode": {
            "name": "Best Mode",
            "description": "Describe the best mode contemplated by the inventors.",
        }
    }
    with patch(
        "drafter.section_agents.generate_text",
        return_value="In the best mode, the system uses hybrid retrieval.",
    ):
        content, citations = draft_section_agent(
            _sample_invention(),
            "best_mode",
            custom_sections=custom,
        )

    assert "hybrid retrieval" in content
    assert citations == []


def test_draft_custom_section_without_metadata_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_section_agent(_sample_invention(), "best_mode")


def test_draft_all_mix_canonical_and_custom():
    custom = {
        "best_mode": {
            "name": "Best Mode",
            "description": "Describe the best mode contemplated by the inventors.",
        }
    }

    def _fake_generate(system: str, user: str) -> str:
        if "Best Mode" in system or "Best Mode" in user:
            return "Custom best mode body."
        return "Canonical field body."

    with patch("drafter.section_agents.generate_text", side_effect=_fake_generate):
        sections, citations = draft_all_sections_parallel(
            _sample_invention(),
            ["field", "best_mode"],
            custom_sections=custom,
        )

    assert sections["field"] == "Canonical field body."
    assert sections["best_mode"] == "Custom best mode body."
    assert set(citations) == {"field", "best_mode"}
