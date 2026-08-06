import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_VISIBLE_MS = 2000;

export function useSavedIndicator(visibleMs = DEFAULT_VISIBLE_MS) {
  const [visible, setVisible] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const visibleMsRef = useRef(visibleMs);
  visibleMsRef.current = visibleMs;

  const flash = useCallback(() => {
    const generation = ++generationRef.current;
    setVisible(true);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      if (generation !== generationRef.current) return;
      setVisible(false);
      hideTimerRef.current = null;
    }, visibleMsRef.current);
  }, []);

  useEffect(
    () => () => {
      generationRef.current += 1;
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    },
    [],
  );

  return { visible, flash };
}

export function SavedIndicator({ visible }: { visible: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1 min-w-[4.5rem] font-label-md text-label-md text-green-600 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <span className="material-symbols-outlined text-[16px]">cloud_done</span>
      Saved
    </span>
  );
}
