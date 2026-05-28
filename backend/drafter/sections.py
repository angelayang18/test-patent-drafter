"""Draft patent sections via isolated per-section agents."""

from .prompts import PATENT_SECTIONS
from .section_agents import draft_all_sections_parallel, draft_section_agent

__all__ = [
    "PATENT_SECTIONS",
    "draft_section",
    "draft_sections",
    "draft_all_sections_parallel",
]


def draft_sections(invention: dict) -> dict[str, str]:
    """Draft all patent sections in parallel (one agent per section)."""
    return draft_all_sections_parallel(invention)


def draft_section(invention: dict, section_name: str) -> str:
    """Draft a single patent section with its dedicated agent."""
    return draft_section_agent(invention, section_name)
