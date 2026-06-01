"""Format user-provided relevance guidance for extraction prompts."""

from __future__ import annotations


def format_relevance_guidance(relevant_notes: str = "", irrelevant_notes: str = "") -> str:
    """
    Build a guidance block for the extraction LLM.

    Returns an empty string when both inputs are blank.
    """
    relevant = relevant_notes.strip()
    irrelevant = irrelevant_notes.strip()
    if not relevant and not irrelevant:
        return ""

    lines = ["User relevance guidance (apply when reading the technical documentation below):"]
    if relevant:
        lines.append(f"Relevant — prioritize and extract from: {relevant}")
    if irrelevant:
        lines.append(f"Irrelevant — ignore or de-emphasize: {irrelevant}")
    return "\n".join(lines)


def extraction_system_prompt(base_system: str, relevant_notes: str = "", irrelevant_notes: str = "") -> str:
    """Augment the extraction system prompt when the user supplied relevance guidance."""
    if not format_relevance_guidance(relevant_notes, irrelevant_notes):
        return base_system
    return (
        f"{base_system} "
        "The user supplied explicit guidance on what source material is relevant vs irrelevant; "
        "follow that guidance strictly when deciding what to extract."
    )
