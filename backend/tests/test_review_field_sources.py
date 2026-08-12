"""Tests for draft-time Review-tab field citation via combined_text append."""

from unittest.mock import patch

from drafter.grant_sections import draft_single_grant_section
from drafter.review_field_sources import (
    GRANT_REVIEW_FIELD_LABELS,
    PATENT_REVIEW_FIELD_LABELS,
    append_review_fields_to_combined_text,
    format_review_field_chunk,
    review_field_source_label,
)
from drafter.section_agents import draft_section_agent
from drafter.source_chunks import parse_source_chunks


def test_review_field_source_label_format():
    assert review_field_source_label("Problem Statement") == (
        "Your reviewed Problem Statement"
    )


def test_append_review_fields_is_additive_with_uploads():
    combined = (
        "--- upload.pdf ---\n"
        "Uploaded document discusses prior art limitations in enterprise search systems "
        "and the need for grounded answers with citation evidence across long corpora.\n"
    )
    details = {
        "problem_being_solved": (
            "Ungrounded answers in enterprise search cause hallucinated responses that "
            "cannot be traced to authoritative source documents."
        ),
        "invention_title": "N/A",
        "technical_field": "",
    }
    merged = append_review_fields_to_combined_text(
        combined, details, PATENT_REVIEW_FIELD_LABELS
    )
    chunks = parse_source_chunks(merged)
    labels = [c.label for c in chunks]
    assert "upload.pdf" in labels
    assert "Your reviewed Technical Problem Being Solved" in labels
    assert "Your reviewed Invention Title" not in labels
    assert "upload.pdf" in merged
    assert "Ungrounded answers in enterprise search" in merged


def test_append_review_fields_alone_when_no_uploads():
    details = {
        "problem_statement": (
            "Rural clinics lack affordable diagnostic throughput for seasonal infectious "
            "disease surges, leaving patients without timely confirmatory testing."
        ),
        "proposed_solution": "",
    }
    merged = append_review_fields_to_combined_text(
        "", details, GRANT_REVIEW_FIELD_LABELS
    )
    chunks = parse_source_chunks(merged)
    assert len(chunks) == 1
    assert chunks[0].label == "Your reviewed Problem Statement"
    assert "Rural clinics lack affordable diagnostic throughput" in chunks[0].text


def test_format_review_field_chunk_uses_header_convention():
    chunk = format_review_field_chunk(
        "Problem Statement",
        "Clinics need faster confirmatory testing during seasonal surges.",
    )
    assert chunk.startswith("--- Your reviewed Problem Statement ---")
    assert "Clinics need faster confirmatory testing" in chunk
    # Attribution lives in the chunk label, not body boilerplate.
    assert "from the Review tab" not in chunk


def test_short_review_field_values_are_not_appended_or_padded():
    """Short values must not be repetition-padded into citable chunks."""
    details = {
        "technical_field": "AI",
        "invention_title": "Short",
        "problem_being_solved": (
            "Enterprise search systems produce ungrounded answers that invent facts "
            "because retrieval never attaches authoritative passage-level evidence."
        ),
    }
    merged = append_review_fields_to_combined_text(
        "", details, PATENT_REVIEW_FIELD_LABELS
    )
    chunks = parse_source_chunks(merged)
    labels = {c.label for c in chunks}
    assert "Your reviewed Technical Field" not in labels
    assert "Your reviewed Invention Title" not in labels
    assert "Your reviewed Technical Problem Being Solved" in labels
    assert "AI AI" not in merged


def test_short_review_field_never_yields_repeated_citation_excerpt():
    """Regression: short Review values must not cite as 'AI AI AI …'."""
    invention = {
        "invention_title": "Test",
        "technical_field": "AI",
        "problem_being_solved": "N/A",
        "core_technical_solution": "N/A",
        "novel_mechanism": "N/A",
        "key_components": [],
        "alternative_embodiments": [],
    }

    with patch(
        "drafter.section_agents.generate_text",
        return_value="1. A system comprising a processor.",
    ):
        _content, citations = draft_section_agent(
            invention,
            "claims",
            combined_text="",
        )

    # Too short to be a useful source; skip rather than pad/repeat for retrieval.
    assert citations == []
    assert all("AI AI" not in c.get("excerpt", "") for c in citations)


def test_draft_section_cites_review_field_without_uploads():
    """Regression: sparse/no uploads still cite Review-tab fields used for drafting."""
    invention = {
        "invention_title": "Retrieval-Augmented Search System",
        "technical_field": "Artificial intelligence and information retrieval",
        "problem_being_solved": (
            "Enterprise search systems produce ungrounded answers that invent facts "
            "because retrieval never attaches authoritative passage-level evidence "
            "before generation."
        ),
        "core_technical_solution": (
            "A hybrid retrieval pipeline combines sparse and dense ranking with "
            "query-aware chunk reranking so every answer cites supporting passages."
        ),
        "novel_mechanism": (
            "Query-aware chunk reranking that scores passages by evidence utility "
            "rather than lexical overlap alone."
        ),
        "key_components": ["retriever", "reranker", "citation assembler"],
        "alternative_embodiments": ["On-prem deployment with private indexes"],
    }

    with patch(
        "drafter.section_agents.generate_text",
        return_value="Background describing ungrounded enterprise search answers.",
    ):
        _content, citations = draft_section_agent(
            invention,
            "background",
            combined_text="",
        )

    assert citations, "Expected at least one citation from Review fields"
    labels = {c["label"] for c in citations}
    assert any(label.startswith("Your reviewed ") for label in labels)
    assert "Your reviewed Technical Problem Being Solved" in labels


def test_draft_grant_section_cites_review_field_without_uploads():
    """Regression: grant sections drafted from Review fields cite those fields."""
    grant = {
        "project_title": "Community Diagnostic Access Initiative",
        "problem_statement": (
            "Rural clinics lack affordable diagnostic throughput for seasonal infectious "
            "disease surges, leaving patients without timely confirmatory testing."
        ),
        "proposed_solution": (
            "Deploy modular point-of-care assay carts with courier-linked confirmatory "
            "labs and shared staffing across a three-county clinic network."
        ),
        "innovation_and_impact": (
            "Shared cart logistics cut per-test cost while improving same-week "
            "confirmation rates for underserved patients."
        ),
        "target_population": "Patients served by rural clinics in three counties.",
        "team_qualifications": "Experienced public-health laboratorians and educators.",
        "budget_overview": "Personnel, assay carts, courier contracts, and evaluation.",
        "evaluation_plan": "Track turnaround time, confirmation rates, and retention.",
    }

    with patch(
        "drafter.grant_sections.generate_text",
        return_value="Problem statement drafted from reviewed clinic access gaps.",
    ):
        _content, citations = draft_single_grant_section(
            grant,
            "problem_statement",
            combined_text="",
        )

    assert citations, "Expected at least one citation from Review fields"
    labels = {c["label"] for c in citations}
    assert "Your reviewed Problem Statement" in labels


def test_uploaded_doc_citations_still_work_with_review_fields():
    """Additive: uploaded source labels remain available alongside Review fields."""
    invention = {
        "invention_title": "Retrieval-Augmented Search System",
        "technical_field": "Artificial intelligence",
        "problem_being_solved": (
            "Ungrounded answers in enterprise search invent facts without evidence."
        ),
        "core_technical_solution": "Hybrid retrieval with citation grounding.",
        "novel_mechanism": "Query-aware chunk reranking for evidence utility.",
        "key_components": ["retriever", "reranker"],
        "alternative_embodiments": ["On-prem deployment"],
    }
    combined = (
        "--- prior-art-notes.pdf ---\n"
        "Existing enterprise search tools return passages but generators still invent "
        "unsupported claims because citation grounding is optional and rarely enforced "
        "during answer construction for long corporate corpora.\n"
    )

    with patch(
        "drafter.section_agents.generate_text",
        return_value="Background grounded in prior art and review fields.",
    ):
        _content, citations = draft_section_agent(
            invention,
            "background",
            combined_text=combined,
        )

    labels = {c["label"] for c in citations}
    assert "prior-art-notes.pdf" in labels
    assert any(label.startswith("Your reviewed ") for label in labels)
    # Uploaded chunk must remain parseable even when Review fields are appended.
    merged = append_review_fields_to_combined_text(
        combined, invention, PATENT_REVIEW_FIELD_LABELS
    )
    parsed_labels = {c.label for c in parse_source_chunks(merged)}
    assert "prior-art-notes.pdf" in parsed_labels
    assert any(label.startswith("Your reviewed ") for label in parsed_labels)
