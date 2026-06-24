"""Distill attorney feedback into org-wide drafting guidelines and retrieve context."""

from __future__ import annotations

import logging

from drafter.llm_client import generate_text
from drafter.prompts import PATENT_SECTIONS

log = logging.getLogger(__name__)

from .baseline_guidelines import (
    GLOBAL_GUIDELINE_SECTION,
    get_baseline_guidelines,
    merge_guidelines,
)
from .config import is_learning_enabled
from .prompts import (
    DISTILL_GUIDELINES_SYSTEM,
    build_distillation_user_prompt,
)
from .storage import DraftingContext, LearningStorage, get_storage


def _has_meaningful_edit(ai_initial: str, final_text: str) -> bool:
    """Return True when the finalized text differs from the AI baseline."""
    ai = ai_initial.strip()
    final = final_text.strip()
    if not final:
        return False
    if not ai:
        return True
    return ai != final


def _summarize_diff(section: str, ai_initial: str, final_text: str) -> str:
    """Produce a short diff summary for distillation."""
    ai = ai_initial.strip()
    final = final_text.strip()
    if not ai:
        return f"{section}: final text contributed without AI baseline."
    ai_len = len(ai)
    final_len = len(final)
    if final_len > ai_len * 1.2:
        return f"{section}: attorney substantially expanded AI draft ({ai_len} → {final_len} chars)."
    if final_len < ai_len * 0.8:
        return f"{section}: attorney substantially shortened AI draft ({ai_len} → {final_len} chars)."
    return f"{section}: attorney edited AI draft ({ai_len} → {final_len} chars)."


def _distill_section_guidelines(
    store: LearningStorage,
    section: str,
    *,
    existing: str,
    feedback_items: list[str],
    diff_summaries: list[str],
    feedback_count: int,
) -> None:
    """Merge feedback/diffs into guidelines for one section; log and continue on LLM errors."""
    user_prompt = build_distillation_user_prompt(
        section,
        existing,
        feedback_items,
        diff_summaries,
    )
    try:
        updated = generate_text(DISTILL_GUIDELINES_SYSTEM, user_prompt).strip()
    except Exception as exc:
        log.exception("Guideline distillation failed for section %s", section)
        return
    if updated:
        store.upsert_guidelines(
            section,
            updated,
            source_feedback_count=feedback_count,
        )


def distill_guidelines_for_submission(
    submission_id: int,
    storage: LearningStorage | None = None,
) -> None:
    """Merge feedback and edit diffs from a submission into org-wide guidelines."""
    if not is_learning_enabled():
        return

    store = storage or get_storage()
    feedback_rows = store.get_submission_feedback(submission_id)
    snapshots = store.get_submission_snapshots(submission_id)

    feedback_by_section: dict[str | None, list[str]] = {}
    for row in feedback_rows:
        key = row["section"]
        feedback_by_section.setdefault(key, []).append(str(row["comment"]))

    snapshots_by_section = {
        snap["section"]: snap for snap in snapshots if snap["final_text"].strip()
    }

    feedback_count = store.count_feedback()

    for section in PATENT_SECTIONS:
        section_feedback = feedback_by_section.get(section, [])
        snapshot = snapshots_by_section.get(section)
        has_edit = (
            snapshot is not None
            and _has_meaningful_edit(snapshot["ai_initial"], snapshot["final_text"])
        )
        if not section_feedback and not has_edit:
            continue

        section_diffs: list[str] = []
        if has_edit and snapshot is not None:
            section_diffs.append(
                _summarize_diff(
                    section,
                    snapshot["ai_initial"],
                    snapshot["final_text"],
                )
            )

        existing = merge_guidelines(
            get_baseline_guidelines(section),
            store.get_guidelines(section),
        )
        _distill_section_guidelines(
            store,
            section,
            existing=existing,
            feedback_items=section_feedback,
            diff_summaries=section_diffs,
            feedback_count=feedback_count,
        )

    global_feedback = feedback_by_section.get(None, [])
    if global_feedback:
        existing_global = merge_guidelines(
            get_baseline_guidelines(GLOBAL_GUIDELINE_SECTION),
            store.get_global_guidelines(),
        )
        meaningful_diffs = [
            _summarize_diff(
                snap["section"],
                snap["ai_initial"],
                snap["final_text"],
            )
            for snap in snapshots_by_section.values()
            if _has_meaningful_edit(snap["ai_initial"], snap["final_text"])
        ]
        _distill_section_guidelines(
            store,
            GLOBAL_GUIDELINE_SECTION,
            existing=existing_global,
            feedback_items=global_feedback,
            diff_summaries=meaningful_diffs,
            feedback_count=feedback_count,
        )


def retrieve_drafting_context(
    section: str,
    technical_field: str,
    storage: LearningStorage | None = None,
) -> DraftingContext:
    """Load org-wide guidelines and exemplars for a section draft."""
    if not is_learning_enabled():
        return DraftingContext(
            section_guidelines=get_baseline_guidelines(section),
            global_guidelines=get_baseline_guidelines(GLOBAL_GUIDELINE_SECTION),
            exemplars=[],
        )

    store = storage or get_storage()
    context = store.retrieve_drafting_context(section, technical_field)
    return DraftingContext(
        section_guidelines=merge_guidelines(
            get_baseline_guidelines(section),
            context.section_guidelines,
        ),
        global_guidelines=merge_guidelines(
            get_baseline_guidelines(GLOBAL_GUIDELINE_SECTION),
            context.global_guidelines,
        ),
        exemplars=context.exemplars,
    )
