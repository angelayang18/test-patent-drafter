"""Tests for fully-custom (generic) section drafting and export."""

from __future__ import annotations

from unittest.mock import patch

from docx import Document

from drafter.generic_sections import (
    _DEFAULT_GENERIC_DESCRIPTION,
    draft_generic_section,
    draft_generic_sections_parallel,
    get_generic_section_agent_system,
)
from exporter.generic_export import export_generic_docx, export_generic_pdf


def _two_topic_combined_text() -> str:
    return (
        "--- market-analysis.pdf ---\n"
        "The total addressable market for industrial sensors grew to twelve billion "
        "dollars last year. Competitive landscape analysis shows three incumbents "
        "controlling sixty percent of sensor market share in North America.\n\n"
        "--- implementation-plan.pdf ---\n"
        "Phase one deploys edge gateways across three pilot sites. Phase two rolls "
        "out predictive maintenance models. Implementation milestones include "
        "hardware procurement, firmware updates, and operator training schedules.\n"
    )


def test_draft_generic_sections_parallel_with_varied_descriptions():
    captured: list[tuple[str, str]] = []

    def _fake_generate(system: str, user: str) -> str:
        captured.append((system, user))
        if "Executive Summary" in system or "Executive Summary" in user:
            return "Executive summary body covering market size."
        if "Implementation Roadmap" in system or "Implementation Roadmap" in user:
            return "Roadmap body covering phased deployment."
        return "Fallback body for untitled section."

    sections = [
        {
            "id": "exec_summary",
            "name": "Executive Summary",
            "description": "Summarize market opportunity and competitive position.",
        },
        {
            "id": "roadmap",
            "name": "Implementation Roadmap",
            "description": "Outline phased deployment milestones.",
        },
        {
            "id": "open_notes",
            "name": "Open Notes",
            "description": "",
        },
    ]

    with patch("drafter.generic_sections.generate_text", side_effect=_fake_generate):
        drafted, citations = draft_generic_sections_parallel(
            "Sensor Strategy Brief",
            sections,
        )

    assert drafted["exec_summary"]
    assert drafted["roadmap"]
    assert drafted["open_notes"]
    assert "market size" in drafted["exec_summary"]
    assert "phased deployment" in drafted["roadmap"]
    assert set(citations) == {"exec_summary", "roadmap", "open_notes"}

    open_notes_prompts = [
        (system, user)
        for system, user in captured
        if "Open Notes" in system or "Open Notes" in user
    ]
    assert open_notes_prompts
    system, user = open_notes_prompts[0]
    assert _DEFAULT_GENERIC_DESCRIPTION in system
    assert _DEFAULT_GENERIC_DESCRIPTION in user


def test_empty_description_uses_default_in_system_prompt():
    system = get_generic_section_agent_system("My Doc", "Appendix", "")
    assert _DEFAULT_GENERIC_DESCRIPTION in system
    assert 'draft the "Appendix" section' in system
    assert 'for the document "My Doc"' in system


def test_draft_generic_section_requires_id_and_name():
    import pytest

    with pytest.raises(ValueError, match="section_id"):
        draft_generic_section("Title", "", "Name", "desc")
    with pytest.raises(ValueError, match="name"):
        draft_generic_section("Title", "sid", "", "desc")


def test_retrieval_isolates_excerpts_by_section_description():
    def _fake_generate(system: str, user: str) -> str:
        if "Market Overview" in system or "Market Overview" in user:
            return "Market overview drafted from source."
        return "Implementation drafted from source."

    sections = [
        {
            "id": "market",
            "name": "Market Overview",
            "description": (
                "Describe total addressable market, competitive landscape, and "
                "sensor market share among incumbents."
            ),
        },
        {
            "id": "implementation",
            "name": "Implementation Plan",
            "description": (
                "Describe phased deployment of edge gateways, predictive "
                "maintenance models, and implementation milestones."
            ),
        },
    ]

    with patch("drafter.generic_sections.generate_text", side_effect=_fake_generate):
        drafted, citations = draft_generic_sections_parallel(
            "Strategy Memo",
            sections,
            combined_text=_two_topic_combined_text(),
        )

    assert drafted["market"]
    assert drafted["implementation"]
    market_labels = {c["label"] for c in citations["market"]}
    impl_labels = {c["label"] for c in citations["implementation"]}
    assert "market-analysis.pdf" in market_labels
    assert "implementation-plan.pdf" in impl_labels
    assert "implementation-plan.pdf" not in market_labels
    assert "market-analysis.pdf" not in impl_labels


def test_empty_combined_text_skips_retrieval():
    with (
        patch(
            "drafter.generic_sections.generate_text",
            return_value="Body text.",
        ) as mock_generate,
        patch("drafter.generic_sections.parse_source_chunks") as mock_parse,
        patch("drafter.generic_sections.retrieve_relevant_excerpts") as mock_retrieve,
    ):
        content, citations = draft_generic_section(
            "Doc",
            "intro",
            "Introduction",
            "Write an intro.",
            combined_text="",
        )

    assert content == "Body text."
    assert citations == []
    mock_parse.assert_not_called()
    mock_retrieve.assert_not_called()
    mock_generate.assert_called_once()


def test_export_docx_order_and_labels():
    buffer = export_generic_docx(
        {
            "intro": "Introduction body.",
            "risks": "Risk body.",
            "appendix": "Appendix body left out of order list.",
        },
        document_title="Custom Strategy Brief",
        section_order=["risks", "intro"],
        section_labels={"risks": "Risk Register", "intro": "Introduction"},
    )
    doc = Document(buffer)
    texts = [p.text for p in doc.paragraphs]
    assert texts[0] == "Custom Strategy Brief"
    assert "1. Risk Register" in texts
    assert "2. Introduction" in texts
    assert "3. Appendix" in texts
    risk_idx = texts.index("1. Risk Register")
    intro_idx = texts.index("2. Introduction")
    appendix_idx = texts.index("3. Appendix")
    assert risk_idx < intro_idx < appendix_idx
    assert not any("risks" == t or t.endswith("risks") for t in texts)


def test_export_pdf_produces_bytes_with_title_and_headings():
    buffer = export_generic_pdf(
        {
            "intro": "Introduction body.",
            "closing": "Closing body.",
        },
        document_title="PDF Brief",
        section_order=["intro", "closing"],
        section_labels={"intro": "Introduction", "closing": "Closing Remarks"},
    )
    data = buffer.getvalue()
    assert data.startswith(b"%PDF")
    assert len(data) > 100
