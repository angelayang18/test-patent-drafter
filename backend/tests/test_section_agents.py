"""Tests for per-section drafting agents."""

import pytest

from drafter.patent_template import (
    PROVISIONAL_FILING_OVERVIEW,
    get_section_template_instructions,
)
from drafter.section_agents import get_section_agent_system
from drafter.prompts import PATENT_SECTIONS


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
    from drafter.section_agents import draft_all_sections_parallel

    with pytest.raises(ValueError, match="Unknown section"):
        draft_all_sections_parallel({}, ["not_a_section"])
