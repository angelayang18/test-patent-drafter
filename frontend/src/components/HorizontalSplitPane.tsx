import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

const MD_BREAKPOINT_PX = 768;

interface HorizontalSplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  /** Initial left panel width as a percentage (0–100). */
  defaultLeftPercent?: number;
  minLeftPercent?: number;
  maxLeftPercent?: number;
  storageKey?: string;
}

function readStoredPercent(key: string | undefined, fallback: number): number {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function useMinMd() {
  const [minMd, setMinMd] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(min-width: ${MD_BREAKPOINT_PX}px)`).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${MD_BREAKPOINT_PX}px)`);
    const onChange = () => setMinMd(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return minMd;
}

export function HorizontalSplitPane({
  left,
  right,
  defaultLeftPercent = 40,
  minLeftPercent = 22,
  maxLeftPercent = 78,
  storageKey,
}: HorizontalSplitPaneProps) {
  const [leftPercent, setLeftPercent] = useState(() =>
    readStoredPercent(storageKey, defaultLeftPercent),
  );
  const minMd = useMinMd();
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const clampPercent = useCallback(
    (value: number) => Math.min(maxLeftPercent, Math.max(minLeftPercent, value)),
    [maxLeftPercent, minLeftPercent],
  );

  const persistPercent = useCallback(
    (next: number) => {
      const clamped = clampPercent(next);
      setLeftPercent(clamped);
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, String(clamped));
        } catch {
          // ignore quota errors
        }
      }
      return clamped;
    },
    [clampPercent, storageKey],
  );

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;
      const { left: x, width } = container.getBoundingClientRect();
      if (width <= 0) return;
      persistPercent(((clientX - x) / width) * 100);
    },
    [persistPercent],
  );

  const onDividerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!minMd) return;
    event.preventDefault();
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onDividerPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updateFromPointer(event.clientX);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-grow min-h-0 overflow-hidden flex-col md:flex-row"
    >
      <div
        className="flex flex-col overflow-hidden min-h-0 w-full md:shrink-0 md:min-w-0 bg-surface"
        style={minMd ? { width: `${leftPercent}%` } : undefined}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={Math.round(leftPercent)}
        aria-valuemin={minLeftPercent}
        aria-valuemax={maxLeftPercent}
        aria-label="Resize panels"
        tabIndex={0}
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={(event) => {
          if (!minMd) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            persistPercent(leftPercent - 2);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            persistPercent(leftPercent + 2);
          }
        }}
        className="hidden md:flex w-1.5 shrink-0 cursor-col-resize touch-none items-center justify-center bg-outline-variant/60 hover:bg-secondary/30 active:bg-secondary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"
      >
        <span className="sr-only">Drag to resize panels</span>
      </div>

      <div className="flex flex-col overflow-hidden min-h-0 flex-1 min-w-0 bg-surface-container-lowest">
        {right}
      </div>
    </div>
  );
}
