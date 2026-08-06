"""Tests for SOW section drafting agents and retrieval wiring."""

from unittest.mock import patch

import pytest

from drafter.document_types import (
    get_sow_section_description,
    get_sow_section_query_fields,
)
from drafter.retrieval import retrieve_relevant_excerpts
from drafter.source_chunks import parse_source_chunks
from drafter.sow_sections import (
    SOW_SECTIONS,
    draft_all_sow_sections_parallel,
    draft_single_sow_section,
    get_custom_sow_section_agent_system,
    get_sow_section_agent_system,
)


def _sample_sow() -> dict:
    return {
        "engagement_title": "SOW for Portal AI Integration",
        "client_name": "Acme Corp",
        "vendor_name": "opAIda",
        "purpose_and_background": "Customer needs grounded search in the portal.",
        "objectives": "Ship production search with measurable deflection gains.",
        "scope_of_work": "Build retrieval API, UI widgets, and ops runbook.",
        "deliverables": "API, widget package, and operations runbook.",
        "timeline_and_effort": "Three phases over ten weeks.",
        "responsibilities_and_inputs": "Client provides SSO and sample tickets.",
        "commercial_terms": "Fixed fee billed at phase gates.",
    }


def test_sow_agent_conventions_forbid_bracket_placeholders():
    """Regression: sparse engagement details must not produce [bracket] filler.

    SOW conventions previously lacked Patent/ADA-style sparse-detail guidance,
    so thin or N/A extracts yielded unfilled placeholders like [Client Name].
    """
    system = get_sow_section_agent_system("purpose")
    custom_system = get_custom_sow_section_agent_system(
        "Risk Register",
        "List material risks and mitigation owners for the engagement.",
    )
    for prompt in (system, custom_system):
        assert "largely missing" in prompt
        assert "N/A" in prompt
        assert "too sparse" in prompt
        assert "sufficient detail" in prompt
        assert "bracket placeholders" in prompt
        assert "[Client Name]" in prompt
        assert "[insert X]" in prompt

    na_sow = {
        "engagement_title": "N/A",
        "client_name": "N/A",
        "vendor_name": "N/A",
        "purpose_and_background": "N/A",
        "objectives": "N/A",
        "scope_of_work": "N/A",
        "deliverables": "N/A",
        "timeline_and_effort": "N/A",
        "responsibilities_and_inputs": "N/A",
        "commercial_terms": "N/A",
    }

    def _fake_generate(sys: str, user: str) -> str:
        assert "bracket placeholders" in sys
        assert "N/A" in user
        return (
            "The provided source material does not provide sufficient detail "
            "to draft this section."
        )

    with patch("drafter.sow_sections.generate_text", side_effect=_fake_generate):
        content, citations = draft_single_sow_section(na_sow, "purpose")

    assert "[" not in content
    assert "sufficient detail" in content.lower()
    assert citations == []


def test_draft_single_sow_section_returns_content_and_citations_tuple():
    with patch(
        "drafter.sow_sections.generate_text",
        return_value="The engagement will integrate AI search into the portal.",
    ):
        result = draft_single_sow_section(_sample_sow(), "purpose")

    assert isinstance(result, tuple)
    assert len(result) == 2
    content, citations = result
    assert "integrate AI search" in content
    assert citations == []


def test_draft_all_sow_sections_parallel_covers_all_ids():
    with patch(
        "drafter.sow_sections.generate_text",
        return_value="Drafted SOW section body.",
    ):
        sections, citations = draft_all_sow_sections_parallel(_sample_sow())

    assert set(sections) == set(SOW_SECTIONS)
    assert set(citations) == set(SOW_SECTIONS)
    assert len(SOW_SECTIONS) == 14
    for section_id in SOW_SECTIONS:
        assert sections[section_id] == "Drafted SOW section body."
        assert citations[section_id] == []


def test_draft_single_unknown_section_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_single_sow_section(_sample_sow(), "not_a_section")


def test_draft_all_unknown_section_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_all_sow_sections_parallel(_sample_sow(), ["purpose", "not_a_section"])


def test_draft_custom_section_with_metadata():
    custom = {
        "risk_register": {
            "name": "Risk Register",
            "description": "List material risks and mitigation owners for the engagement.",
        }
    }
    with patch(
        "drafter.sow_sections.generate_text",
        return_value="Key risks include delayed SSO access; mitigation is early dry-run.",
    ):
        content, citations = draft_single_sow_section(
            _sample_sow(),
            "risk_register",
            custom_sections=custom,
        )

    assert "SSO access" in content
    assert citations == []


def test_draft_custom_section_without_metadata_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_single_sow_section(_sample_sow(), "risk_register")


def test_draft_all_mix_canonical_and_custom():
    custom = {
        "risk_register": {
            "name": "Risk Register",
            "description": "List material risks and mitigation owners for the engagement.",
        }
    }

    def _fake_generate(system: str, user: str) -> str:
        if "Risk Register" in system or "Risk Register" in user:
            return "Custom risk register body."
        return "Canonical purpose body."

    with patch("drafter.sow_sections.generate_text", side_effect=_fake_generate):
        sections, citations = draft_all_sow_sections_parallel(
            _sample_sow(),
            ["purpose", "risk_register"],
            custom_sections=custom,
        )

    assert sections["purpose"] == "Canonical purpose body."
    assert sections["risk_register"] == "Custom risk register body."
    assert set(citations) == {"purpose", "risk_register"}


def test_empty_combined_text_skips_retrieval():
    with (
        patch(
            "drafter.sow_sections.generate_text",
            return_value="Purpose body.",
        ) as mock_generate,
        patch("drafter.sow_sections.parse_source_chunks") as mock_parse,
        patch("drafter.sow_sections.retrieve_relevant_excerpts") as mock_retrieve,
    ):
        content, citations = draft_single_sow_section(
            _sample_sow(),
            "purpose",
            combined_text="",
        )

    assert content == "Purpose body."
    assert citations == []
    mock_parse.assert_not_called()
    mock_retrieve.assert_not_called()
    mock_generate.assert_called_once()


def _two_topic_sow_combined_text() -> str:
    return (
        "--- deliverables-pack.pdf ---\n"
        "The engagement deliverables include a production retrieval API, a portal "
        "widget package with checkout flows, and an operations runbook that maps each "
        "deliverable to the agreed scope of work for integration testing and handoff.\n\n"
        "--- confidentiality-policy.pdf ---\n"
        "Each party's data must be handled, retained, and protected under mutual "
        "confidentiality obligations. Data retention schedules, encryption at rest, "
        "and post-engagement deletion requirements define how confidential information "
        "is protected during and after the engagement.\n"
    )


def _realistic_sow() -> dict:
    """Full SOWDetails-shaped dict with every extractable field populated."""
    return {
        "engagement_title": "SOW for Portal AI Integration",
        "client_name": "Acme Corp",
        "vendor_name": "opAIda",
        "purpose_and_background": (
            "Customer needs grounded search so agents stop hunting across disconnected tools"
        ),
        "objectives": (
            "Achieve measurable ticket deflection and ship production search widgets"
        ),
        "scope_of_work": (
            "Build retrieval API, portal widget package, integration testing, and ops runbook"
        ),
        "deliverables": (
            "production retrieval API, portal widget package, operations runbook mapped to scope"
        ),
        "timeline_and_effort": "Three phases over ten weeks with gated reviews",
        "responsibilities_and_inputs": (
            "Vendor owns delivery; client provides SSO credentials and sample tickets"
        ),
        "commercial_terms": "Fixed fee billed at phase gates; travel billed separately",
    }


def test_realistic_dict_deliverables_prefers_deliverables_topic():
    """Regression: full SOW dict must not drown out deliverables section bias."""
    chunks = parse_source_chunks(_two_topic_sow_combined_text())
    sow = _realistic_sow()
    excerpts, _ = retrieve_relevant_excerpts(
        get_sow_section_description("deliverables"),
        sow,
        chunks,
        get_sow_section_query_fields("deliverables"),
    )
    assert excerpts
    assert excerpts[0].label == "deliverables-pack.pdf"


def test_realistic_dict_data_protection_prefers_confidentiality_topic():
    """Boilerplate section (no field bias) still ranks confidentiality source."""
    chunks = parse_source_chunks(_two_topic_sow_combined_text())
    sow = _realistic_sow()
    excerpts, _ = retrieve_relevant_excerpts(
        get_sow_section_description("data_protection_confidentiality"),
        sow,
        chunks,
        get_sow_section_query_fields("data_protection_confidentiality"),
    )
    assert excerpts
    assert excerpts[0].label == "confidentiality-policy.pdf"


def test_deliverables_and_data_protection_select_different_excerpts():
    chunks = parse_source_chunks(_two_topic_sow_combined_text())
    sow = _realistic_sow()
    deliverables, _ = retrieve_relevant_excerpts(
        get_sow_section_description("deliverables"),
        sow,
        chunks,
        get_sow_section_query_fields("deliverables"),
    )
    data_protection, _ = retrieve_relevant_excerpts(
        get_sow_section_description("data_protection_confidentiality"),
        sow,
        chunks,
        get_sow_section_query_fields("data_protection_confidentiality"),
    )
    assert deliverables and data_protection
    assert deliverables[0].label != data_protection[0].label


def test_draft_single_sow_section_includes_reviewer_feedback():
    captured: list[str] = []

    def _fake_generate(system: str, user: str) -> str:
        captured.append(user)
        return "Revised purpose section."

    with patch("drafter.sow_sections.generate_text", side_effect=_fake_generate):
        draft_single_sow_section(
            _sample_sow(),
            "purpose",
            prior_draft="Old purpose text.",
            attorney_feedback="Clarify client and vendor roles in the first paragraph.",
        )

    assert captured
    assert "Contract reviewer feedback for this section:" in captured[0]
    assert "Clarify client and vendor roles" in captured[0]
    assert "Old purpose text." in captured[0]


def test_draft_single_sow_section_omits_feedback_block_when_empty():
    captured: list[str] = []

    def _fake_generate(system: str, user: str) -> str:
        captured.append(user)
        return "Fresh purpose section."

    with patch("drafter.sow_sections.generate_text", side_effect=_fake_generate):
        draft_single_sow_section(_sample_sow(), "purpose")

    assert captured
    assert "Contract reviewer feedback for this section:" not in captured[0]
    assert "SAME-DRAFT REFINEMENT CONTEXT" not in captured[0]
