"""Tests for ADA section drafting agents and retrieval wiring."""

from unittest.mock import patch

import pytest

from drafter.ada_sections import (
    ADA_SECTIONS,
    draft_all_ada_sections_parallel,
    draft_single_ada_section,
)
from drafter.document_types import (
    get_ada_section_description,
    get_ada_section_query_fields,
)
from drafter.retrieval import retrieve_relevant_excerpts
from drafter.source_chunks import parse_source_chunks


def _sample_ada() -> dict:
    return {
        "study_title": "ADA Assay Validation for Drug X",
        "study_objective": "Validate a bridging ELISA for ADA detection in human serum.",
        "assay_platform": "Bridging ECL immunoassay on MSD platform.",
        "sample_matrix": "Human serum stored at -70C.",
        "cut_point_methodology": "Floating screening cut point with 5% FPR.",
        "sensitivity_data": "LPC at 100 ng/mL consistently above screening cut point.",
        "specificity_data": "Drug tolerance demonstrated to 250 ug/mL free drug.",
        "precision_data": "Intra-assay and inter-assay %CV within acceptance criteria.",
        "stability_data": "Stable through five freeze-thaw cycles and 24h bench-top.",
        "results_summary": "Confirmed ADA incidence 2.1%; titers reported for positives.",
    }


def test_draft_single_ada_section_returns_content_and_citations_tuple():
    with patch(
        "drafter.ada_sections.generate_text",
        return_value="This validation study evaluates a bridging ADA assay for Drug X.",
    ):
        result = draft_single_ada_section(_sample_ada(), "study_overview")

    assert isinstance(result, tuple)
    assert len(result) == 2
    content, citations = result
    assert "bridging ADA assay" in content
    assert citations == []


def test_draft_all_ada_sections_parallel_covers_all_ids():
    with patch(
        "drafter.ada_sections.generate_text",
        return_value="Drafted ADA section body.",
    ):
        sections, citations = draft_all_ada_sections_parallel(_sample_ada())

    assert set(sections) == set(ADA_SECTIONS)
    assert set(citations) == set(ADA_SECTIONS)
    assert len(ADA_SECTIONS) == 10
    for section_id in ADA_SECTIONS:
        assert sections[section_id] == "Drafted ADA section body."
        assert citations[section_id] == []


def test_draft_single_unknown_section_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_single_ada_section(_sample_ada(), "not_a_section")


def test_draft_all_unknown_section_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_all_ada_sections_parallel(
            _sample_ada(), ["study_overview", "not_a_section"]
        )


def test_draft_custom_section_with_metadata():
    custom = {
        "deviations": {
            "name": "Protocol Deviations",
            "description": "Document any protocol deviations and their impact on data integrity.",
        }
    }
    with patch(
        "drafter.ada_sections.generate_text",
        return_value="One minor deviation was documented with no impact on cut-point validity.",
    ):
        content, citations = draft_single_ada_section(
            _sample_ada(),
            "deviations",
            custom_sections=custom,
        )

    assert "cut-point" in content
    assert citations == []


def test_draft_custom_section_without_metadata_raises():
    with pytest.raises(ValueError, match="Unknown section"):
        draft_single_ada_section(_sample_ada(), "deviations")


def test_draft_all_mix_canonical_and_custom():
    custom = {
        "deviations": {
            "name": "Protocol Deviations",
            "description": "Document any protocol deviations and their impact on data integrity.",
        }
    }

    def _fake_generate(system: str, user: str) -> str:
        if "Protocol Deviations" in system or "Protocol Deviations" in user:
            return "Custom deviations body."
        return "Canonical study overview body."

    with patch("drafter.ada_sections.generate_text", side_effect=_fake_generate):
        sections, citations = draft_all_ada_sections_parallel(
            _sample_ada(),
            ["study_overview", "deviations"],
            custom_sections=custom,
        )

    assert sections["study_overview"] == "Canonical study overview body."
    assert sections["deviations"] == "Custom deviations body."
    assert set(citations) == {"study_overview", "deviations"}


def test_empty_combined_text_skips_retrieval():
    with (
        patch(
            "drafter.ada_sections.generate_text",
            return_value="Study overview body.",
        ) as mock_generate,
        patch("drafter.ada_sections.parse_source_chunks") as mock_parse,
        patch("drafter.ada_sections.retrieve_relevant_excerpts") as mock_retrieve,
    ):
        content, citations = draft_single_ada_section(
            _sample_ada(),
            "study_overview",
            combined_text="",
        )

    assert content == "Study overview body."
    assert citations == []
    mock_parse.assert_not_called()
    mock_retrieve.assert_not_called()
    mock_generate.assert_called_once()


def _two_topic_ada_combined_text() -> str:
    return (
        "--- sensitivity-validation.pdf ---\n"
        "Assay sensitivity was established using a low positive control. The lowest "
        "ADA concentration consistently detected above the screening cut point was "
        "100 ng/mL LPC, with signal above the cut point across independent runs.\n\n"
        "--- stability-study.pdf ---\n"
        "Sample stability was evaluated under storage and handling conditions. Serum "
        "ADA samples remained acceptable through five freeze-thaw cycles, 24-hour "
        "bench-top hold, and long-term storage at -70C without meaningful signal loss.\n"
    )


def _realistic_ada() -> dict:
    """Full ADADetails-shaped dict with every extractable field populated."""
    return {
        "study_title": "ADA Assay Validation for Drug X",
        "study_objective": (
            "Validate a bridging ECL immunoassay for anti-Drug X antibody detection"
        ),
        "assay_platform": (
            "Bridging ECL immunoassay on MSD with biotin and ruthenium labeled drug"
        ),
        "sample_matrix": "Human serum collected in clot activator tubes stored at -70C",
        "cut_point_methodology": (
            "Floating screening cut point at 5% false positive rate; confirmatory "
            "cut point by competitive inhibition"
        ),
        "sensitivity_data": (
            "lowest ADA concentration consistently detected above the screening cut "
            "point was 100 ng/mL LPC"
        ),
        "specificity_data": (
            "drug tolerance demonstrated; target tolerance and matrix interference assessed"
        ),
        "precision_data": (
            "intra-assay and inter-assay precision %CV within acceptance criteria"
        ),
        "stability_data": (
            "sample stability through freeze-thaw cycles, bench-top hold, and long-term "
            "storage at -70C"
        ),
        "results_summary": (
            "screening confirmatory and titer results; confirmed ADA incidence reported"
        ),
    }


def test_realistic_dict_sensitivity_prefers_sensitivity_topic():
    """Regression: full ADA dict must not drown out sensitivity section bias."""
    chunks = parse_source_chunks(_two_topic_ada_combined_text())
    ada = _realistic_ada()
    excerpts, _ = retrieve_relevant_excerpts(
        get_ada_section_description("sensitivity"),
        ada,
        chunks,
        get_ada_section_query_fields("sensitivity"),
    )
    assert excerpts
    assert excerpts[0].label == "sensitivity-validation.pdf"


def test_realistic_dict_stability_prefers_stability_topic():
    """Regression: full ADA dict still ranks stability source for stability section."""
    chunks = parse_source_chunks(_two_topic_ada_combined_text())
    ada = _realistic_ada()
    excerpts, _ = retrieve_relevant_excerpts(
        get_ada_section_description("stability"),
        ada,
        chunks,
        get_ada_section_query_fields("stability"),
    )
    assert excerpts
    assert excerpts[0].label == "stability-study.pdf"


def test_sensitivity_and_stability_select_different_excerpts():
    chunks = parse_source_chunks(_two_topic_ada_combined_text())
    ada = _realistic_ada()
    sensitivity, _ = retrieve_relevant_excerpts(
        get_ada_section_description("sensitivity"),
        ada,
        chunks,
        get_ada_section_query_fields("sensitivity"),
    )
    stability, _ = retrieve_relevant_excerpts(
        get_ada_section_description("stability"),
        ada,
        chunks,
        get_ada_section_query_fields("stability"),
    )
    assert sensitivity and stability
    assert sensitivity[0].label != stability[0].label


def test_draft_single_ada_section_includes_reviewer_feedback():
    captured: list[str] = []

    def _fake_generate(system: str, user: str) -> str:
        captured.append(user)
        return "Revised study overview."

    with patch("drafter.ada_sections.generate_text", side_effect=_fake_generate):
        draft_single_ada_section(
            _sample_ada(),
            "study_overview",
            prior_draft="Old overview text.",
            attorney_feedback="State the assay platform in the opening sentence.",
        )

    assert captured
    assert "Bioanalytical reviewer feedback for this section:" in captured[0]
    assert "State the assay platform" in captured[0]
    assert "Old overview text." in captured[0]


def test_draft_single_ada_section_omits_feedback_block_when_empty():
    captured: list[str] = []

    def _fake_generate(system: str, user: str) -> str:
        captured.append(user)
        return "Fresh study overview."

    with patch("drafter.ada_sections.generate_text", side_effect=_fake_generate):
        draft_single_ada_section(_sample_ada(), "study_overview")

    assert captured
    assert "Bioanalytical reviewer feedback for this section:" not in captured[0]
    assert "SAME-DRAFT REFINEMENT CONTEXT" not in captured[0]
