"""Tests for invention extraction normalization."""

from drafter.extractor import _normalize_extraction


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
