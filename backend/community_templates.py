"""SQLite-backed store for shared community document-type templates."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).resolve().parent / "data" / "community_templates.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS community_templates (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    sections_json TEXT,
    created_by_user_id TEXT,
    created_by_name TEXT,
    based_on TEXT,
    created_at TEXT
);
"""


def init_db() -> None:
    """Create the database directory and ``community_templates`` table if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(_SCHEMA)
        conn.commit()


def _connect() -> sqlite3.Connection:
    """Open a connection to the community templates database."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def list_templates() -> list[dict[str, Any]]:
    """Return all community templates ordered by ``created_at`` descending.

    ``sections_json`` is parsed back into a list of section dicts.
    """
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, name, description, sections_json, created_by_user_id,
                   created_by_name, based_on, created_at
            FROM community_templates
            ORDER BY created_at DESC
            """
        ).fetchall()

    templates: list[dict[str, Any]] = []
    for row in rows:
        sections: list[Any]
        try:
            parsed = json.loads(row["sections_json"] or "[]")
            sections = parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            sections = []
        templates.append(
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "sections": sections,
                "created_by_user_id": row["created_by_user_id"],
                "created_by_name": row["created_by_name"],
                "based_on": row["based_on"],
                "created_at": row["created_at"],
            }
        )
    return templates


def create_template(
    name: str,
    description: str,
    sections: list[dict[str, Any]],
    created_by_user_id: str,
    created_by_name: str,
    based_on: str,
) -> str:
    """Insert a community template and return its new uuid4 id.

    ``sections`` is a list of
    ``{"id": str, "name": str, "description": str, "order": int}`` dicts,
    stored as JSON.
    """
    template_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    sections_json = json.dumps(sections)

    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO community_templates (
                id, name, description, sections_json,
                created_by_user_id, created_by_name, based_on, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                template_id,
                name,
                description,
                sections_json,
                created_by_user_id,
                created_by_name,
                based_on,
                created_at,
            ),
        )
        conn.commit()

    return template_id


init_db()
