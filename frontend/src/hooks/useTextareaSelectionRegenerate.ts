import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";
import { readTextareaSelection, type TextareaSelectionRange } from "../utils/textareaSelection";

export function useTextareaSelectionRegenerate(disabled = false) {
  const [selection, setSelection] = useState<TextareaSelectionRange | null>(null);
  const [loading, setLoading] = useState(false);

  const dismiss = useCallback(() => {
    if (loading) return;
    setSelection(null);
  }, [loading]);

  const updateSelection = useCallback(
    (textarea: HTMLTextAreaElement) => {
      if (disabled || loading) return;
      const next = readTextareaSelection(textarea);
      setSelection(next);
    },
    [disabled, loading],
  );

  const handleMouseUp = useCallback(
    (event: MouseEvent<HTMLTextAreaElement>) => {
      updateSelection(event.currentTarget);
    },
    [updateSelection],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      updateSelection(event.currentTarget);
    },
    [dismiss, updateSelection],
  );

  return {
    selection,
    setSelection,
    loading,
    setLoading,
    dismiss,
    handleMouseUp,
    handleKeyUp,
  };
}
