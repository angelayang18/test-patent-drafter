"""SQLite schema initialization for draft learning."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from .config import get_learning_db_path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS draft_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invention_title TEXT NOT NULL DEFAULT '',
    technical_field TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS section_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    section TEXT NOT NULL,
    ai_initial TEXT NOT NULL DEFAULT '',
    final_text TEXT NOT NULL DEFAULT '',
    is_approved INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (submission_id) REFERENCES draft_submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attorney_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL,
    section TEXT,
    comment TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES draft_submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS drafting_guidelines (
    section TEXT PRIMARY KEY,
    guidelines_text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    source_feedback_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_section_snapshots_section
    ON section_snapshots(section);
CREATE INDEX IF NOT EXISTS idx_section_snapshots_submission
    ON section_snapshots(submission_id);
CREATE INDEX IF NOT EXISTS idx_attorney_feedback_submission
    ON attorney_feedback(submission_id);
"""


def ensure_db_directory(db_path: Path | None = None) -> Path:
    """Create parent directories for the learning database if needed."""
    path = db_path or get_learning_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    """Open a SQLite connection with schema initialized."""
    path = ensure_db_directory(db_path)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(_SCHEMA)
    try:
        conn.execute(
            "ALTER TABLE section_snapshots ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 0"
        )
    except sqlite3.OperationalError:
        pass
    return conn
