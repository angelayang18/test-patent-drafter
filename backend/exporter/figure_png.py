"""Parallel Mermaid→PNG rendering with caching for patent export."""

from __future__ import annotations

import base64
import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from .mermaid_render import apply_patent_mermaid_theme, render_mermaid_to_png

log = logging.getLogger(__name__)

# Process-wide cache: same Mermaid source is not re-rendered (e.g. DOCX then PDF).
_PNG_CACHE: dict[str, bytes] = {}


def _themed_source(mermaid: str) -> str:
    return apply_patent_mermaid_theme(mermaid)


def _cache_key(mermaid: str) -> str:
    return hashlib.sha256(_themed_source(mermaid).encode("utf-8")).hexdigest()


def render_mermaid_to_png_cached(mermaid: str) -> bytes:
    """Render Mermaid to PNG, reusing bytes when the source was rendered before."""
    source = _themed_source(mermaid)
    if not source:
        raise ValueError("Mermaid source is empty.")

    key = _cache_key(mermaid)
    cached = _PNG_CACHE.get(key)
    if cached is not None:
        return cached

    png = render_mermaid_to_png(mermaid)
    _PNG_CACHE[key] = png
    return png


def decode_client_pngs(figure_pngs: dict[str, str] | None) -> dict[int, bytes]:
    """Decode base64 PNG map from the client (keys are figure numbers as strings)."""
    if not figure_pngs:
        return {}
    decoded: dict[int, bytes] = {}
    for key, value in figure_pngs.items():
        if not value or not str(value).strip():
            continue
        try:
            number = int(key)
        except (TypeError, ValueError):
            continue
        try:
            decoded[number] = base64.b64decode(value)
        except Exception as exc:
            log.warning("Invalid base64 PNG for figure %s: %s", key, exc)
    return decoded


def prerender_figure_pngs(
    figures: list[dict[str, Any]],
    *,
    client_pngs: dict[int, bytes] | None = None,
) -> dict[int, bytes]:
    """
    Build a figure-number → PNG bytes map for export.

    Uses client-supplied PNGs when present; otherwise renders missing figures in
    parallel (one worker per figure, capped at 8).
    """
    client_pngs = client_pngs or {}
    sorted_figures = sorted(figures, key=lambda f: int(f.get("number", 0)))
    result: dict[int, bytes] = {}

    to_render: list[tuple[int, str]] = []
    for figure in sorted_figures:
        number = int(figure.get("number", 0))
        if number in client_pngs:
            result[number] = client_pngs[number]
            continue
        mermaid = str(figure.get("mermaid", "")).strip()
        if not mermaid:
            continue
        to_render.append((number, mermaid))

    if not to_render:
        return result

    max_workers = min(len(to_render), 8)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(render_mermaid_to_png_cached, mermaid): number
            for number, mermaid in to_render
        }
        for future in as_completed(futures):
            number = futures[future]
            try:
                result[number] = future.result()
            except Exception as exc:
                log.warning("Figure %s PNG render failed: %s", number, exc)

    return result


def encode_png_map_for_client(png_by_number: dict[int, bytes]) -> dict[str, str]:
    """Encode rendered PNGs for JSON transport to the frontend."""
    return {
        str(number): base64.b64encode(png).decode("ascii")
        for number, png in png_by_number.items()
    }
