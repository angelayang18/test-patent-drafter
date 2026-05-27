"""Confluence REST API client."""

from __future__ import annotations

import logging
import os
import re
from urllib.parse import parse_qs, urlparse

import requests
from atlassian import Confluence
from atlassian.errors import ApiError, ApiPermissionError
from bs4 import BeautifulSoup
from requests import HTTPError, RequestException

log = logging.getLogger(__name__)

_PAGE_ID_PATTERNS = (
    re.compile(r"/pages/(\d+)"),
    re.compile(r"pageId=(\d+)", re.IGNORECASE),
)


def _clean_text(text: str) -> str:
    """Normalize whitespace: trim lines and collapse runs of blank lines."""
    lines: list[str] = []
    prev_blank = False
    for raw_line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", raw_line).strip()
        if not line:
            if not prev_blank:
                lines.append("")
            prev_blank = True
        else:
            lines.append(line)
            prev_blank = False
    while lines and lines[0] == "":
        lines.pop(0)
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def _strip_html(html: str) -> str:
    """Convert Confluence storage HTML to plain text."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    return _clean_text(soup.get_text(separator="\n"))


def _parse_page_id(page_url: str) -> str:
    """Extract a Confluence page ID from a page URL."""
    parsed = urlparse(page_url.strip())
    path = parsed.path or page_url

    for pattern in _PAGE_ID_PATTERNS:
        match = pattern.search(path) or pattern.search(page_url)
        if match:
            return match.group(1)

    query = parse_qs(parsed.query)
    page_ids = query.get("pageId") or query.get("pageid")
    if page_ids:
        return page_ids[0]

    raise ValueError(
        f"Could not parse Confluence page ID from URL: {page_url!r}. "
        "Expected a URL like "
        "https://opaida.atlassian.net/wiki/spaces/Business/pages/313622529/..."
    )


def _is_scoped_token(api_token: str) -> bool:
    """Return True for Atlassian scoped API tokens (``ATATT...``)."""
    return api_token.startswith("ATATT")


def _site_origin(base_url: str) -> str:
    """Return the site origin, e.g. ``https://opaida.atlassian.net``."""
    parsed = urlparse(base_url)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return base_url.split("/wiki")[0].rstrip("/")


def _resolve_cloud_id(base_url: str, cloud_id: str | None = None) -> str:
    """Resolve the Atlassian cloud ID for scoped API tokens."""
    if cloud_id:
        return cloud_id

    site_origin = _site_origin(base_url)
    try:
        response = requests.get(
            f"{site_origin}/_edge/tenant_info",
            timeout=30,
        )
        response.raise_for_status()
        resolved = response.json().get("cloudId", "")
    except (RequestException, ValueError) as exc:
        raise ConnectionError(
            f"Could not resolve Confluence cloud ID from {site_origin}: {exc}"
        ) from exc

    if not resolved:
        raise ValueError(
            "Confluence cloud ID is required for scoped API tokens. "
            "Set CONFLUENCE_CLOUD_ID or use a site URL like "
            "https://opaida.atlassian.net/wiki."
        )
    return resolved


class ConfluenceClient:
    """Client for fetching Confluence page content via the REST API."""

    def __init__(
        self,
        base_url: str,
        username: str = "",
        api_token: str = "",
        cloud_id: str | None = None,
    ):
        """
        Initialize the Confluence client.

        Args:
            base_url: Confluence wiki base URL, e.g. ``https://opaida.atlassian.net/wiki``.
            username: Atlassian account email. Required for all API tokens.
            api_token: Atlassian API token (classic or scoped ``ATATT...``).
            cloud_id: Optional Atlassian cloud ID for scoped tokens. Resolved
                automatically from ``base_url`` when omitted.
        """
        self.base_url = base_url.rstrip("/")
        self.username = username.strip()
        self.api_token = api_token.strip()
        self.cloud_id = cloud_id or ""
        self.scoped_token = _is_scoped_token(self.api_token)

        if not self.base_url:
            raise ValueError("Confluence base URL is required.")
        if not self.api_token:
            raise ValueError("Confluence API token is required.")
        if not self.username:
            raise ValueError(
                "Confluence username (Atlassian account email) is required."
            )

        if self.scoped_token:
            self.cloud_id = _resolve_cloud_id(self.base_url, self.cloud_id or None)
            api_url = (
                f"https://api.atlassian.com/ex/confluence/{self.cloud_id}/wiki"
            )
            self._client = Confluence(
                url=api_url,
                username=self.username,
                password=self.api_token,
                cloud=True,
            )
        else:
            self._client = Confluence(
                url=self.base_url,
                username=self.username,
                password=self.api_token,
                cloud="atlassian.net" in self.base_url,
            )

    @classmethod
    def from_env(cls) -> ConfluenceClient:
        """Create a client using ``CONFLUENCE_*`` environment variables."""
        api_token = os.getenv("CONFLUENCE_API_TOKEN") or os.getenv("CONFLUENCE_TOKEN", "")
        return cls(
            base_url=os.getenv("CONFLUENCE_BASE_URL", ""),
            username=os.getenv("CONFLUENCE_USERNAME", ""),
            api_token=api_token,
            cloud_id=os.getenv("CONFLUENCE_CLOUD_ID") or None,
        )

    def _build_page_url(self, page: dict) -> str:
        """Build a browser URL for a Confluence page payload."""
        links = page.get("_links") or {}
        webui = links.get("webui") or links.get("tinyui")
        if webui:
            if webui.startswith("http"):
                return webui
            if webui.startswith("/wiki"):
                return f"{self.base_url.split('/wiki')[0]}{webui}"
            return f"{self.base_url}{webui}"

        page_id = page.get("id")
        if page_id:
            return f"{self.base_url}/pages/viewpage.action?pageId={page_id}"

        raise ValueError("Confluence page payload did not include a usable URL.")

    def _extract_page_content(self, page: dict) -> str:
        """Extract cleaned text content from a Confluence page payload."""
        body = page.get("body") or {}
        storage = (body.get("storage") or {}).get("value", "")
        if storage:
            return _strip_html(storage)

        view = (body.get("view") or {}).get("value", "")
        if view:
            return _strip_html(view)

        return ""

    def get_page_content(self, page_url: str) -> str:
        """
        Fetch a Confluence page by URL and return its plain-text content.

        Args:
            page_url: Full Confluence page URL.

        Returns:
            Page text with HTML removed and whitespace normalized.
        """
        page_id = _parse_page_id(page_url)

        try:
            page = self._client.get_page_by_id(page_id, expand="body.storage")
        except ApiPermissionError as exc:
            raise PermissionError(
                f"Permission denied when fetching Confluence page {page_id}."
            ) from exc
        except ApiError as exc:
            raise LookupError(
                f"Confluence page {page_id} was not found or could not be loaded."
            ) from exc
        except HTTPError as exc:
            raise ConnectionError(
                f"Confluence API request failed for page {page_id}: "
                f"{exc.response.status_code} {exc.response.reason}"
            ) from exc
        except RequestException as exc:
            raise ConnectionError(
                f"Network error while fetching Confluence page {page_id}: {exc}"
            ) from exc

        if not page:
            raise LookupError(f"Confluence page {page_id} was not found.")

        content = self._extract_page_content(page)
        if not content:
            log.warning("Confluence page %s returned empty content.", page_id)
        return content

    def get_space_pages(self, space_key: str, limit: int = 20) -> list[dict]:
        """
        Return pages from a Confluence space.

        Args:
            space_key: Space key, e.g. ``Business``.
            limit: Maximum number of pages to return.

        Returns:
            List of dicts with ``title``, ``url``, and ``content`` keys.
        """
        if not space_key:
            raise ValueError("Confluence space key is required.")
        if limit < 1:
            raise ValueError("Limit must be at least 1.")

        try:
            pages = self._client.get_all_pages_from_space(
                space=space_key,
                start=0,
                limit=limit,
                expand="body.storage",
            )
        except ApiPermissionError as exc:
            raise PermissionError(
                f"Permission denied when listing pages in space {space_key!r}."
            ) from exc
        except ApiError as exc:
            raise LookupError(
                f"Could not load pages for Confluence space {space_key!r}."
            ) from exc
        except HTTPError as exc:
            raise ConnectionError(
                f"Confluence API request failed for space {space_key!r}: "
                f"{exc.response.status_code} {exc.response.reason}"
            ) from exc
        except RequestException as exc:
            raise ConnectionError(
                f"Network error while listing Confluence space {space_key!r}: {exc}"
            ) from exc

        results: list[dict] = []
        for page in pages[:limit]:
            try:
                results.append(
                    {
                        "title": page.get("title", ""),
                        "url": self._build_page_url(page),
                        "content": self._extract_page_content(page),
                    }
                )
            except ValueError as exc:
                page_id = page.get("id", "unknown")
                log.warning(
                    "Skipping Confluence page %s in space %s: %s",
                    page_id,
                    space_key,
                    exc,
                )

        return results
