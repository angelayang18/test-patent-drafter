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
from drafter.prompts import PATENT_SECTIONS, get_background_prompt, get_description_prompt


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


def test_agent_system_includes_grounding_instruction():
    field_sys = get_section_agent_system("field")
    custom_sys = get_custom_section_agent_system(
        "Best Mode",
        "Describe the best mode contemplated by the inventors.",
    )
    for system in (field_sys, custom_sys):
        assert "Ground every claim" in system
        assert "N/A" in system
        assert "sufficient detail" in system


def test_background_prompt_does_not_hardcode_rag_chunking_focus():
    """Regression: Background must not force RAG/chunking prior-art themes.

    A leftover invention-specific focus block caused Background to draft confident
    RAG/chunking content even when invention fields were N/A.
    """
    prompt = get_background_prompt(
        {
            "invention_title": "N/A",
            "technical_field": "N/A",
            "problem_being_solved": "N/A",
            "core_technical_solution": "N/A",
            "novel_mechanism": "N/A",
            "key_components": [],
            "alternative_embodiments": [],
        }
    )
    assert "Fixed-size/sentence-boundary chunking" not in prompt
    assert "downstream retrieval quality in RAG systems" not in prompt
    assert "preserve document hierarchy" not in prompt
    assert "Ground the background exclusively in the invention details" in prompt
    assert "N/A" in prompt


def test_description_prompt_does_not_hardcode_rag_specificity():
    """Regression: Detailed Description must not force RAG/embedding technical themes.

    A leftover invention-specific specificity block could pull thin or N/A drafts
    toward transformer/chunking/embedding language unsupported by the invention.
    """
    prompt = get_description_prompt(
        {
            "invention_title": "N/A",
            "technical_field": "N/A",
            "problem_being_solved": "N/A",
            "core_technical_solution": "N/A",
            "novel_mechanism": "N/A",
            "key_components": [],
            "alternative_embodiments": [],
        }
    )
    assert "transformer architecture" not in prompt
    assert "vector embedding" not in prompt
    assert "hybrid search" not in prompt
    assert "chunk metadata" not in prompt
    assert "do not default to AI/ML" in prompt
    assert "N/A" in prompt


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
