import { useCallback, useState } from "react";

export function useUndoRedo<T>(initial: T, maxHistory = 40) {
  const [history, setHistory] = useState<T[]>([initial]);
  const [index, setIndex] = useState(0);

  const value = history[index] ?? initial;

  const push = useCallback(
    (next: T) => {
      setHistory((prev) => {
        const truncated = prev.slice(0, index + 1);
        const updated = [...truncated, next];
        const final =
          updated.length > maxHistory
            ? updated.slice(updated.length - maxHistory)
            : updated;
        setIndex(final.length - 1);
        return final;
      });
    },
    [index, maxHistory],
  );

  const replace = useCallback((next: T) => {
    setHistory((prev) => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  }, [index]);

  const undo = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setIndex((i) => Math.min(history.length - 1, i + 1));
  }, [history.length]);

  const reset = useCallback((next: T) => {
    setHistory([next]);
    setIndex(0);
  }, []);

  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  return { value, push, replace, undo, redo, reset, canUndo, canRedo };
}
