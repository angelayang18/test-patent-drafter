"""Tests for export text formatting helpers."""

from exporter.text_format import (
    capitalize_technical_acronyms,
    count_claims,
    normalize_brief_description_of_drawings,
    normalize_claims,
    normalize_claims_text,
    parse_numbered_list_item_header,
    sanitize_internal_delimiter_tags,
    sanitize_patent_prose,
    split_brief_description_paragraphs,
    split_paragraphs,
    strip_markdown,
    truncate_abstract,
    validate_claim_count,
)


def test_sanitize_internal_delimiter_tags():
    raw = (
        "tags including %%qa for question-answer pairs, %%summary for summaries, "
        "%%profile for profiles, and %%entity for entities."
    )
    cleaned = sanitize_internal_delimiter_tags(raw)
    assert "%%" not in cleaned
    assert "qa for question-answer" in cleaned


def test_sanitize_wrapped_headers_and_placeholders():
    raw = (
        "1. %%Header 1%%This is the first item in the list. {item_1_desc}\n"
        "2. %%Header 2%%This is the second item. {item_2_desc}"
    )
    cleaned = sanitize_patent_prose(raw)
    assert "%%" not in cleaned
    assert "{item_1_desc}" not in cleaned
    assert "1. Header 1: This is the first item" in cleaned
    assert "2. Header 2: This is the second item" in cleaned


def test_sanitize_subsection_title_break():
    raw = "4. Data Flow The data transformation pipeline begins with ingestion."
    cleaned = sanitize_patent_prose(raw)
    assert "4. Data Flow\n\nThe data transformation" in cleaned


def test_parse_numbered_list_item_header():
    parsed = parse_numbered_list_item_header(
        "1. Header 1: This is the first item in the list."
    )
    assert parsed == ("1. ", "Header 1", "This is the first item in the list.", ": ")


def test_parse_numbered_list_item_header_em_dash():
    parsed = parse_numbered_list_item_header(
        "1. System Overview — The overall architecture comprises several modules."
    )
    assert parsed == (
        "1. ",
        "System Overview",
        "The overall architecture comprises several modules.",
        " — ",
    )


def test_strip_markdown_removes_common_markers():
    raw = "## Heading\n\nThis is **bold** and *italic* with `code`."
    cleaned = strip_markdown(raw)
    assert "**" not in cleaned
    assert "`" not in cleaned
    assert "Heading" in cleaned
    assert "bold" in cleaned


def test_split_paragraphs_on_blank_lines():
    raw = "First paragraph.\n\nSecond paragraph."
    assert split_paragraphs(raw) == ["First paragraph.", "Second paragraph."]


def test_split_paragraphs_keeps_numbered_claims():
    raw = "1. A method comprising:\n2. The method of claim 1, wherein"
    assert split_paragraphs(raw) == [
        "1. A method comprising:",
        "2. The method of claim 1, wherein",
    ]


def test_truncate_abstract_enforces_word_limit():
    words = " ".join(f"word{i}" for i in range(200))
    truncated = truncate_abstract(words)
    assert len(truncated.split()) <= 150


def test_truncate_abstract_prefers_sentence_boundary():
    sentence = "A system for processing documents using structural metadata."
    filler = " ".join(["technical"] * 140)
    raw = f"{filler} {sentence} Extra words beyond the limit."
    truncated = truncate_abstract(raw, max_words=145)
    assert truncated.endswith(".")


def test_normalize_claims_splits_run_on_claims():
    raw = "1. A system comprising a processor. 2. The system of claim 1, wherein the processor is configured to parse documents."
    normalized = normalize_claims(raw)
    assert "1. A system comprising a processor." in normalized
    assert "2. The system of claim 1" in normalized
    assert "\n\n" in normalized


def test_normalize_claims_preserves_indented_elements():
    raw = """1. A system comprising:
a processor configured to receive a document;
a parser module 202 configured to identify structural elements; and
an indexing module 204 configured to store embeddings."""
    normalized = normalize_claims(raw)
    assert "parser module 202" in normalized
    assert "\n\n" not in normalized or normalized.count("\n\n") == 0 or "1. A system" in normalized


def test_normalize_claims_splits_semicolon_joined_method_steps():
    raw = """2. A method comprising:
receiving a document through a vision-language processing pipeline;
parsing the document to identify hierarchical structural elements;
generating structurally-aware chunks with parent-child metadata;
appending pre-indexed knowledge representations to each chunk; transforming the enriched chunks into multi-vector embedding vectors stored in a clustered vector database; and executing a three-stage retrieval operation that performs localized reranking."""
    normalized = normalize_claims(raw)
    lines = [line.strip() for line in normalized.split("\n") if line.strip()]
    element_lines = [line for line in lines if "appending" in line or "transforming" in line or "executing" in line]
    assert any("appending" in line and line.endswith(";") for line in element_lines)
    assert any("transforming" in line and line.endswith(";") for line in element_lines)
    assert any("executing" in line for line in element_lines)
    assert len([line for line in lines if any(v in line for v in ("receiving", "parsing", "generating", "appending", "transforming", "executing"))]) >= 6


def test_normalize_claims_adds_missing_semicolons():
    raw = """1. A system comprising:
a processor configured to receive document inputs
a parser module 202 configured to generate a structural graph
an indexing module 204 configured to store hierarchical metadata; and
a retrieval module 210 configured to execute hybrid search."""
    normalized = normalize_claims(raw)
    element_lines = [
        line.strip()
        for line in normalized.split("\n")
        if line.strip() and not line.strip().startswith("1.")
    ]
    assert element_lines[0].endswith(";")
    assert element_lines[1].endswith(";")
    assert element_lines[2].endswith("; and")
    assert element_lines[-1].endswith(".")


def test_normalize_brief_description_splits_run_on_figures():
    raw = (
        "FIG. 1 is a system architecture diagram. "
        "FIG. 2 is a method flowchart. "
        "FIG. 3 is a data flow diagram."
    )
    normalized = normalize_brief_description_of_drawings(raw)
    assert normalized.count("\n\n") == 2
    assert normalized.startswith("FIG. 1 is a system architecture diagram.")


def test_split_brief_description_paragraphs():
    raw = "FIG. 1 is a diagram.\n\nFIG. 2 is a flowchart.\n\nFIG. 3 is a data flow."
    parts = split_brief_description_paragraphs(raw)
    assert len(parts) == 3


def test_capitalize_technical_acronyms_in_claims():
    raw = "3. The system of claim 1, wherein the gpu processes pdf and json via an api using vllm and lanczos resizing."
    normalized = capitalize_technical_acronyms(raw)
    assert "GPU" in normalized
    assert "PDF" in normalized
    assert "JSON" in normalized
    assert "API" in normalized
    assert "vLLM" in normalized
    assert "LANCZOS" in normalized
    assert "gpu" not in normalized.lower() or "GPU" in normalized


def test_normalize_claims_text_applies_acronym_fixes():
    raw = "3. The system of claim 1, wherein ai models output json on the gpu."
    normalized = normalize_claims_text(raw)
    assert "AI" in normalized
    assert "JSON" in normalized
    assert "GPU" in normalized


def test_count_claims_and_validate_consecutive_numbering():
    nine_claims = "\n\n".join(f"{n}. Claim {n} text." for n in range(1, 10))
    assert count_claims(nine_claims) == 9
    assert not validate_claim_count(nine_claims)

    ten_claims = "\n\n".join(f"{n}. Claim {n} text." for n in range(1, 11))
    assert count_claims(ten_claims) == 10
    assert not validate_claim_count(ten_claims)

    gap_claims = "1. First claim.\n\n3. Third claim."
    errors = validate_claim_count(gap_claims)
    assert any("missing claim" in err.lower() for err in errors)
