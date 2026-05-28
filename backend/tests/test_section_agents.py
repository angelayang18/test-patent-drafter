"""Tests for per-section drafting agents."""

import pytest

from drafter.patent_template import get_section_template_instructions
from drafter.section_agents import get_section_agent_system
from drafter.prompts import PATENT_SECTIONS


def test_agent_system_is_section_specific():
    field_sys = get_section_agent_system("field")
    claims_sys = get_section_agent_system("claims")
    assert "Field of the Invention" in field_sys
    assert "Informal Patent Claims" in claims_sys
    assert field_sys != claims_sys


def test_template_instructions_cover_all_sections():
    for section in PATENT_SECTIONS:
        text = get_section_template_instructions(section)
        assert "TEMPLATE SLOT" in text


def test_parallel_draft_rejects_unknown_section():
    from drafter.section_agents import draft_all_sections_parallel

    with pytest.raises(ValueError, match="Unknown section"):
        draft_all_sections_parallel({}, ["not_a_section"])
