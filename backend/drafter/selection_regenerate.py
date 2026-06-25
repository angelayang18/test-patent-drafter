"""Regenerate a selected portion of patent field or section text."""

from __future__ import annotations

from drafter.llm_client import generate_text

_SYSTEM_INSTRUCTION = (
    "You rewrite portions of US provisional patent application text. "
    "Return only the replacement text for the selected portion—no quotes, "
    "labels, markdown fences, or explanation."
)


def regenerate_selection(
    combined_text: str,
    full_field_text: str,
    selected_text: str,
    instruction: str = "",
) -> str:
    """
    Rewrite a selected substring within a patent field or draft section.

    Args:
        combined_text: Original source material for factual grounding.
        full_field_text: Complete current text of the field or section.
        selected_text: The substring the user wants rewritten.
        instruction: Optional user guidance (e.g. "make it more concise").

    Returns:
        Replacement text for the selected portion only.
    """
    user_prompt = (
        "You are rewriting a specific portion of a patent field.\n\n"
        f"The full field text is:\n{full_field_text}\n\n"
        f"Rewrite only this selected portion:\n{selected_text}\n\n"
        f"Source material:\n{combined_text}\n\n"
    )
    if instruction.strip():
        user_prompt += f"Additional instruction: {instruction.strip()}\n\n"
    user_prompt += (
        "Return only the replacement text for the selected portion, nothing else. "
        "Use formal patent drafting language and keep terminology consistent "
        "with the surrounding text."
    )
    return generate_text(_SYSTEM_INSTRUCTION, user_prompt)
