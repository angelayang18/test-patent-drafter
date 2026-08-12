"""Tests that extraction returns per-field source citations."""

from __future__ import annotations

from unittest.mock import patch

from drafter.ada_extractor import (
    EXTRACTABLE_ADA_FIELDS,
    extract_ada_details,
    extract_ada_field,
)
from drafter.extractor import EXTRACTABLE_FIELDS, extract_invention_details, extract_invention_field
from drafter.grant_extractor import (
    EXTRACTABLE_GRANT_FIELDS,
    extract_grant_details,
    extract_grant_field,
)
from drafter.sow_extractor import (
    EXTRACTABLE_SOW_FIELDS,
    extract_sow_details,
    extract_sow_field,
)


_LEGACY_SHARED_SOURCE = (
    "--- notes.pdf ---\n"
    "=== Page 1 ===\n"
    "The technical problem being solved is incomplete prior art search grounding. "
    "Legacy systems leave results poorly grounded in authoritative domain sources.\n\n"
    "=== Page 2 ===\n"
    "The proposed solution trains nonprofit staff with practical AI workflows and "
    "measures digital capacity gains across three counties with evaluation tracking.\n"
)

_PATENT_SOURCE = (
    "--- invention.pdf ---\n"
    "=== Page 1 ===\n"
    "Invention Title: Hybrid RAG Pipeline. Technical field: information retrieval. "
    "The problem being solved is incomplete prior art search grounding in legacy systems.\n\n"
    "=== Page 2 ===\n"
    "The core technical solution uses parallel embedding and reranking. Novelty comes "
    "from dynamic query routing. Alternative embodiments include cloud deployment. "
    "Key components are a router and an embedder module.\n"
)

_GRANT_SOURCE = (
    "--- grant.pdf ---\n"
    "=== Page 1 ===\n"
    "Project Title: Community AI Literacy. Problem statement: nonprofits lack AI "
    "readiness. Proposed solution: train cohorts with practical AI workflows.\n\n"
    "=== Page 2 ===\n"
    "Innovation and impact: measurable digital capacity gains. Target population: "
    "nonprofit staff in three counties. Team qualifications: adult educators and "
    "technologists. Budget overview: personnel and training materials. Evaluation "
    "plan: pre/post skills assessment with retention tracking.\n"
)

_SOW_SOURCE = (
    "--- sow.pdf ---\n"
    "=== Page 1 ===\n"
    "Engagement Title: Acme Identity Platform Integration. Client: Acme Corp. "
    "Vendor: BlueSoft LLC. Purpose and background: migrate identity providers.\n\n"
    "=== Page 2 ===\n"
    "Objectives include SSO rollout and directory sync. Scope of work covers design, "
    "build, and cutover. Deliverables: API specification, test suite, handoff package.\n\n"
    "=== Page 3 ===\n"
    "Timeline and effort: twelve weeks with two engineers. Responsibilities: client "
    "provides IdP access; vendor delivers weekly demos. Commercial terms: T&M billing.\n"
)

_ADA_SOURCE = (
    "--- ada.pdf ---\n"
    "=== Page 1 ===\n"
    "Study Title: Bridging ELISA ADA Validation for Drug X. Objective: validate "
    "screening and confirmatory anti-drug antibody assays in human serum.\n\n"
    "=== Page 2 ===\n"
    "Assay platform: bridging ELISA on MSD. Sample matrix: human serum. Cut point "
    "methodology uses floating cut points with outlier exclusion.\n\n"
    "=== Page 3 ===\n"
    "Sensitivity data: LPC at 100 ng/mL. Specificity data: no cross-reactivity to "
    "related biologics. Precision data: %CV under 20%. Stability: 24h benchtop. "
    "Results summary: assay meets acceptance criteria for clinical use.\n"
)


def _invention_payload() -> dict:
    return {
        "invention_title": "Hybrid RAG Pipeline",
        "technical_field": "Information retrieval",
        "problem_being_solved": "Incomplete prior art search grounding",
        "core_technical_solution": "Parallel embedding and reranking",
        "novel_mechanism": "Dynamic query routing",
        "alternative_embodiments": ["Cloud deployment"],
        "key_components": ["Router", "Embedder"],
    }


def _grant_payload() -> dict:
    return {
        "project_title": "Community AI Literacy",
        "problem_statement": "Nonprofits lack AI readiness",
        "proposed_solution": "Train cohorts with practical AI workflows",
        "innovation_and_impact": "Measurable digital capacity gains",
        "target_population": "Nonprofit staff in three counties",
        "team_qualifications": "Adult educators and technologists",
        "budget_overview": "Personnel and training materials",
        "evaluation_plan": "Pre/post skills assessment",
    }


def _sow_payload() -> dict:
    return {
        "engagement_title": "Acme Identity Platform Integration",
        "client_name": "Acme Corp",
        "vendor_name": "BlueSoft LLC",
        "purpose_and_background": "Migrate identity providers for Acme Corp",
        "objectives": "SSO rollout and directory sync",
        "scope_of_work": "Design, build, and cutover of identity platform",
        "deliverables": "API specification, test suite, and handoff package",
        "timeline_and_effort": "Twelve weeks with two engineers",
        "responsibilities_and_inputs": (
            "Client provides IdP access; vendor delivers weekly demos"
        ),
        "commercial_terms": "Time-and-materials billing",
    }


def _ada_payload() -> dict:
    return {
        "study_title": "Bridging ELISA ADA Validation for Drug X",
        "study_objective": "Validate screening and confirmatory ADA assays in human serum",
        "assay_platform": "Bridging ELISA on MSD",
        "sample_matrix": "Human serum",
        "cut_point_methodology": "Floating cut points with outlier exclusion",
        "sensitivity_data": "LPC at 100 ng/mL",
        "specificity_data": "No cross-reactivity to related biologics",
        "precision_data": "%CV under 20%",
        "stability_data": "24h benchtop stability",
        "results_summary": "Assay meets acceptance criteria for clinical use",
    }


def _assert_nonempty_field_citations(
    result: dict,
    fields: frozenset[str] | set[str],
    *,
    expected_label: str,
) -> None:
    assert "citations" in result
    assert set(result["citations"]) == set(fields)
    for field in fields:
        citations = result["citations"][field]
        assert isinstance(citations, list), field
        assert citations, f"expected non-empty citations for {field}"
        assert citations[0]["label"] == expected_label, field
        assert citations[0].get("excerpt"), field
        assert "location" in citations[0], field


def test_extract_invention_details_includes_citations_for_all_fields():
    with patch(
        "drafter.extractor._extract_grouped",
        return_value=_invention_payload(),
    ), patch(
        "drafter.extractor.get_extract_mode",
        return_value="grouped",
    ):
        result = extract_invention_details(_PATENT_SOURCE)

    for field in EXTRACTABLE_FIELDS:
        assert result[field] == _invention_payload()[field]
    _assert_nonempty_field_citations(
        result, EXTRACTABLE_FIELDS, expected_label="invention.pdf"
    )


def test_extract_invention_field_includes_citations_for_one_field():
    with patch(
        "drafter.extractor.generate_json",
        return_value={"problem_being_solved": "Incomplete prior art search grounding"},
    ):
        result = extract_invention_field(_PATENT_SOURCE, "problem_being_solved")

    assert result["problem_being_solved"] == "Incomplete prior art search grounding"
    assert set(result["citations"]) == {"problem_being_solved"}
    assert result["citations"]["problem_being_solved"]
    assert result["citations"]["problem_being_solved"][0]["label"] == "invention.pdf"


def test_extract_grant_details_includes_citations_for_all_fields():
    with patch(
        "drafter.grant_extractor._extract_grouped",
        return_value=_grant_payload(),
    ):
        result = extract_grant_details(_GRANT_SOURCE)

    for field in EXTRACTABLE_GRANT_FIELDS:
        assert result[field] == _grant_payload()[field]
    _assert_nonempty_field_citations(
        result, EXTRACTABLE_GRANT_FIELDS, expected_label="grant.pdf"
    )


def test_extract_grant_field_includes_citations_for_one_field():
    with patch(
        "drafter.grant_extractor.generate_json",
        return_value={"proposed_solution": "Train cohorts with practical AI workflows"},
    ):
        result = extract_grant_field(_GRANT_SOURCE, "proposed_solution")

    assert result["proposed_solution"] == "Train cohorts with practical AI workflows"
    assert set(result["citations"]) == {"proposed_solution"}
    assert result["citations"]["proposed_solution"]
    assert result["citations"]["proposed_solution"][0]["label"] == "grant.pdf"


def test_extract_sow_details_includes_citations_for_all_fields():
    with patch(
        "drafter.sow_extractor._extract_grouped",
        return_value=_sow_payload(),
    ):
        result = extract_sow_details(_SOW_SOURCE)

    for field in EXTRACTABLE_SOW_FIELDS:
        assert result[field] == _sow_payload()[field]
    _assert_nonempty_field_citations(
        result, EXTRACTABLE_SOW_FIELDS, expected_label="sow.pdf"
    )


def test_extract_sow_field_includes_citations_for_one_field():
    with patch(
        "drafter.sow_extractor.generate_json",
        return_value={"deliverables": "API specification, test suite, and handoff package"},
    ):
        result = extract_sow_field(_SOW_SOURCE, "deliverables")

    assert result["deliverables"] == "API specification, test suite, and handoff package"
    assert set(result["citations"]) == {"deliverables"}
    assert result["citations"]["deliverables"]
    assert result["citations"]["deliverables"][0]["label"] == "sow.pdf"


def test_extract_ada_details_includes_citations_for_all_fields():
    """Regression: symbol-heavy values like %CV under 20% must still cite sources."""
    with patch(
        "drafter.ada_extractor._extract_grouped",
        return_value=_ada_payload(),
    ):
        result = extract_ada_details(_ADA_SOURCE)

    for field in EXTRACTABLE_ADA_FIELDS:
        assert result[field] == _ada_payload()[field]
    _assert_nonempty_field_citations(
        result, EXTRACTABLE_ADA_FIELDS, expected_label="ada.pdf"
    )
    precision = result["citations"]["precision_data"]
    assert any(
        "precision" in c["excerpt"].lower() or "cv" in c["excerpt"].lower()
        for c in precision
    )


def test_extract_ada_field_includes_citations_for_one_field():
    with patch(
        "drafter.ada_extractor.generate_json",
        return_value={"precision_data": "%CV under 20%"},
    ):
        result = extract_ada_field(_ADA_SOURCE, "precision_data")

    assert result["precision_data"] == "%CV under 20%"
    assert set(result["citations"]) == {"precision_data"}
    assert result["citations"]["precision_data"]
    assert result["citations"]["precision_data"][0]["label"] == "ada.pdf"


def test_legacy_shared_source_still_cites_overlapping_fields():
    """Partial-overlap sources may leave some fields empty; overlapping ones cite."""
    with patch(
        "drafter.extractor._extract_grouped",
        return_value=_invention_payload(),
    ), patch(
        "drafter.extractor.get_extract_mode",
        return_value="grouped",
    ):
        invention = extract_invention_details(_LEGACY_SHARED_SOURCE)
    assert invention["citations"]["problem_being_solved"]

    with patch(
        "drafter.grant_extractor._extract_grouped",
        return_value=_grant_payload(),
    ):
        grant = extract_grant_details(_LEGACY_SHARED_SOURCE)
    assert grant["citations"]["proposed_solution"]
