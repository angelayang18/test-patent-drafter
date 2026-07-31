"""Tests that extraction returns per-field source citations."""

from unittest.mock import patch

from drafter.extractor import EXTRACTABLE_FIELDS, extract_invention_details, extract_invention_field
from drafter.grant_extractor import (
    EXTRACTABLE_GRANT_FIELDS,
    extract_grant_details,
    extract_grant_field,
)


_SOURCE = (
    "--- notes.pdf ---\n"
    "=== Page 1 ===\n"
    "The technical problem being solved is incomplete prior art search grounding. "
    "Legacy systems leave results poorly grounded in authoritative domain sources.\n\n"
    "=== Page 2 ===\n"
    "The proposed solution trains nonprofit staff with practical AI workflows and "
    "measures digital capacity gains across three counties with evaluation tracking.\n"
)


def _invention_payload() -> dict:
    return {
        "invention_title": "Hybrid RAG Pipeline",
        "technical_field": "Information retrieval",
        "problem_being_solved": "Prior art grounding gaps",
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


def test_extract_invention_details_includes_citations_for_all_fields():
    with patch(
        "drafter.extractor._extract_grouped",
        return_value=_invention_payload(),
    ), patch(
        "drafter.extractor.get_extract_mode",
        return_value="grouped",
    ):
        result = extract_invention_details(_SOURCE)

    assert "citations" in result
    assert set(result["citations"]) == EXTRACTABLE_FIELDS
    for field in EXTRACTABLE_FIELDS:
        assert isinstance(result["citations"][field], list)
        assert result[field] == _invention_payload()[field]

    problem_citations = result["citations"]["problem_being_solved"]
    assert problem_citations
    assert problem_citations[0]["label"] == "notes.pdf"
    assert "location" in problem_citations[0]
    assert "excerpt" in problem_citations[0]


def test_extract_invention_field_includes_citations_for_one_field():
    with patch(
        "drafter.extractor.generate_json",
        return_value={"problem_being_solved": "Prior art grounding gaps"},
    ):
        result = extract_invention_field(_SOURCE, "problem_being_solved")

    assert result["problem_being_solved"] == "Prior art grounding gaps"
    assert set(result["citations"]) == {"problem_being_solved"}
    assert result["citations"]["problem_being_solved"]
    assert result["citations"]["problem_being_solved"][0]["label"] == "notes.pdf"


def test_extract_grant_details_includes_citations_for_all_fields():
    with patch(
        "drafter.grant_extractor._extract_grouped",
        return_value=_grant_payload(),
    ):
        result = extract_grant_details(_SOURCE)

    assert "citations" in result
    assert set(result["citations"]) == EXTRACTABLE_GRANT_FIELDS
    for field in EXTRACTABLE_GRANT_FIELDS:
        assert isinstance(result["citations"][field], list)
        assert result[field] == _grant_payload()[field]


def test_extract_grant_field_includes_citations_for_one_field():
    with patch(
        "drafter.grant_extractor.generate_json",
        return_value={"proposed_solution": "Train cohorts with practical AI workflows"},
    ):
        result = extract_grant_field(_SOURCE, "proposed_solution")

    assert result["proposed_solution"] == "Train cohorts with practical AI workflows"
    assert set(result["citations"]) == {"proposed_solution"}
    assert isinstance(result["citations"]["proposed_solution"], list)
