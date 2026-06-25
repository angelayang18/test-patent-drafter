"""Tests for selection-level regeneration."""

from unittest.mock import patch

from drafter.selection_regenerate import regenerate_selection


@patch("drafter.selection_regenerate.generate_text")
def test_regenerate_selection_calls_llm_with_context(mock_generate_text):
    mock_generate_text.return_value = "a refined mechanism comprising parallel stages."

    result = regenerate_selection(
        combined_text="Source notes about the invention.",
        full_field_text="The system includes a router. The mechanism uses parallel stages.",
        selected_text="The mechanism uses parallel stages.",
        instruction="make it more concise",
    )

    assert result == "a refined mechanism comprising parallel stages."
    mock_generate_text.assert_called_once()
    system_instruction, user_prompt = mock_generate_text.call_args[0]
    assert "patent" in system_instruction.lower()
    assert "The mechanism uses parallel stages." in user_prompt
    assert "Source notes about the invention." in user_prompt
    assert "make it more concise" in user_prompt
    assert "Return only the replacement text" in user_prompt
