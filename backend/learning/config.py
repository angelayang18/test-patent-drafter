"""Configuration for org-wide draft learning."""

from __future__ import annotations

import os
from pathlib import Path

_DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "learning.db"


def is_learning_enabled() -> bool:
    """Return True when learning persistence and retrieval are active."""
    return os.getenv("LEARNING_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


def get_learning_db_path() -> Path:
    """Resolve the SQLite database file path."""
    raw = os.getenv("LEARNING_DB_PATH", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return _DEFAULT_DB_PATH.resolve()


def is_section_reflection_enabled() -> bool:
    """Return True when section agents run a critique-and-revise loop."""
    return os.getenv("SECTION_REFLECTION_ENABLED", "true").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
