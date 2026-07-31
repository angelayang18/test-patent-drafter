"""Tests for SOW extraction normalization and grouped/field extraction."""

from unittest.mock import patch

import pytest

from drafter.sow_extractor import (
    EXTRACTABLE_SOW_FIELDS,
    _extract_grouped,
    _normalize_extraction,
    extract_sow_details,
    extract_sow_field,
)


def test_normalize_extraction_uses_canonical_keys():
    data = {
        "engagement_title": "SOW for X Integration",
        "client_name": "Acme Corp",
        "vendor_name": "opAIda",
        "purpose_and_background": "Integrate AI search into the customer portal.",
        "objectives": "Reduce ticket volume by 30%.",
        "scope_of_work": "Build retrieval API and UI widgets.",
        "deliverables": "API, runbook, and training deck.",
        "timeline_and_effort": "8 weeks, 120 hours.",
        "responsibilities_and_inputs": "Client provides SSO credentials.",
        "commercial_terms": "Fixed fee billed monthly.",
    }

    normalized = _normalize_extraction(data)

    assert set(normalized) == EXTRACTABLE_SOW_FIELDS
    assert normalized["engagement_title"] == "SOW for X Integration"
    assert normalized["client_name"] == "Acme Corp"
    assert normalized["deliverables"] == "API, runbook, and training deck."


def test_normalize_extraction_maps_field_aliases():
    data = {
        "engagementTitle": "Portal Integration SOW",
        "customerName": "Globex",
        "serviceProvider": "Nova Labs",
        "purpose": "Automate intake triage.",
        "goals": "Cut average handle time.",
        "scopeOfWork": "Classifier service and dashboard.",
        "outputs": "Deployed model and ops guide.",
        "schedule": "Two phases over six weeks.",
        "rolesAndResponsibilities": "Vendor owns model; client owns labels.",
        "pricing": "T&M with monthly invoices.",
    }

    normalized = _normalize_extraction(data)

    assert normalized["engagement_title"] == "Portal Integration SOW"
    assert normalized["client_name"] == "Globex"
    assert normalized["vendor_name"] == "Nova Labs"
    assert normalized["purpose_and_background"] == "Automate intake triage."
    assert normalized["objectives"] == "Cut average handle time."
    assert normalized["scope_of_work"] == "Classifier service and dashboard."
    assert normalized["deliverables"] == "Deployed model and ops guide."
    assert normalized["timeline_and_effort"] == "Two phases over six weeks."
    assert normalized["responsibilities_and_inputs"] == (
        "Vendor owns model; client owns labels."
    )
    assert normalized["commercial_terms"] == "T&M with monthly invoices."


def test_extract_grouped_merges_parallel_group_results():
    def fake_generate_json(_system: str, user: str) -> dict:
        if "engagement_title" in user and "objectives" not in user:
            return {
                "engagement_title": "Identity Title",
                "client_name": "Client Co",
                "vendor_name": "Vendor Co",
                "purpose_and_background": "Purpose text",
            }
        if "objectives" in user and "timeline_and_effort" not in user:
            return {
                "objectives": "Delivery objectives",
                "scope_of_work": "Delivery scope",
                "deliverables": "Delivery deliverables",
            }
        if "timeline_and_effort" in user:
            return {
                "timeline_and_effort": "Terms timeline",
                "responsibilities_and_inputs": "Terms responsibilities",
                "commercial_terms": "Terms commercial",
            }
        return {}

    with patch("drafter.sow_extractor.generate_json", side_effect=fake_generate_json):
        merged = _extract_grouped("system", "source documentation about an engagement")

    assert merged["engagement_title"] == "Identity Title"
    assert merged["objectives"] == "Delivery objectives"
    assert merged["commercial_terms"] == "Terms commercial"
    assert set(merged) == EXTRACTABLE_SOW_FIELDS


def test_extract_sow_field_returns_single_key():
    with patch(
        "drafter.sow_extractor.generate_json",
        return_value={"deliverables": "API spec and handoff package"},
    ):
        result = extract_sow_field(
            "Source text describing deliverables for the engagement.",
            "deliverables",
            current={"engagement_title": "SOW for X Integration"},
        )

    assert result["deliverables"] == "API spec and handoff package"
    assert "citations" in result
    assert "deliverables" in result["citations"]
    assert isinstance(result["citations"]["deliverables"], list)


def test_extract_sow_details_empty_combined_text_raises():
    with pytest.raises(ValueError, match="combined_text is required"):
        extract_sow_details("   ")


def test_extract_sow_field_empty_combined_text_raises():
    with pytest.raises(ValueError, match="combined_text is required"):
        extract_sow_field("", "objectives")


def test_extract_sow_field_unknown_field_raises():
    with pytest.raises(ValueError, match="Unknown field"):
        extract_sow_field("some source text", "not_a_field")
