"""Tests for invention extraction normalization."""

from unittest.mock import patch

from drafter.extract_context import EMPTY_FIELD_FALLBACK
from drafter.extractor import (
    EXTRACTABLE_FIELDS,
    _extract_grouped,
    _normalize_extraction,
)


def test_normalize_extraction_uses_canonical_keys():
    data = {
        "invention_title": "Hybrid RAG Pipeline",
        "technical_field": "Information retrieval",
        "problem_being_solved": "Latency in retrieval",
        "core_technical_solution": "Parallel embedding and reranking stages.",
        "novel_mechanism": "Dynamic query routing between dense and sparse indexes.",
        "alternative_embodiments": ["Cloud deployment"],
        "key_components": ["Router", "Embedder"],
    }

    normalized = _normalize_extraction(data)

    assert normalized["core_technical_solution"] == "Parallel embedding and reranking stages."
    assert normalized["novel_mechanism"] == "Dynamic query routing between dense and sparse indexes."


def test_normalize_extraction_maps_solution_field_aliases():
    data = {
        "technicalSolution": "Uses a dual-index retrieval stack.",
        "whatMakesItNovel": "Adaptive routing based on query embeddings.",
    }

    normalized = _normalize_extraction(data)

    assert normalized["core_technical_solution"] == "Uses a dual-index retrieval stack."
    assert normalized["novel_mechanism"] == "Adaptive routing based on query embeddings."


def test_normalize_extraction_flattens_nested_solution_payload():
    data = {
        "solution": {
            "technical_solution": "Agent orchestrates tool calls over retrieved chunks.",
            "novelty": "Tool selection conditioned on retrieval confidence scores.",
        }
    }

    normalized = _normalize_extraction(data)

    assert normalized["core_technical_solution"] == "Agent orchestrates tool calls over retrieved chunks."
    assert normalized["novel_mechanism"] == "Tool selection conditioned on retrieval confidence scores."


def test_extract_grouped_applies_fallback_for_empty_fields_after_gap_fill():
    """Insufficient sources must not leave silent empty strings or lists."""

    with patch("drafter.extractor.generate_json", return_value={}):
        merged = _extract_grouped("system", "x")

    assert set(merged) == EXTRACTABLE_FIELDS
    for field in EXTRACTABLE_FIELDS:
        value = merged[field]
        if field in ("alternative_embodiments", "key_components"):
            assert value == [EMPTY_FIELD_FALLBACK], field
        else:
            assert value == EMPTY_FIELD_FALLBACK, field
