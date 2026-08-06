"""Tests for grant extraction empty-field fallback after gap-fill."""

from unittest.mock import patch

from drafter.extract_context import EMPTY_FIELD_FALLBACK
from drafter.grant_extractor import EXTRACTABLE_GRANT_FIELDS, _extract_grouped


def test_extract_grouped_applies_fallback_for_empty_fields_after_gap_fill():
    """Insufficient sources must not leave silent empty strings."""

    with patch("drafter.grant_extractor.generate_json", return_value={}):
        merged = _extract_grouped("system", "x")

    assert set(merged) == EXTRACTABLE_GRANT_FIELDS
    for field in EXTRACTABLE_GRANT_FIELDS:
        assert merged[field] == EMPTY_FIELD_FALLBACK, field
