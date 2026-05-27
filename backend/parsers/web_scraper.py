"""Scrape readable text from web pages."""

from __future__ import annotations

import logging
import re

import requests
from bs4 import BeautifulSoup
from requests import RequestException, Timeout

log = logging.getLogger(__name__)

REQUEST_TIMEOUT = 5

_DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

_LINKEDIN_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}

_NOISE_TAGS = (
    "script",
    "style",
    "nav",
    "footer",
    "header",
    "aside",
    "noscript",
    "iframe",
    "form",
)

_AD_PATTERNS = re.compile(
    r"(^|[\s_-])(ad|ads|advert|advertisement|banner|cookie|popup|newsletter)([\s_-]|$)",
    re.IGNORECASE,
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


def _is_noise_element(element) -> bool:
    """Return True for common navigation or ad containers."""
    attrs = " ".join(
        filter(
            None,
            [
                element.get("id", ""),
                " ".join(element.get("class", [])),
                element.get("role", ""),
            ],
        )
    )
    return bool(_AD_PATTERNS.search(attrs))


def _remove_noise(soup: BeautifulSoup) -> None:
    """Strip scripts, styles, navigation, ads, and other non-body content."""
    for tag_name in _NOISE_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    for element in soup.find_all(True):
        if _is_noise_element(element):
            element.decompose()


def _extract_main_text(soup: BeautifulSoup) -> str:
    """Extract the primary readable body text from a parsed page."""
    candidates = [
        soup.find("main"),
        soup.find("article"),
        soup.find(attrs={"role": "main"}),
        soup.find(id=re.compile(r"(main|content|article|post)", re.IGNORECASE)),
        soup.find(class_=re.compile(r"(main|content|article|post-body|entry-content)", re.IGNORECASE)),
        soup.body,
    ]

    for candidate in candidates:
        if candidate and candidate.get_text(strip=True):
            return _clean_text(candidate.get_text(separator="\n"))

    return _clean_text(soup.get_text(separator="\n"))


def _fetch_url(url: str, headers: dict[str, str]) -> requests.Response:
    """Fetch a URL with a fixed timeout."""
    return requests.get(
        url,
        headers=headers,
        timeout=REQUEST_TIMEOUT,
        allow_redirects=True,
    )


def scrape_url(url: str) -> str:
    """
    Fetch a webpage and return cleaned main body text.

    Uses ``requests`` and ``BeautifulSoup`` to remove scripts, styles,
    navigation, ads, and other non-content elements.

    Args:
        url: Page URL to scrape.

    Returns:
        Clean plain-text content, or a short error message on failure.
    """
    if not url.strip():
        return "Unable to fetch URL: URL is empty."

    try:
        response = _fetch_url(url.strip(), _DEFAULT_HEADERS)
        response.raise_for_status()
    except Timeout:
        log.warning("Timed out fetching URL: %s", url)
        return f"Unable to fetch URL (timed out after {REQUEST_TIMEOUT}s): {url}"
    except RequestException as exc:
        log.warning("Connection error fetching URL %s: %s", url, exc)
        return f"Unable to fetch URL due to connection error: {exc}"

    soup = BeautifulSoup(response.text, "html.parser")
    _remove_noise(soup)
    return _extract_main_text(soup)


def scrape_linkedin_page(url: str) -> str:
    """
    Fetch a LinkedIn page and return cleaned text content.

    Uses realistic browser headers to reduce blocking. If the page cannot be
    accessed, returns a note describing the issue instead of raising.

    Args:
        url: LinkedIn page URL to scrape.

    Returns:
        Clean plain-text content or an accessibility note.
    """
    if not url.strip():
        return "Note: LinkedIn page content is inaccessible (URL is empty)."

    try:
        response = _fetch_url(url.strip(), _LINKEDIN_HEADERS)
        response.raise_for_status()
    except Timeout:
        log.warning("Timed out fetching LinkedIn URL: %s", url)
        return "Note: LinkedIn page content is inaccessible (request timed out)."
    except RequestException as exc:
        log.warning("Connection error fetching LinkedIn URL %s: %s", url, exc)
        return f"Note: LinkedIn page content is inaccessible ({exc})."

    final_url = response.url.lower()
    if "authwall" in final_url or "/login" in final_url or "/checkpoint" in final_url:
        return "Note: LinkedIn page content is inaccessible (login required)."

    page_html = response.text.lower()
    if "sign in" in page_html and "join now" in page_html:
        return "Note: LinkedIn page content is inaccessible (authentication required)."

    soup = BeautifulSoup(response.text, "html.parser")
    _remove_noise(soup)
    text = _extract_main_text(soup)

    if len(text.strip()) < 50:
        return (
            "Note: LinkedIn page content is inaccessible "
            "(page blocked or returned insufficient content)."
        )

    return text
