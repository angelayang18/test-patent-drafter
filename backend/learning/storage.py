"""Persistence layer for draft submissions, feedback, and guidelines."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from drafter.prompts import PATENT_SECTIONS

from .config import get_learning_db_path, is_learning_enabled
from .db import connect


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class ExemplarSnippet:
    """A truncated finalized section from a past submission."""

    section: str
    technical_field: str
    text: str


@dataclass(frozen=True)
class DraftingContext:
    """Org-wide guidance retrieved for a section draft."""

    section_guidelines: str
    global_guidelines: str
    exemplars: list[ExemplarSnippet]


class LearningStorage:
    """SQLite-backed store for learning corpus and distilled guidelines."""

    def __init__(self, db_path=None) -> None:
        self._db_path = db_path or get_learning_db_path()

    def submit_draft(
        self,
        *,
        invention_title: str,
        technical_field: str,
        sections: dict[str, str],
        ai_initial_sections: dict[str, str] | None = None,
        attorney_feedback: dict[str, str] | None = None,
        attorney_feedback_global: str = "",
    ) -> int:
        """Persist a contributed draft and return the submission id."""
        ai_initial = ai_initial_sections or {}
        feedback = attorney_feedback or {}
        submitted_at = _utc_now_iso()

        with connect(self._db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO draft_submissions (invention_title, technical_field, submitted_at)
                VALUES (?, ?, ?)
                """,
                (invention_title.strip(), technical_field.strip(), submitted_at),
            )
            submission_id = int(cursor.lastrowid)

            for section in PATENT_SECTIONS:
                final_text = (sections.get(section) or "").strip()
                if not final_text:
                    continue
                conn.execute(
                    """
                    INSERT INTO section_snapshots
                        (submission_id, section, ai_initial, final_text)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        submission_id,
                        section,
                        (ai_initial.get(section) or "").strip(),
                        final_text,
                    ),
                )

            for section, comment in feedback.items():
                cleaned = comment.strip()
                if not cleaned:
                    continue
                conn.execute(
                    """
                    INSERT INTO attorney_feedback (submission_id, section, comment, submitted_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (submission_id, section.strip(), cleaned, submitted_at),
                )

            global_comment = attorney_feedback_global.strip()
            if global_comment:
                conn.execute(
                    """
                    INSERT INTO attorney_feedback (submission_id, section, comment, submitted_at)
                    VALUES (?, NULL, ?, ?)
                    """,
                    (submission_id, global_comment, submitted_at),
                )

            conn.commit()
            return submission_id

    def get_guidelines(self, section: str) -> str:
        """Return distilled guidelines for a section, or empty string."""
        with connect(self._db_path) as conn:
            row = conn.execute(
                "SELECT guidelines_text FROM drafting_guidelines WHERE section = ?",
                (section,),
            ).fetchone()
        if not row:
            return ""
        return str(row["guidelines_text"] or "").strip()

    def get_global_guidelines(self) -> str:
        """Return distilled cross-section guidelines stored under section key '_global'."""
        return self.get_guidelines("_global")

    def upsert_guidelines(
        self,
        section: str,
        guidelines_text: str,
        *,
        source_feedback_count: int,
    ) -> None:
        """Insert or replace distilled guidelines for a section."""
        cleaned = guidelines_text.strip()
        if not cleaned:
            return
        with connect(self._db_path) as conn:
            conn.execute(
                """
                INSERT INTO drafting_guidelines (section, guidelines_text, updated_at, source_feedback_count)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(section) DO UPDATE SET
                    guidelines_text = excluded.guidelines_text,
                    updated_at = excluded.updated_at,
                    source_feedback_count = excluded.source_feedback_count
                """,
                (section, cleaned, _utc_now_iso(), source_feedback_count),
            )
            conn.commit()

    def count_feedback(self) -> int:
        """Return total attorney feedback rows in the corpus."""
        with connect(self._db_path) as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM attorney_feedback").fetchone()
        return int(row["count"]) if row else 0

    def get_submission_feedback(self, submission_id: int) -> list[dict[str, str | None]]:
        """Return feedback rows for a submission."""
        with connect(self._db_path) as conn:
            rows = conn.execute(
                """
                SELECT section, comment
                FROM attorney_feedback
                WHERE submission_id = ?
                ORDER BY id
                """,
                (submission_id,),
            ).fetchall()
        return [{"section": row["section"], "comment": row["comment"]} for row in rows]

    def get_submission_snapshots(self, submission_id: int) -> list[dict[str, str]]:
        """Return section snapshots for a submission."""
        with connect(self._db_path) as conn:
            rows = conn.execute(
                """
                SELECT section, ai_initial, final_text
                FROM section_snapshots
                WHERE submission_id = ?
                ORDER BY section
                """,
                (submission_id,),
            ).fetchall()
        return [
            {
                "section": row["section"],
                "ai_initial": row["ai_initial"],
                "final_text": row["final_text"],
            }
            for row in rows
        ]

    def list_all_guidelines(self) -> dict[str, str]:
        """Return all distilled guidelines keyed by section id."""
        with connect(self._db_path) as conn:
            rows = conn.execute(
                "SELECT section, guidelines_text FROM drafting_guidelines ORDER BY section"
            ).fetchall()
        return {row["section"]: row["guidelines_text"] for row in rows}

    def retrieve_exemplars(
        self,
        section: str,
        technical_field: str,
        *,
        limit: int = 2,
        max_chars: int = 800,
    ) -> list[ExemplarSnippet]:
        """Select finalized section snippets, preferring matching technical field."""
        field = technical_field.strip().lower()
        with connect(self._db_path) as conn:
            if field:
                rows = conn.execute(
                    """
                    SELECT ss.section, ds.technical_field, ss.final_text, ds.submitted_at
                    FROM section_snapshots ss
                    JOIN draft_submissions ds ON ds.id = ss.submission_id
                    WHERE ss.section = ?
                      AND LOWER(ds.technical_field) = ?
                      AND TRIM(ss.final_text) != ''
                    ORDER BY ds.submitted_at DESC
                    LIMIT ?
                    """,
                    (section, field, limit),
                ).fetchall()
            else:
                rows = []

            remaining = limit - len(rows)
            if remaining > 0:
                exclude_ids = {row["final_text"] for row in rows}
                fallback = conn.execute(
                    """
                    SELECT ss.section, ds.technical_field, ss.final_text, ds.submitted_at
                    FROM section_snapshots ss
                    JOIN draft_submissions ds ON ds.id = ss.submission_id
                    WHERE ss.section = ?
                      AND TRIM(ss.final_text) != ''
                    ORDER BY ds.submitted_at DESC
                    LIMIT ?
                    """,
                    (section, limit + len(exclude_ids)),
                ).fetchall()
                for row in fallback:
                    if len(rows) >= limit:
                        break
                    if row["final_text"] in exclude_ids:
                        continue
                    rows.append(row)

        exemplars: list[ExemplarSnippet] = []
        for row in rows:
            text = str(row["final_text"]).strip()
            if len(text) > max_chars:
                text = text[: max_chars - 3].rstrip() + "..."
            exemplars.append(
                ExemplarSnippet(
                    section=row["section"],
                    technical_field=row["technical_field"] or "",
                    text=text,
                )
            )
        return exemplars

    def retrieve_drafting_context(
        self,
        section: str,
        technical_field: str,
    ) -> DraftingContext:
        """Load guidelines and exemplars for section generation."""
        return DraftingContext(
            section_guidelines=self.get_guidelines(section),
            global_guidelines=self.get_global_guidelines(),
            exemplars=self.retrieve_exemplars(section, technical_field),
        )


_storage: Optional[LearningStorage] = None


def get_storage() -> LearningStorage:
    """Return the process-wide learning storage singleton."""
    global _storage
    if _storage is None:
        _storage = LearningStorage()
    return _storage


def reset_storage(db_path=None) -> LearningStorage:
    """Replace the singleton storage (used in tests)."""
    global _storage
    _storage = LearningStorage(db_path=db_path)
    return _storage
