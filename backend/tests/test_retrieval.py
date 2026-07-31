"""Tests for deterministic per-section source retrieval."""

from drafter.document_types import (
    get_patent_section_description,
    get_patent_section_query_fields,
)
from drafter.retrieval import (
    MAX_CITATION_QUOTE_CHARS,
    MAX_EXCERPT_CHARS_PER_SECTION,
    MAX_EXCERPTS_PER_SECTION,
    Excerpt,
    _citation_quote,
    citations_for_fields,
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
    excerpts, _ = retrieve_relevant_excerpts(
        get_patent_section_description("background"),
        _problem_invention(),
        chunks,
        get_patent_section_query_fields("background"),
    )
    assert excerpts
    assert excerpts[0].label == "prior-art-notes.pdf"


def test_claims_prefers_mechanism_paragraph():
    chunks = parse_source_chunks(_two_topic_combined_text())
    excerpts, _ = retrieve_relevant_excerpts(
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
    excerpts, _ = retrieve_relevant_excerpts(
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
    excerpts, _ = retrieve_relevant_excerpts(
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
    excerpts, _ = retrieve_relevant_excerpts(
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
        == ([], set())
    )
    chunks = parse_source_chunks(_two_topic_combined_text())
    assert retrieve_relevant_excerpts("", {}, chunks, []) == ([], set())


def test_format_and_citations_helpers():
    chunks = parse_source_chunks(_two_topic_combined_text())
    excerpts, query_terms = retrieve_relevant_excerpts(
        get_patent_section_description("background"),
        _problem_invention(),
        chunks,
        get_patent_section_query_fields("background"),
    )
    block = format_excerpts_block(excerpts)
    assert "SUPPORTING SOURCE EXCERPTS" in block
    assert "[Source: prior-art-notes.pdf" in block
    assert format_excerpts_block([]) == ""

    citations = citations_from_excerpts(excerpts, query_terms)
    assert citations
    assert citations[0]["label"] == "prior-art-notes.pdf"
    assert "excerpt" in citations[0]
    assert "location" in citations[0]
    assert citations[0]["location"].startswith("Paragraph ")


def test_citations_keep_same_label_different_text():
    excerpts = [
        Excerpt(
            label="notes.pdf",
            text="First distinct prior-art paragraph about limitations.",
            score=2.0,
            location="Paragraph 1",
        ),
        Excerpt(
            label="notes.pdf",
            text="Second distinct mechanism paragraph about transformers.",
            score=1.5,
            location="Paragraph 2",
        ),
        Excerpt(
            label="notes.pdf",
            text="First distinct prior-art paragraph about limitations.",
            score=1.0,
            location="Paragraph 1",
        ),
    ]
    citations = citations_from_excerpts(excerpts)
    assert len(citations) == 2
    assert citations[0]["label"] == "notes.pdf"
    assert citations[1]["label"] == "notes.pdf"
    assert citations[0]["excerpt"] != citations[1]["excerpt"]
    assert citations[0]["location"] == "Paragraph 1"
    assert citations[1]["location"] == "Paragraph 2"


def test_pdf_page_markers_attach_location():
    """PDF-style === Page N === markers become Page locations on excerpts."""
    chunk = SourceChunk(
        label="spec.pdf",
        text=(
            "=== Page 1 ===\n"
            "Introductory boilerplate that should not match mechanism keywords at all.\n\n"
            "=== Page 3 ===\n"
            "The novel mechanism uses transformer embeddings with tokenization and a "
            "cosine similarity ranking algorithm over dense decoder synthesizer components."
        ),
    )
    excerpts, _ = retrieve_relevant_excerpts(
        get_patent_section_description("description"),
        _mechanism_invention(),
        [chunk],
        get_patent_section_query_fields("description"),
    )
    assert excerpts
    assert excerpts[0].location == "Page 3"
    assert "transformer embeddings" in excerpts[0].text

    citations = citations_from_excerpts(excerpts)
    assert citations[0]["location"] == "Page 3"
    assert citations[0]["label"] == "spec.pdf"


def test_docx_paragraph_markers_attach_location():
    """DOCX-style === Paragraph N === markers become Paragraph locations."""
    chunk = SourceChunk(
        label="Provisional_Patent_1.docx",
        text=(
            "=== Paragraph 1 ===\n"
            "Title only.\n\n"
            "=== Paragraph 12 ===\n"
            "This is a provisional patent application filed pursuant to 35 U.S.C. section "
            "111(b) describing the novel mechanism transformer embeddings retrieval "
            "algorithm tokenization cosine similarity decoder synthesizer components."
        ),
    )
    excerpts, _ = retrieve_relevant_excerpts(
        get_patent_section_description("description"),
        _mechanism_invention(),
        [chunk],
        get_patent_section_query_fields("description"),
    )
    assert excerpts
    assert excerpts[0].location == "Paragraph 12"
    assert "provisional patent" in excerpts[0].text.lower()

    citations = citations_from_excerpts(excerpts)
    assert citations[0]["location"] == "Paragraph 12"
    assert citations[0]["label"] == "Provisional_Patent_1.docx"


def test_unmarked_source_gets_sequential_paragraph_locations():
    """Pasted text / website scrapes without markers are numbered Paragraph 1..N."""
    chunk = SourceChunk(
        label="Pasted text",
        text=(
            "Prior art search systems have severe limitations. The problem being solved is "
            "that legacy approaches leave results incomplete and poorly grounded in sources.\n\n"
            "The novel mechanism uses transformer embeddings with tokenization cosine "
            "similarity ranking and a decoder synthesizer assembling key components."
        ),
    )
    problem_excerpts, _ = retrieve_relevant_excerpts(
        get_patent_section_description("background"),
        _problem_invention(),
        [chunk],
        get_patent_section_query_fields("background"),
    )
    assert problem_excerpts
    assert problem_excerpts[0].location == "Paragraph 1"

    mechanism_excerpts, _ = retrieve_relevant_excerpts(
        get_patent_section_description("description"),
        _mechanism_invention(),
        [chunk],
        get_patent_section_query_fields("description"),
    )
    assert mechanism_excerpts
    assert mechanism_excerpts[0].location == "Paragraph 2"

    citations = citations_from_excerpts(mechanism_excerpts)
    assert citations[0]["location"] == "Paragraph 2"


def test_slide_markers_attach_location():
    """PPTX-style === Slide N: Title === markers become Slide locations."""
    chunk = SourceChunk(
        label="deck.pptx",
        text=(
            "=== Slide 2: Overview ===\n"
            "High-level product overview without retrieval keywords present here.\n\n"
            "=== Slide 4: Architecture ===\n"
            "The novel mechanism transformer embeddings tokenization cosine similarity "
            "algorithm ranks passages; decoder synthesizer builds the final response."
        ),
    )
    excerpts, _ = retrieve_relevant_excerpts(
        get_patent_section_description("description"),
        _mechanism_invention(),
        [chunk],
        get_patent_section_query_fields("description"),
    )
    assert excerpts
    assert excerpts[0].location == "Slide 4"

    citations = citations_from_excerpts(excerpts)
    assert citations[0]["location"] == "Slide 4"


def test_citation_quote_truncates_at_sentence_boundary():
    long_text = (
        "The novel mechanism uses transformer embeddings with tokenization. "
        "A second sentence adds cosine similarity ranking over dense passages and "
        "continues with decoder synthesizer components until far beyond the citation "
        "quote character budget so truncation is required for the UI excerpt field."
    )
    citations = citations_from_excerpts(
        [Excerpt(label="x.pdf", text=long_text, score=1.0, location="Page 1")]
    )
    assert len(citations) == 1
    quote = citations[0]["excerpt"]
    assert quote.endswith(".") or quote.endswith("…")
    bare = quote.rstrip("…")
    assert bare in " ".join(long_text.split())


def test_field_citations_prefer_extracted_value_over_label_boilerplate():
    """Label-only overlap with boilerplate must lose to the extracted-value paragraph."""
    # Mirrors the live bug: "Evaluation Plan" → {evaluation, plan} latches onto
    # "Implementation Plan" cover-page boilerplate. The on-topic paragraph shares
    # almost none of the label vocabulary, so label-only retrieval cannot find it.
    combined_text = (
        "--- opAIda_2Week_Implementation_Plan.docx ---\n"
        "Implementation Plan Prepared by Angela Yang for the Patent Internship program. "
        "This cover page describes the two-week plan schedule and administrative logistics "
        "for onboarding and weekly check-ins with mentors across the internship plan.\n\n"
        "--- outcomes-framework.pdf ---\n"
        "Success is measured using quarterly outcome metrics, KPI dashboards, and "
        "longitudinal surveys of participant skill gains across regional cohorts with "
        "baseline and follow-up instruments.\n"
    )
    field_labels = {"evaluation_plan": "Evaluation Plan"}
    label_only = citations_for_fields(
        combined_text,
        ["evaluation_plan"],
        field_labels,
        details={},
    )
    assert label_only["evaluation_plan"]
    assert label_only["evaluation_plan"][0]["label"] == (
        "opAIda_2Week_Implementation_Plan.docx"
    )

    details = {
        "evaluation_plan": (
            "Quarterly outcome metrics, KPI dashboards, and longitudinal surveys of "
            "participant skill gains with baseline and follow-up instruments"
        ),
    }
    enriched = citations_for_fields(
        combined_text,
        ["evaluation_plan"],
        field_labels,
        details=details,
    )
    assert enriched["evaluation_plan"]
    assert enriched["evaluation_plan"][0]["label"] == "outcomes-framework.pdf"
    assert "kpi dashboards" in enriched["evaluation_plan"][0]["excerpt"].lower()


def test_citation_quote_prefers_query_matching_sentence_window():
    """Long paragraphs should quote the matching sentence, not leading boilerplate."""
    boilerplate = (
        "Implementation Plan Prepared by Angela Yang for the Patent Internship program "
        "covering onboarding logistics administrative schedules and weekly mentor check-ins."
    )
    matching = (
        "Enterprises in financial services and healthcare process regulated customer data "
        "and need grounded retrieval for compliance workflows."
    )
    # Pad so the matching sentence starts well after the quote budget.
    filler = " Administrative notes continue without topical keywords. " * 8
    long_text = f"{boilerplate}{filler}{matching}"
    assert len(" ".join(long_text.split())) > MAX_CITATION_QUOTE_CHARS

    query_terms = {"financial", "services", "healthcare", "regulated", "compliance"}
    quote = _citation_quote(long_text, query_terms)
    assert "financial services" in quote.lower()
    assert "Implementation Plan Prepared by Angela Yang" not in quote

    # Without query terms, truncation still starts at character 0.
    start_quote = _citation_quote(long_text)
    assert start_quote.startswith("Implementation Plan Prepared by Angela Yang")
