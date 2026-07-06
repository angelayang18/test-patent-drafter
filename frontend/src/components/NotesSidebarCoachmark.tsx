import { useEffect, useId, useRef, useState, type RefObject } from "react";

interface NotesSidebarCoachmarkProps {
  anchorRef: RefObject<HTMLElement>;
  onDismiss: () => void;
}

function computePosition(
  anchor: DOMRect,
  cardWidth: number,
  cardHeight: number,
): { top: number; left: number } {
  const margin = 12;
  const top = Math.max(
    margin,
    Math.min(
      anchor.top + anchor.height / 2 - cardHeight / 2,
      window.innerHeight - cardHeight - margin,
    ),
  );
  const left = Math.max(
    margin,
    Math.min(anchor.left - cardWidth - margin, window.innerWidth - cardWidth - margin),
  );
  return { top, left };
}

export function NotesSidebarCoachmark({ anchorRef, onDismiss }: NotesSidebarCoachmarkProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      const card = cardRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const cardWidth = card?.offsetWidth ?? 280;
      const cardHeight = card?.offsetHeight ?? 120;
      setPosition(computePosition(rect, cardWidth, cardHeight));
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [anchorRef]);

  useEffect(() => {
    buttonRef.current?.focus();
  }, [position]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onDismiss();
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onDismiss]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-labelledby={titleId}
      className={`fixed z-[100] w-[280px] p-4 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg flex flex-col gap-3 ${
        position ? "" : "opacity-0 pointer-events-none"
      }`}
      style={position ? { top: position.top, left: position.left } : undefined}
    >
      <div>
        <h4 id={titleId} className="font-label-md text-label-md text-on-surface">
          Notes panel
        </h4>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          View patent professional notes for all sections while you edit. Click the tab anytime to
          open or close.
        </p>
      </div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onDismiss}
        className="self-end px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
      >
        Got it
      </button>
    </div>
  );
}
