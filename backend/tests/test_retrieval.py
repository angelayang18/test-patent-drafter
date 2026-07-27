"""Tests for deterministic per-section source retrieval."""

from drafter.document_types import (
    get_patent_section_description,
    get_patent_section_query_fields,
)
from drafter.retrieval import (
    MAX_EXCERPT_CHARS_PER_SECTION,
    MAX_EXCERPTS_PER_SECTION,
    Excerpt,
    citations_from_excerpts,
    format_excerpts_block,
    retrieve_relevant_excerpts,
)
from drafter.source_chunks import SourceChunk, parse_source_chunks


def _two_topic_combined_text() -> str:
    return (
        "--- prior-art-notes.pdf ---\n"
        "Prior art search systems have severe limitations. The problem being solved is that "
        "legacy approaches leave results incomplete and poorly grounded. Users face prior-art "
        "limitations when current methods fail to ground answers in authoritative domain sources "
        "and never address the underlying problem of incomplete retrieval context.\n\n"
        "--- mechanism-spec.pdf ---\n"
        "The core technical solution is a novel mechanism: a transformer encoder builds dense "
        "embeddings; tokenization feeds an algorithm that ranks candidate passages by cosine "
        "similarity; a decoder synthesizer assembles the final response from selected key "
        "components. Alternative embodiments add an optional reranker stage over passages.\n"
    )


def _problem_invention() -> dict:
    """Problem-focused fields — used with background-flavored section descriptions."""
    return {
        "technical_field": "search systems",
        "problem_being_solved": (
            "prior art limitations leave search incomplete and poorly grounded"
        ),
    }


def _mechanism_invention() -> dict:
    """Mechanism-focused fields — used with description/claims-flavored descriptions."""
    return {
        "technical_field": "machine learning systems",
        "core_technical_solution": "transformer embeddings with retrieval ranking",
        "novel_mechanism": (
            "tokenization cosine similarity algorithm over dense embeddings"
        ),
        "key_components": "transformer encoder decoder synthesizer",
        "alternative_embodiments": "optional reranker stage over candidate passages",
    }


def _realistic_invention() -> dict:
    """Full extraction-shaped dict with both problem and solution fields populated."""
    return {
        "technical_field": "machine learning search systems",
        "problem_being_solved": (
            "prior art limitations leave search incomplete and poorly grounded"
        ),
        "core_technical_solution": "transformer embeddings with retrieval ranking",
        "novel_mechanism": (
            "tokenization cosine similarity algorithm over dense embeddings"
        ),
        "key_components": "transformer encoder decoder synthesizer",
        "alternative_embodiments": "optional reranker stage over candidate passages",
    }


def test_background_prefers_prior_art_paragraph():
    chunks = parse_source_chunks(_two_topic_combined_text())
    excerpts = retrieve_relevant_excerpts(
        get_patent_section_description("background"),
        _problem_invention(),
        chunks,
        get_patent_section_query_fields("background"),
    )
    assert excerpts
    assert excerpts[0].label == "prior-art-notes.pdf"


def test_claims_prefers_mechanism_paragraph():
    chunks = parse_source_chunks(_two_topic_combined_text())
    excerpts = retrieve_relevant_excerpts(
        get_patent_section_description("description"),
        _mechanism_invention(),
        chunks,
        get_patent_section_query_fields("description"),
    )
    assert excerpts
    assert excerpts[0].label == "mechanism-spec.pdf"


def test_realistic_dict_background_prefers_problem_topic():
    """Regression: full invention dict must not drown out background section bias."""
    chunks = parse_source_chunks(_two_topic_combined_text())
    invention = _realistic_invention()
    excerpts = retrieve_relevant_excerpts(
        get_patent_section_description("background"),
        invention,
        chunks,
        get_patent_section_query_fields("background"),
    )
    assert excerpts
    assert excerpts[0].label == "prior-art-notes.pdf"


def test_realistic_dict_claims_prefers_solution_topic():
    """Regression: full invention dict still ranks mechanism for claims/description."""
    chunks = parse_source_chunks(_two_topic_combined_text())
    invention = _realistic_invention()
    excerpts = retrieve_relevant_excerpts(
        get_patent_section_description("claims"),
        invention,
        chunks,
        get_patent_section_query_fields("claims"),
    )
    assert excerpts
    assert excerpts[0].label == "mechanism-spec.pdf"


def test_respects_max_excerpts_and_chars():
    paras = []
    for i in range(12):
        paras.append(
            f"Paragraph {i} discusses the novel mechanism transformer embeddings "
            f"retrieval algorithm tokenization components decoder synthesizer ranking "
            f"cosine similarity passage selection pipeline stage number {i}."
        )
    chunk = SourceChunk(label="big.pdf", text="\n\n".join(paras))
    excerpts = retrieve_relevant_excerpts(
        get_patent_section_description("description"),
        _mechanism_invention(),
        [chunk],
        get_patent_section_query_fields("description"),
    )
    assert len(excerpts) <= MAX_EXCERPTS_PER_SECTION
    assert sum(len(e.text) for e in excerpts) <= MAX_EXCERPT_CHARS_PER_SECTION


def test_empty_chunks_or_invention_returns_empty():
    assert (
        retrieve_relevant_excerpts(
            "background problem",
            _problem_invention(),
            [],
            get_patent_section_query_fields("background"),
        )
        == []
    )
    chunks = parse_source_chunks(_two_topic_combined_text())
    assert retrieve_relevant_excerpts("", {}, chunks, []) == []


def test_format_and_citations_helpers():
    chunks = parse_source_chunks(_two_topic_combined_text())
    excerpts = retrieve_relevant_excerpts(
        get_patent_section_description("background"),
        _problem_invention(),
        chunks,
        get_patent_section_query_fields("background"),
    )
    block = format_excerpts_block(excerpts)
    assert "SUPPORTING SOURCE EXCERPTS" in block
    assert "[Source: prior-art-notes.pdf]" in block
    assert format_excerpts_block([]) == ""

    citations = citations_from_excerpts(excerpts)
    assert citations
    assert citations[0]["label"] == "prior-art-notes.pdf"
    assert "excerpt" in citations[0]


def test_citations_keep_same_label_different_text():
    excerpts = [
        Excerpt(label="notes.pdf", text="First distinct prior-art paragraph about limitations.", score=2.0),
        Excerpt(label="notes.pdf", text="Second distinct mechanism paragraph about transformers.", score=1.5),
        Excerpt(label="notes.pdf", text="First distinct prior-art paragraph about limitations.", score=1.0),
    ]
    citations = citations_from_excerpts(excerpts)
    assert len(citations) == 2
    assert citations[0]["label"] == "notes.pdf"
    assert citations[1]["label"] == "notes.pdf"
    assert citations[0]["excerpt"] != citations[1]["excerpt"]
