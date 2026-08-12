"""Tests for USPTO ODP related-application lookup."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from main import app
from parsers.uspto_odp import (
    ODPConfigError,
    ODPRequestError,
    search_related_applications,
)

client = TestClient(app)


def _mock_response(status_code: int, json_body: dict | None = None, text: str = "") -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.text = text
    response.json.return_value = json_body or {}
    return response


def _sample_odp_body() -> dict:
    return {
        "count": 1,
        "patentFileWrapperDataBag": [
            {
                "applicationNumberText": "63123456",
                "applicationMetaData": {
                    "inventionTitle": "Smart Document Chunking",
                    "filingDate": "2026-01-15",
                    "applicationStatusDescriptionText": "Docketed New Case",
                    "patentNumber": "",
                    "firstApplicantName": "opAIda",
                },
            }
        ],
    }


def test_search_raises_config_error_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("USPTO_ODP_API_KEY", raising=False)
    with pytest.raises(ODPConfigError):
        search_related_applications("opAIda")


def test_search_builds_unquoted_prefix_wildcard_for_single_token_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression test: a quoted-phrase + trailing wildcard is invalid ODP
    syntax and was silently falling through to unfiltered "most recent
    applications" results instead of an error. Single-token names must use
    an unquoted prefix wildcard, matching USPTO's own documented example
    (``applicationMetaData.inventionTitle:Apple*``)."""
    monkeypatch.setenv("USPTO_ODP_API_KEY", "test-key")
    mock_get = MagicMock(return_value=_mock_response(200, _sample_odp_body()))
    with patch("parsers.uspto_odp.requests.get", mock_get):
        search_related_applications("opAIda")

    sent_params = mock_get.call_args.kwargs["params"]
    assert sent_params["q"] == "applicationMetaData.firstApplicantName:opAIda*"


def test_search_builds_quoted_phrase_for_multi_word_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USPTO_ODP_API_KEY", "test-key")
    mock_get = MagicMock(return_value=_mock_response(200, _sample_odp_body()))
    with patch("parsers.uspto_odp.requests.get", mock_get):
        search_related_applications("opAIda Inc")

    sent_params = mock_get.call_args.kwargs["params"]
    assert sent_params["q"] == 'applicationMetaData.firstApplicantName:"opAIda Inc"'


def test_search_returns_parsed_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USPTO_ODP_API_KEY", "test-key")
    with patch("parsers.uspto_odp.requests.get", return_value=_mock_response(200, _sample_odp_body())):
        candidates = search_related_applications("opAIda")

    assert candidates == [
        {
            "application_number": "63123456",
            "invention_title": "Smart Document Chunking",
            "filing_date": "2026-01-15",
            "status": "Docketed New Case",
            "patent_number": "",
        }
    ]


def test_search_raises_on_auth_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USPTO_ODP_API_KEY", "bad-key")
    with patch("parsers.uspto_odp.requests.get", return_value=_mock_response(401, text="unauthorized")):
        with pytest.raises(ODPRequestError):
            search_related_applications("opAIda")


def test_search_raises_on_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USPTO_ODP_API_KEY", "test-key")
    with patch("parsers.uspto_odp.requests.get", return_value=_mock_response(429, text="slow down")):
        with pytest.raises(ODPRequestError):
            search_related_applications("opAIda")


def test_search_requires_nonempty_name(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("USPTO_ODP_API_KEY", "test-key")
    with pytest.raises(ODPRequestError):
        search_related_applications("   ")


def test_endpoint_requires_applicant_name() -> None:
    response = client.post("/export/suggest-related-applications", json={"applicant_name": ""})
    assert response.status_code == 400


def test_endpoint_returns_503_when_unconfigured() -> None:
    with patch(
        "main.search_related_applications",
        side_effect=ODPConfigError("USPTO_ODP_API_KEY is not configured."),
    ):
        response = client.post(
            "/export/suggest-related-applications", json={"applicant_name": "opAIda"}
        )
    assert response.status_code == 503


def test_endpoint_returns_502_on_request_error() -> None:
    with patch(
        "main.search_related_applications",
        side_effect=ODPRequestError("USPTO ODP rate limit hit (429)."),
    ):
        response = client.post(
            "/export/suggest-related-applications", json={"applicant_name": "opAIda"}
        )
    assert response.status_code == 502


def test_endpoint_happy_path() -> None:
    with patch(
        "main.search_related_applications",
        return_value=[
            {
                "application_number": "63123456",
                "invention_title": "Smart Document Chunking",
                "filing_date": "2026-01-15",
                "status": "Docketed New Case",
                "patent_number": "",
            }
        ],
    ):
        response = client.post(
            "/export/suggest-related-applications", json={"applicant_name": "opAIda"}
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body["candidates"]) == 1
    assert body["candidates"][0]["application_number"] == "63123456"
