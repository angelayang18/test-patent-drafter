"""Tests for drafting guidance prompt formatting."""

from learning.storage import DraftingContext, ExemplarSnippet

from drafter.drafting_guidance import (
    format_org_drafting_guidance,
    format_prior_draft_context,
)


def test_format_org_drafting_guidance_empty():
    context = DraftingContext(section_guidelines="", global_guidelines="", exemplars=[])
    assert format_org_drafting_guidance("claims", context) == ""


def test_format_org_drafting_guidance_includes_rules_and_exemplars():
    context = DraftingContext(
        section_guidelines="- Use comprising, not including.",
        global_guidelines="- Keep tone formal.",
        exemplars=[
            ExemplarSnippet(
                section="claims",
                technical_field="machine learning",
                text="1. A system comprising a processor configured to…",
            )
        ],
    )
    block = format_org_drafting_guidance("claims", context)
    assert "ORG-WIDE DRAFTING GUIDELINES" in block
    assert "Use comprising" in block
    assert "Keep tone formal" in block
    assert "EXEMPLAR SNIPPETS" in block
    assert "machine learning" in block


def test_format_prior_draft_context_includes_feedback():
    block = format_prior_draft_context(
        prior_draft="Old claims text.",
        attorney_feedback="Tighten claim 1 scope.",
    )
    assert "SAME-DRAFT REFINEMENT CONTEXT" in block
    assert "Old claims text." in block
    assert "Tighten claim 1 scope." in block
    assert "Patent professional feedback for this section:" in block


def test_format_prior_draft_context_custom_feedback_label():
    block = format_prior_draft_context(
        prior_draft="Old summary.",
        attorney_feedback="Make it more concise.",
        feedback_label="Grant reviewer feedback",
    )
    assert "Grant reviewer feedback for this section:" in block
    assert "Patent professional feedback for this section:" not in block
    assert "Make it more concise." in block


def test_format_prior_draft_context_empty_when_no_inputs():
    assert format_prior_draft_context() == ""
