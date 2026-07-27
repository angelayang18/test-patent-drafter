"""Draft patent sections via isolated per-section agents."""

from __future__ import annotations

from .prompts import PATENT_SECTIONS
from .section_agents import draft_all_sections_parallel, draft_section_agent

__all__ = [
    "PATENT_SECTIONS",
    "draft_section",
    "draft_sections",
    "draft_all_sections_parallel",
]


def draft_sections(
    invention: dict,
    *,
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[dict[str, str], dict[str, list[dict]]]:
    """Draft all patent sections in parallel (one agent per section)."""
    return draft_all_sections_parallel(
        invention,
        combined_text=combined_text,
        custom_sections=custom_sections,
    )


def draft_section(
    invention: dict,
    section_name: str,
    *,
    prior_draft: str = "",
    attorney_feedback: str = "",
    combined_text: str = "",
    custom_sections: dict[str, dict[str, str]] | None = None,
) -> tuple[str, list[dict]]:
    """Draft a single patent section with its dedicated agent."""
    return draft_section_agent(
        invention,
        section_name,
        prior_draft=prior_draft,
        attorney_feedback=attorney_feedback,
        combined_text=combined_text,
        custom_sections=custom_sections,
    )
