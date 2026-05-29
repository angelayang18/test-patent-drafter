"""Tests for LLM JSON parsing helpers."""

from drafter.llm_client import _parse_json_object


def test_parse_json_object_from_fenced_output():
    parsed = _parse_json_object('```json\n{"figures": [{"number": 1}]}\n```')
    assert parsed["figures"][0]["number"] == 1


def test_parse_json_object_strips_reasoning_blocks():
    parsed = _parse_json_object(
        '\nPlanning the figures...\n\n{"figures": [{"number": 1}]}'
    )
    assert parsed["figures"][0]["number"] == 1


def test_parse_json_object_extracts_embedded_object():
    parsed = _parse_json_object(
        'Here is the JSON:\n{"figures": [{"number": 2}]}\nDone.'
    )
    assert parsed["figures"][0]["number"] == 2
