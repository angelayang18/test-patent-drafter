"""Render Mermaid diagrams to PNG for patent export."""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

DEFAULT_KROKI_BASE = "https://kroki.io"
RENDER_TIMEOUT_SECONDS = 45.0

# Black-and-white patent drawing theme (USPTO requires B/W line art).
_PATENT_MERMAID_INIT = (
    "%%{init: {'theme':'base', 'themeVariables': {"
    "'primaryColor':'#ffffff', 'primaryTextColor':'#000000', "
    "'primaryBorderColor':'#000000', 'lineColor':'#000000', "
    "'secondaryColor':'#ffffff', 'tertiaryColor':'#ffffff', "
    "'background':'#ffffff', 'mainBkg':'#ffffff', 'nodeBorder':'#000000', "
    "'clusterBkg':'#ffffff', 'titleColor':'#000000', "
    "'edgeLabelBackground':'#ffffff'"
    "}}}%%"
)


def sanitize_mermaid_for_headless(mermaid_source: str) -> str:
    """
    Normalize Mermaid for mmdc/Kroki.

    Bare ``&`` in node/edge labels often breaks headless renderers while browser
    Mermaid.js accepts them.
    """
    return re.sub(r"\s+&\s+", " and ", mermaid_source)


def apply_patent_mermaid_theme(mermaid_source: str) -> str:
    """Prepend a black-and-white Mermaid theme when not already configured."""
    source = sanitize_mermaid_for_headless(mermaid_source.strip())
    if not source:
        return source
    if "%%{init:" in source:
        return source
    return f"{_PATENT_MERMAID_INIT}\n{source}"


def _kroki_base_url() -> str:
    return os.getenv("KROKI_BASE_URL", DEFAULT_KROKI_BASE).rstrip("/")


def _render_via_kroki(mermaid_source: str) -> bytes:
    """Render Mermaid to PNG using a Kroki-compatible service."""
    url = f"{_kroki_base_url()}/mermaid/png"
    response = httpx.post(
        url,
        content=mermaid_source.encode("utf-8"),
        headers={"Content-Type": "text/plain"},
        timeout=RENDER_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.content


def _mmdc_executable() -> str | None:
    """Resolve mmdc from MMDC_PATH, PATH, or common pnpm/npm global bins."""
    override = os.getenv("MMDC_PATH", "").strip()
    if override:
        path = Path(override)
        if path.is_file():
            return str(path)
    found = shutil.which("mmdc")
    if found:
        return found
    home = Path.home()
    for candidate in (
        home / "Library/pnpm/mmdc",
        home / ".local/share/pnpm/mmdc",
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def _render_via_mmdc(mermaid_source: str) -> bytes:
    """Render Mermaid to PNG using @mermaid-js/mermaid-cli if installed."""
    mmdc = _mmdc_executable()
    if not mmdc:
        raise FileNotFoundError("mmdc not found on PATH")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        input_path = tmp_path / "diagram.mmd"
        output_path = tmp_path / "diagram.png"
        input_path.write_text(mermaid_source, encoding="utf-8")
        subprocess.run(
            [
                mmdc,
                "-i",
                str(input_path),
                "-o",
                str(output_path),
                "-b",
                "white",
                "-t",
                "neutral",
            ],
            check=True,
            capture_output=True,
            timeout=RENDER_TIMEOUT_SECONDS,
        )
        return output_path.read_bytes()


def render_mermaid_to_png(mermaid_source: str) -> bytes:
    """
    Render Mermaid source to PNG bytes.

    Tries local mmdc first, then falls back to Kroki.
    """
    source = apply_patent_mermaid_theme(mermaid_source)
    if not source:
        raise ValueError("Mermaid source is empty.")

    try:
        return _render_via_mmdc(source)
    except (FileNotFoundError, subprocess.CalledProcessError) as exc:
        log.info("mmdc unavailable or failed (%s); using Kroki", exc)

    try:
        return _render_via_kroki(source)
    except httpx.HTTPError as exc:
        raise RuntimeError(
            "Failed to render Mermaid diagram. Install mmdc "
            "(npm install -g @mermaid-js/mermaid-cli) or ensure KROKI_BASE_URL is reachable."
        ) from exc
