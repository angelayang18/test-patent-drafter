"""Format org-wide and same-draft guidance blocks for section agent prompts."""

from __future__ import annotations

from learning.storage import DraftingContext


def format_org_drafting_guidance(
    section: str,
    context: DraftingContext,
) -> str:
    """
    Build a guidance block from distilled org rules and exemplar snippets.

    Returns an empty string when no guidance is available.
    """
    parts: list[str] = []

    global_rules = context.global_guidelines.strip()
    section_rules = context.section_guidelines.strip()
    if global_rules or section_rules:
        parts.append("ORG-WIDE DRAFTING GUIDELINES (from prior attorney-reviewed applications):")
        if global_rules:
            parts.append("Cross-section rules:")
            parts.append(global_rules)
        if section_rules:
            parts.append(f"Rules for the {section} section:")
            parts.append(section_rules)

    if context.exemplars:
        parts.append("")
        parts.append(
            "EXEMPLAR SNIPPETS (style reference from prior finalized applications — "
            "do not copy invention-specific content):"
        )
        for index, exemplar in enumerate(context.exemplars, start=1):
            field_note = (
                f" (technical field: {exemplar.technical_field})"
                if exemplar.technical_field.strip()
                else ""
            )
            parts.append(f"Exemplar {index}{field_note}:")
            parts.append(exemplar.text)

    if not parts:
        return ""

    return "\n\n" + "\n".join(parts)


def format_prior_draft_context(
    prior_draft: str = "",
    attorney_feedback: str = "",
) -> str:
    """
    Build a block for same-draft regeneration using prior text and attorney notes.

    Returns an empty string when both inputs are blank.
    """
    prior = prior_draft.strip()
    feedback = attorney_feedback.strip()
    if not prior and not feedback:
        return ""

    lines = ["SAME-DRAFT REFINEMENT CONTEXT:"]
    if prior:
        lines.append(
            "Previous draft for this section (revise and improve; preserve valid content):"
        )
        lines.append(prior)
    if feedback:
        lines.append("Patent professional feedback for this section:")
        lines.append(feedback)
    lines.append(
        "Apply the feedback and org guidelines. Output an improved version of this section only."
    )
    return "\n\n" + "\n".join(lines)


def combine_guidance_blocks(*blocks: str) -> str:
    """Join non-empty guidance blocks."""
    return "".join(block for block in blocks if block.strip())
