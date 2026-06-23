"""Prompt templates for guideline distillation and section self-critique."""

from __future__ import annotations

DISTILL_GUIDELINES_SYSTEM = (
    "You are a patent drafting quality lead. You merge attorney feedback and edit diffs "
    "into concise, actionable drafting guidelines for future AI section agents. "
    "Output ONLY the updated guidelines as plain bullet points — no preamble or commentary."
)

GLOBAL_GUIDELINE_SECTION = "_global"


def build_distillation_user_prompt(
    section: str,
    existing_guidelines: str,
    feedback_items: list[str],
    diff_summaries: list[str],
) -> str:
    """Build the user prompt for merging new learning into section guidelines."""
    section_label = "cross-section (all sections)" if section == GLOBAL_GUIDELINE_SECTION else section
    lines = [
        f"SECTION: {section_label}",
        "",
        "EXISTING GUIDELINES (preserve still-valid rules; refine or replace outdated ones):",
        existing_guidelines.strip() or "(none yet)",
        "",
    ]

    if feedback_items:
        lines.append("NEW ATTORNEY FEEDBACK:")
        for item in feedback_items:
            lines.append(f"- {item}")
        lines.append("")

    if diff_summaries:
        lines.append("EDIT DIFF SUMMARIES (AI first draft vs attorney-reviewed final):")
        for summary in diff_summaries:
            lines.append(f"- {summary}")
        lines.append("")

    lines.extend(
        [
            "TASK:",
            "Produce updated drafting guidelines for this section. Rules must be:",
            "- Actionable for an LLM drafting agent",
            "- Specific to US provisional patent style",
            "- Free of invention-specific confidential details; generalize patterns",
            "- At most 12 bullet points",
            "",
            "Output ONLY the bullet list.",
        ]
    )
    return "\n".join(lines)


def build_section_critique_user_prompt(
    section: str,
    draft_text: str,
    validation_errors: list[str],
    org_guidelines: str,
) -> str:
    """Build a critique prompt listing issues to fix in a section draft."""
    lines = [
        f"SECTION: {section}",
        "",
        "CURRENT DRAFT:",
        draft_text.strip(),
        "",
    ]
    if org_guidelines.strip():
        lines.extend(["ORG-WIDE DRAFTING GUIDELINES:", org_guidelines.strip(), ""])
    if validation_errors:
        lines.append("AUTOMATED VALIDATION ISSUES:")
        for error in validation_errors:
            lines.append(f"- {error}")
        lines.append("")
    lines.extend(
        [
            "TASK:",
            "Revise the draft to fix all validation issues and align with org guidelines.",
            "Preserve accurate technical content from the invention details.",
            "Output ONLY the revised section body — no headings, commentary, or other sections.",
        ]
    )
    return "\n".join(lines)


SECTION_CRITIQUE_SYSTEM = (
    "You are a patent section editor. Revise the provided section draft to fix listed "
    "issues while preserving valid technical content and formal US provisional patent language."
)
