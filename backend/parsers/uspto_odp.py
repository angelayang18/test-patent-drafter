"""Look up an applicant's prior USPTO filings via the Open Data Portal API.

Used to suggest candidates for the "Cross-Reference to Related Applications"
filing field. This never determines or asserts a legal priority/continuation
relationship — it only surfaces other filings under the same applicant name
for a human to review and, if actually related, describe correctly.
"""

from __future__ import annotations

import logging
import os
import re

import requests
from requests import RequestException, Timeout

log = logging.getLogger(__name__)

ODP_SEARCH_URL = "https://api.uspto.gov/api/v1/patent/applications/search"
REQUEST_TIMEOUT = 15
MAX_RESULTS = 5


class ODPConfigError(Exception):
    """Raised when USPTO_ODP_API_KEY is missing or not configured."""


class ODPRequestError(Exception):
    """Raised when the USPTO ODP API request fails or is rejected."""


def _api_key() -> str:
    key = os.environ.get("USPTO_ODP_API_KEY", "").strip()
    if not key:
        raise ODPConfigError(
            "USPTO_ODP_API_KEY is not configured. Add it to the repo root .env."
        )
    return key


_QUERY_SPECIAL_CHARS = re.compile(r'[+\-!(){}\[\]^"~*?:\\/]')


def _escape_query_value(value: str) -> str:
    """Escape ODP/Lucene-style special characters so they're treated literally.

    ODP's simplified syntax (per USPTO's own documented examples, e.g.
    ``applicationMetaData.inventionTitle:Apple*``) does not wrap the value in
    quotes even when adding a trailing wildcard — a quoted-phrase-plus-wildcard
    is invalid and gets silently dropped, which made the query fall through to
    an unfiltered "most recent applications" result instead of erroring.
    """
    return _QUERY_SPECIAL_CHARS.sub(lambda m: f"\\{m.group(0)}", value)


def search_related_applications(applicant_name: str) -> list[dict]:
    """Return candidate prior USPTO filings for the given applicant name.

    Args:
        applicant_name: Applicant/assignee name to search for, e.g. "opAIda".

    Returns:
        Up to ``MAX_RESULTS`` candidates, each with applicationNumberText,
        inventionTitle, filingDate, applicationStatusDescriptionText, and
        patentNumber (empty string if not yet granted).

    Raises:
        ODPConfigError: If no API key is configured.
        ODPRequestError: If the request fails, is rejected, or times out.
    """
    name = applicant_name.strip()
    if not name:
        raise ODPRequestError("Applicant name is required.")

    api_key = _api_key()
    escaped = _escape_query_value(name)
    # Single-token names get a prefix wildcard (matches "opAIda" against
    # "opAIda Inc.", etc). Multi-word names use an exact quoted phrase instead
    # — ODP's query parser doesn't support combining a quoted phrase with a
    # trailing wildcard (see _escape_query_value docstring).
    if " " in name:
        query = f'applicationMetaData.firstApplicantName:"{escaped}"'
    else:
        query = f"applicationMetaData.firstApplicantName:{escaped}*"

    try:
        response = requests.get(
            ODP_SEARCH_URL,
            headers={"X-API-KEY": api_key, "accept": "application/json"},
            params={"q": query, "limit": MAX_RESULTS},
            timeout=REQUEST_TIMEOUT,
        )
    except Timeout as exc:
        raise ODPRequestError(
            f"USPTO ODP request timed out after {REQUEST_TIMEOUT}s."
        ) from exc
    except RequestException as exc:
        raise ODPRequestError(f"USPTO ODP request failed: {exc}") from exc

    if response.status_code == 401 or response.status_code == 403:
        raise ODPRequestError(
            "USPTO rejected the API key (401/403). It may be invalid, expired, "
            "or unused for over 90 days."
        )
    if response.status_code == 429:
        raise ODPRequestError("USPTO ODP rate limit hit (429). Try again shortly.")
    if response.status_code != 200:
        raise ODPRequestError(
            f"USPTO ODP request failed with status {response.status_code}: "
            f"{response.text[:300]}"
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise ODPRequestError("USPTO ODP returned a non-JSON response.") from exc

    candidates: list[dict] = []
    for item in data.get("patentFileWrapperDataBag", [])[:MAX_RESULTS]:
        meta = item.get("applicationMetaData", {}) or {}
        candidates.append(
            {
                "application_number": item.get("applicationNumberText", ""),
                "invention_title": meta.get("inventionTitle", ""),
                "filing_date": meta.get("filingDate", ""),
                "status": meta.get("applicationStatusDescriptionText", ""),
                "patent_number": meta.get("patentNumber", ""),
            }
        )
    return candidates
