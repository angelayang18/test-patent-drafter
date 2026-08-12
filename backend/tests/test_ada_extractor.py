"""Tests for ADA extraction normalization and grouped/field extraction."""

from unittest.mock import patch

import pytest

from drafter.ada_extractor import (
    EXTRACTABLE_ADA_FIELDS,
    _extract_grouped,
    _normalize_extraction,
    extract_ada_details,
    extract_ada_field,
)
from drafter.extract_context import EMPTY_FIELD_FALLBACK


def test_normalize_extraction_uses_canonical_keys():
    data = {
        "study_title": "ADA Assay Validation for Drug X",
        "study_objective": "Validate a bridging ELISA for ADA detection.",
        "assay_platform": "Bridging ELISA on MSD platform.",
        "sample_matrix": "Human serum, -70C storage.",
        "cut_point_methodology": "Floating screening cut point, 5% FPR.",
        "sensitivity_data": "Sensitivity of 100 ng/mL PC.",
        "specificity_data": "Drug tolerance 250 ug/mL.",
        "precision_data": "Intra-assay %CV < 15%.",
        "stability_data": "Stable through 5 freeze-thaw cycles.",
        "results_summary": "2.1% confirmed ADA positive.",
    }

    normalized = _normalize_extraction(data)

    assert set(normalized) == EXTRACTABLE_ADA_FIELDS
    assert normalized["study_title"] == "ADA Assay Validation for Drug X"
    assert normalized["sensitivity_data"] == "Sensitivity of 100 ng/mL PC."
    assert normalized["results_summary"] == "2.1% confirmed ADA positive."


def test_normalize_extraction_maps_field_aliases():
    data = {
        "studyTitle": "Clinical ADA Sample Analysis",
        "objective": "Report immunogenicity for Phase 2 samples.",
        "assayFormat": "ECL bridging immunoassay.",
        "matrix": "Cynomolgus monkey plasma.",
        "cutPoint": "Non-parametric screening and confirmatory cut points.",
        "sensitivity": "LPC at 50 ng/mL consistently above SCP.",
        "drugTolerance": "No false negatives up to 100 ug/mL free drug.",
        "reproducibility": "Inter-assay %CV within acceptance.",
        "freezeThaw": "Bench-top 24h and 3 freeze-thaw cycles acceptable.",
        "findings": "Screening positives confirmed; titers reported.",
    }

    normalized = _normalize_extraction(data)

    assert normalized["study_title"] == "Clinical ADA Sample Analysis"
    assert normalized["study_objective"] == "Report immunogenicity for Phase 2 samples."
    assert normalized["assay_platform"] == "ECL bridging immunoassay."
    assert normalized["sample_matrix"] == "Cynomolgus monkey plasma."
    assert normalized["cut_point_methodology"] == (
        "Non-parametric screening and confirmatory cut points."
    )
    assert normalized["sensitivity_data"] == "LPC at 50 ng/mL consistently above SCP."
    assert normalized["specificity_data"] == (
        "No false negatives up to 100 ug/mL free drug."
    )
    assert normalized["precision_data"] == "Inter-assay %CV within acceptance."
    assert normalized["stability_data"] == (
        "Bench-top 24h and 3 freeze-thaw cycles acceptable."
    )
    assert normalized["results_summary"] == (
        "Screening positives confirmed; titers reported."
    )


def test_extract_grouped_merges_parallel_group_results():
    def fake_generate_json(_system: str, user: str) -> dict:
        if "study_title" in user and "cut_point_methodology" not in user:
            return {
                "study_title": "Design Title",
                "study_objective": "Design objective",
                "assay_platform": "Design platform",
                "sample_matrix": "Design matrix",
            }
        if "cut_point_methodology" in user and "precision_data" not in user:
            return {
                "cut_point_methodology": "Performance cut point",
                "sensitivity_data": "Performance sensitivity",
                "specificity_data": "Performance specificity",
            }
        if "precision_data" in user:
            return {
                "precision_data": "Outcome precision",
                "stability_data": "Outcome stability",
                "results_summary": "Outcome results",
            }
        return {}

    with patch("drafter.ada_extractor.generate_json", side_effect=fake_generate_json):
        merged = _extract_grouped("system", "source documentation about an ADA study")

    assert merged["study_title"] == "Design Title"
    assert merged["sensitivity_data"] == "Performance sensitivity"
    assert merged["results_summary"] == "Outcome results"
    assert set(merged) == EXTRACTABLE_ADA_FIELDS


def test_extract_ada_field_returns_single_key():
    with patch(
        "drafter.ada_extractor.generate_json",
        return_value={"sensitivity_data": "Assay sensitivity 100 ng/mL"},
    ):
        result = extract_ada_field(
            "Source text describing assay sensitivity for the ADA method.",
            "sensitivity_data",
            current={"study_title": "ADA Assay Validation for Drug X"},
        )

    assert result["sensitivity_data"] == "Assay sensitivity 100 ng/mL"
    assert "citations" in result
    assert "sensitivity_data" in result["citations"]
    assert isinstance(result["citations"]["sensitivity_data"], list)


def test_extract_grouped_applies_fallback_for_empty_fields_after_gap_fill():
    """Insufficient sources must not leave silent empty strings (incl. title)."""

    def fake_generate_json(_system: str, _user: str) -> dict:
        # Model finds nothing usable (e.g. single-character source).
        return {}

    with patch("drafter.ada_extractor.generate_json", side_effect=fake_generate_json):
        merged = _extract_grouped("system", "x")

    assert set(merged) == EXTRACTABLE_ADA_FIELDS
    for field in EXTRACTABLE_ADA_FIELDS:
        assert merged[field] == EMPTY_FIELD_FALLBACK, field
    assert merged["study_title"] == EMPTY_FIELD_FALLBACK


def test_extract_grouped_fallback_only_fills_still_empty_fields():
    """Preserve model text; only replace fields left blank after gap-fill."""

    def fake_generate_json(_system: str, user: str) -> dict:
        if "exactly one key" in _system:
            # Gap-fill cannot recover the blank title.
            return {"study_title": ""}
        if "study_title" in user and "cut_point_methodology" not in user:
            return {
                "study_title": "",
                "study_objective": "Validate ADA assay for Drug X.",
                "assay_platform": "Bridging ELISA.",
                "sample_matrix": "Human serum.",
            }
        if "cut_point_methodology" in user and "precision_data" not in user:
            return {
                "cut_point_methodology": "Floating screening cut point.",
                "sensitivity_data": "100 ng/mL.",
                "specificity_data": "Drug tolerance 250 ug/mL.",
            }
        if "precision_data" in user:
            return {
                "precision_data": "Intra-assay %CV < 15%.",
                "stability_data": "3 freeze-thaw cycles acceptable.",
                "results_summary": "2.1% confirmed ADA positive.",
            }
        return {}

    with patch("drafter.ada_extractor.generate_json", side_effect=fake_generate_json):
        merged = _extract_grouped("system", "x")

    assert merged["study_title"] == EMPTY_FIELD_FALLBACK
    assert merged["study_objective"] == "Validate ADA assay for Drug X."
    assert merged["results_summary"] == "2.1% confirmed ADA positive."


def test_extract_ada_details_empty_combined_text_raises():
    with pytest.raises(ValueError, match="combined_text is required"):
        extract_ada_details("   ")


def test_extract_ada_field_empty_combined_text_raises():
    with pytest.raises(ValueError, match="combined_text is required"):
        extract_ada_field("", "sensitivity_data")


def test_extract_ada_field_unknown_field_raises():
    with pytest.raises(ValueError, match="Unknown field"):
        extract_ada_field("some source text", "not_a_field")
