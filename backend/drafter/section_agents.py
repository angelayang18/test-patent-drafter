"""Per-section patent drafting agents with isolated prompts and parallel execution."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable

from exporter.text_format import sanitize_section_output

from .llm_client import generate_text
from .patent_template import (
    PROVISIONAL_FILING_OVERVIEW,
    get_section_template_instructions,
)
from .prompts import PATENT_SECTIONS, get_prompt

_SECTION_LABELS = {
    "field": "Field of the Invention",
    "background": "Background of the Invention",
    "summary": "Summary of the Invention",
    "description": "Detailed Description of Embodiments",
    "claims": "Informal Patent Claims",
    "abstract": "Abstract",
}

_AGENT_CONVENTIONS = (
    "Use formal US provisional patent language: 'comprising', 'wherein', 'configured to', "
    "'in one embodiment', 'in another embodiment'. "
    "Be highly specific for AI/ML inventions (transformers, embeddings, RAG, tokenization, etc.). "
    "Avoid vague business language. "
    "Do not use internal document delimiter markers (%%qa, %%Header 1%%, etc.) or "
    "template placeholders in braces ({item_1_desc}); write complete patent prose. "
    "Output ONLY the body text for your assigned section — no headings, meta-commentary, or other sections."
)


def get_section_agent_system(section: str) -> str:
    """System prompt for a single-section agent (no other section text in context)."""
    label = _SECTION_LABELS.get(section, section)
    template_slot = get_section_template_instructions(section)
    return (
        f"You are a dedicated patent drafting agent assigned ONLY to draft the "
        f'"{label}" section of a US provisional patent application.\n\n'
        f"{PROVISIONAL_FILING_OVERVIEW}\n\n"
        f"{template_slot}\n\n"
        f"{_AGENT_CONVENTIONS}\n\n"
        "CRITICAL: You are not drafting any other section. Do not reference or invent "
        "content from Field, Background, Summary, Detailed Description, Claims, or Abstract "
        "unless it appears in the invention details provided in the user message."
    )


def draft_section_agent(invention: dict, section_name: str) -> str:
    """Draft one section via its isolated agent (single LLM call)."""
    section = section_name.strip()
    if section not in PATENT_SECTIONS:
        raise ValueError(
            f"Unknown section '{section}'. Must be one of: {PATENT_SECTIONS}"
        )
    system = get_section_agent_system(section)
    user_prompt = get_prompt(section, invention)
    return sanitize_section_output(section, generate_text(system, user_prompt))


def draft_all_sections_parallel(
    invention: dict,
    section_names: Iterable[str] | None = None,
) -> dict[str, str]:
    """
    Run one agent per section concurrently.

    Each agent receives only invention details and its template slot — never other
    sections' drafted text — preventing context poisoning across sections.
    """
    names = list(section_names) if section_names is not None else list(PATENT_SECTIONS)
    invalid = [n for n in names if n not in PATENT_SECTIONS]
    if invalid:
        raise ValueError(
            f"Unknown section(s): {invalid}. Must be subset of: {PATENT_SECTIONS}"
        )
    if not names:
        return {}

    results: dict[str, str] = {}
    max_workers = min(len(names), 6)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(draft_section_agent, invention, name): name
            for name in names
        }
        for future in as_completed(futures):
            section = futures[future]
            results[section] = future.result()
    return results
