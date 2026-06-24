"""Distill attorney feedback into org-wide drafting guidelines and retrieve context."""

from __future__ import annotations

from drafter.llm_client import generate_text
from drafter.prompts import PATENT_SECTIONS

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


def _summarize_diff(section: str, ai_initial: str, final_text: str) -> str:
    """Produce a short diff summary for distillation."""
    ai = ai_initial.strip()
    final = final_text.strip()
    if not ai:
        return f"{section}: final text contributed without AI baseline."
    if ai == final:
        return f"{section}: attorney accepted AI draft unchanged."
    ai_len = len(ai)
    final_len = len(final)
    if final_len > ai_len * 1.2:
        return f"{section}: attorney substantially expanded AI draft ({ai_len} → {final_len} chars)."
    if final_len < ai_len * 0.8:
        return f"{section}: attorney substantially shortened AI draft ({ai_len} → {final_len} chars)."
    return f"{section}: attorney edited AI draft ({ai_len} → {final_len} chars)."


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

    diff_by_section = {
        snap["section"]: _summarize_diff(
            snap["section"],
            snap["ai_initial"],
            snap["final_text"],
        )
        for snap in snapshots
        if snap["final_text"].strip()
    }

    feedback_count = store.count_feedback()

    for section in PATENT_SECTIONS:
        section_feedback = feedback_by_section.get(section, [])
        section_diffs = [diff_by_section[section]] if section in diff_by_section else []
        if not section_feedback and not section_diffs:
            continue

        existing = merge_guidelines(
            get_baseline_guidelines(section),
            store.get_guidelines(section),
        )
        user_prompt = build_distillation_user_prompt(
            section,
            existing,
            section_feedback,
            section_diffs,
        )
        updated = generate_text(DISTILL_GUIDELINES_SYSTEM, user_prompt).strip()
        if updated:
            store.upsert_guidelines(
                section,
                updated,
                source_feedback_count=feedback_count,
            )

    global_feedback = feedback_by_section.get(None, [])
    if global_feedback:
        existing_global = merge_guidelines(
            get_baseline_guidelines(GLOBAL_GUIDELINE_SECTION),
            store.get_global_guidelines(),
        )
        user_prompt = build_distillation_user_prompt(
            GLOBAL_GUIDELINE_SECTION,
            existing_global,
            global_feedback,
            list(diff_by_section.values()),
        )
        updated_global = generate_text(DISTILL_GUIDELINES_SYSTEM, user_prompt).strip()
        if updated_global:
            store.upsert_guidelines(
                GLOBAL_GUIDELINE_SECTION,
                updated_global,
                source_feedback_count=feedback_count,
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
