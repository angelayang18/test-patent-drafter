"""Tests for retrieve-then-extract source context preparation."""

from drafter.extract_context import (
    EMPTY_FIELD_FALLBACK,
    EXTRACT_GLOBAL_HEAD_CHARS,
    apply_empty_field_fallback,
    build_extract_source,
    build_group_extract_sources,
    empty_fields,
    is_empty_field_value,
)


def test_build_extract_source_unchanged_when_short():
    text = "Short invention notes about a novel mechanism."
    assert build_extract_source(text, "novel mechanism") == text


def test_build_extract_source_includes_middle_content_for_long_corpus(monkeypatch):
    """Long sources should surface middle on-topic paragraphs, not only head/tail."""
    monkeypatch.setenv("EXTRACT_MAX_SOURCE_CHARS", "5000")

    head = "HEAD_MARKER " + ("alpha overview context. " * 40)
    middle = (
        "MIDDLE_EVAL Success is measured using FDAbench and GDPval benchmarks "
        "with ninety five percent automated accuracy and citation coverage."
    )
    tail = "TAIL_MARKER " + ("omega logistics schedule. " * 40)
    # Enough padding that the middle sits past the 8k global head.
    padding = ("padding filler paragraph without topical keywords.\n\n" * 120)
    combined = (
        f"--- plan.docx ---\n{head}\n\n"
        f"{padding}"
        f"{middle}\n\n"
        f"{padding}"
        f"{tail}"
    )
    assert len(combined) > 5000

    source = build_extract_source(
        combined,
        "evaluation plan FDAbench GDPval accuracy citation coverage benchmarks",
    )
    assert "MIDDLE_EVAL" in source or "fdabench" in source.lower()
    assert "omitted from source material" not in source


def test_build_extract_source_falls_back_when_retrieval_empty(monkeypatch):
    # Floor of get_max_source_chars is 4000 — stay above that.
    monkeypatch.setenv("EXTRACT_MAX_SOURCE_CHARS", "4000")
    # No shared vocabulary with the query → retrieval yields nothing useful.
    combined = ("zzzz unique filler token without overlap. " * 200)
    assert len(combined) > 4000
    source = build_extract_source(combined, "fdabench gdpval immunogenicity")
    assert "omitted from source material" in source


def test_build_extract_source_dedups_excerpts_inside_global_head(monkeypatch):
    monkeypatch.setenv("EXTRACT_MAX_SOURCE_CHARS", "4000")
    repeated = (
        "The novel mechanism uses transformer embeddings with tokenization "
        "cosine similarity ranking over dense passages for grounded retrieval."
    )
    # Two copies inside the global-head window, then enough filler to exceed budget.
    combined = (
        f"--- spec.pdf ---\n{repeated}\n\n"
        f"short administrative bridge paragraph.\n\n"
        f"{repeated}\n\n"
        + ("unrelated administrative logistics paragraph here.\n\n" * 100)
    )
    assert len(combined) > 4000
    source = build_extract_source(
        combined, "novel mechanism transformer embeddings tokenization"
    )
    # Head may contain both early copies; supporting excerpts must not re-add them.
    assert repeated in source
    if "SUPPORTING SOURCE EXCERPTS" in source:
        supporting = source.split("SUPPORTING SOURCE EXCERPTS", 1)[1]
        assert repeated not in supporting
    else:
        # Hits were already inside the global head — no separate excerpt block.
        assert "omitted from source material" not in source


def test_build_group_extract_sources_returns_per_group_map():
    text = "Problem statement and budget overview for the grant project."
    sources = build_group_extract_sources(
        text,
        [
            ("overview", "problem statement solution"),
            ("capacity", "budget overview funding"),
        ],
    )
    assert set(sources) == {"overview", "capacity"}
    assert sources["overview"] == text
    assert sources["capacity"] == text


def test_empty_fields_helpers():
    assert is_empty_field_value("")
    assert is_empty_field_value([])
    assert is_empty_field_value(None)
    assert not is_empty_field_value("x")
    assert not is_empty_field_value(["a"])
    assert empty_fields({"a": "", "b": "ok", "c": []}) == ["a", "c"]


def test_apply_empty_field_fallback_fills_strings_and_lists():
    filled = apply_empty_field_fallback(
        {
            "title": "",
            "body": "   ",
            "items": [],
            "kept": "real value",
            "kept_list": ["a"],
        }
    )

    assert filled["title"] == EMPTY_FIELD_FALLBACK
    assert filled["body"] == EMPTY_FIELD_FALLBACK
    assert filled["items"] == [EMPTY_FIELD_FALLBACK]
    assert filled["kept"] == "real value"
    assert filled["kept_list"] == ["a"]


def test_global_head_constant_is_quality_leaning():
    assert EXTRACT_GLOBAL_HEAD_CHARS >= 4000
