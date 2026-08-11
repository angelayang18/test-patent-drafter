"""Tests for Clerk-gated community document-type template routes."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import community_templates
from auth import get_current_user
from main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """Use an isolated SQLite DB and clear auth overrides after each test."""
    db_path = tmp_path / "community_templates.db"
    monkeypatch.setattr(community_templates, "DB_PATH", db_path)
    community_templates.init_db()
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_list_community_templates_requires_auth(client: TestClient) -> None:
    """Unauthenticated GET /document-types/community returns 401."""
    response = client.get("/document-types/community")
    assert response.status_code == 401


def test_create_and_list_community_template_round_trip(client: TestClient) -> None:
    """Valid create+list returns the template with ``mine`` true for the creator."""
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "user_alice"}

    create_response = client.post(
        "/document-types/community",
        json={
            "name": "Safety Report",
            "description": "Shared outline for safety write-ups",
            "sections": [
                {
                    "id": "summary",
                    "name": "Summary",
                    "description": "High-level overview",
                    "order": 0,
                },
                {
                    "id": "findings",
                    "name": "Findings",
                    "description": "Detailed findings",
                    "order": 1,
                },
            ],
            "based_on": "grant",
            "created_by_name": "Alice",
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["id"]
    assert created["created_at"]

    list_response = client.get("/document-types/community")
    assert list_response.status_code == 200
    body = list_response.json()
    assert "templates" in body
    assert len(body["templates"]) == 1

    template = body["templates"][0]
    assert template["id"] == created["id"]
    assert template["name"] == "Safety Report"
    assert template["description"] == "Shared outline for safety write-ups"
    assert template["based_on"] == "grant"
    assert template["created_by_user_id"] == "user_alice"
    assert template["created_by_name"] == "Alice"
    assert template["mine"] is True
    assert template["sections"] == [
        {
            "id": "summary",
            "name": "Summary",
            "description": "High-level overview",
            "order": 0,
        },
        {
            "id": "findings",
            "name": "Findings",
            "description": "Detailed findings",
            "order": 1,
        },
    ]

    # Another user should see the same template with mine=False.
    app.dependency_overrides[get_current_user] = lambda: {"user_id": "user_bob"}
    other_list = client.get("/document-types/community")
    assert other_list.status_code == 200
    other_template = other_list.json()["templates"][0]
    assert other_template["id"] == created["id"]
    assert other_template["mine"] is False
