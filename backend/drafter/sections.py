"""Draft each patent section using the configured LLM."""

from .llm_client import generate_text
from .prompts import PATENT_DRAFTER_SYSTEM, PATENT_SECTIONS, get_prompt


def draft_sections(invention: dict) -> dict[str, str]:
    """Draft all patent sections for an invention."""
    sections: dict[str, str] = {}
    for name in PATENT_SECTIONS:
        sections[name] = draft_section(invention, name)
    return sections


def draft_section(invention: dict, section_name: str) -> str:
    """Draft a single patent section."""
    prompt = get_prompt(section_name, invention)
    return generate_text(PATENT_DRAFTER_SYSTEM, prompt)
