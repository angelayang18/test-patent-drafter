"""Tests for LLM client timeouts, retries, and error handling."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from openai import APITimeoutError

from drafter.llm_client import (
    _call_with_retry,
    _is_retryable_llm_error,
    _wrap_llm_error,
    LLMUnavailableError,
)
from main import app


def test_is_retryable_llm_error_for_timeout_and_connection_errors():
    assert _is_retryable_llm_error(APITimeoutError(MagicMock()))
    assert _is_retryable_llm_error(httpx.TimeoutException("timed out"))
    assert _is_retryable_llm_error(httpx.ConnectError("connection failed"))
    assert not _is_retryable_llm_error(ValueError("bad input"))


def test_wrap_llm_error_includes_model_and_base_url():
    wrapped = _wrap_llm_error(httpx.ConnectError("connection refused"))
    assert isinstance(wrapped, LLMUnavailableError)
    assert "failed:" in str(wrapped)


def test_call_with_retry_succeeds_after_transient_failure():
    calls = 0

    def flaky() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.TimeoutException("timed out")
        return "ok"

    with patch("drafter.llm_client.time.sleep"):
        result = _call_with_retry(flaky, operation_name="test operation")

    assert result == "ok"
    assert calls == 2


def test_call_with_retry_raises_llm_unavailable_after_exhausted_retries():
    def always_fail() -> str:
        raise httpx.ConnectError("connection refused")

    with patch("drafter.llm_client.get_llm_max_retries", return_value=1):
        with patch("drafter.llm_client.time.sleep"):
            with pytest.raises(LLMUnavailableError):
                _call_with_retry(always_fail, operation_name="test operation")


def test_generate_text_returns_503_json_when_llm_unavailable():
    client = TestClient(app)

    with patch(
        "drafter.llm_client._call_with_retry",
        side_effect=LLMUnavailableError("LLM (model at http://test/v1) failed: timed out"),
    ):
        response = client.post(
            "/extract",
            json={"combined_text": "A long invention description about machine learning."},
        )

    assert response.status_code == 503
    payload = response.json()
    assert payload == {
        "error": "LLM unavailable",
        "detail": "LLM (model at http://test/v1) failed: timed out",
    }


def test_parse_json_object_from_fenced_output():
    from drafter.llm_client import _parse_json_object

    parsed = _parse_json_object('```json\n{"figures": [{"number": 1}]}\n```')
    assert parsed["figures"][0]["number"] == 1


def test_parse_json_object_strips_reasoning_blocks():
    from drafter.llm_client import _parse_json_object

    parsed = _parse_json_object(
        '\nPlanning the figures...\n\n{"figures": [{"number": 1}]}'
    )
    assert parsed["figures"][0]["number"] == 1


def test_parse_json_object_extracts_embedded_object():
    from drafter.llm_client import _parse_json_object

    parsed = _parse_json_object(
        'Here is the JSON:\n{"figures": [{"number": 2}]}\nDone.'
    )
    assert parsed["figures"][0]["number"] == 2
