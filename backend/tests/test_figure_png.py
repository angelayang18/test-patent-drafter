"""Tests for export figure PNG caching."""

from exporter.figure_png import _cache_key, decode_client_pngs, encode_png_map_for_client


def test_cache_key_stable():
    mermaid = "flowchart TB\n  A --> B"
    assert _cache_key(mermaid) == _cache_key(mermaid)


def test_encode_decode_roundtrip():
    raw = {1: b"\x89PNG\r\n\x1a\n\x00", 2: b"\x89PNG\r\n\x1a\n\x01"}
    encoded = encode_png_map_for_client(raw)
    decoded = decode_client_pngs(encoded)
    assert decoded[1] == raw[1]
    assert decoded[2] == raw[2]
