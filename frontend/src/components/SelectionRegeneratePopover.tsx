import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

export interface SelectionRegeneratePopoverProps {
  anchorRect: DOMRect | null;
  loading: boolean;
  onConfirm: (instruction: string) => void;
  onDismiss: () => void;
}

export function SelectionRegeneratePopover({
  anchorRect,
  loading,
  onConfirm,
  onDismiss,
}: SelectionRegeneratePopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cardHeightRef = useRef(88);
  const inputRef = useRef<HTMLInputElement>(null);
  const [instruction, setInstruction] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    // Skip the aria-hidden placeholder so its ~24px height never overwrites the ref.
    if (!card || card.getAttribute("aria-hidden") !== null) return;
    cardHeightRef.current = card.offsetHeight;
  });

  useEffect(() => {
    if (!anchorRect) {
      setInstruction("");
      setPosition(null);
      return;
    }

    const card = cardRef.current;
    const cardHeight = cardHeightRef.current;
    const cardWidth = card?.offsetWidth ?? 280;
    const margin = 8;

    let top = anchorRect.top - cardHeight - margin;
    if (top < margin) {
      top = anchorRect.bottom + margin;
    }

    let left = anchorRect.left + anchorRect.width / 2 - cardWidth / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - cardWidth - margin));

    setPosition({ top, left });
    inputRef.current?.focus();
  }, [anchorRect]);

  useEffect(() => {
    if (!anchorRect) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (cardRef.current?.contains(target)) return;
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
  }, [anchorRect, onDismiss]);

  if (!anchorRect || !position) {
    return (
      <div
        ref={cardRef}
        aria-hidden
        className="fixed opacity-0 pointer-events-none -z-50 w-[360px] p-3 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg"
      />
    );
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !loading) {
      event.preventDefault();
      onConfirm(instruction);
    }
  };

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Rewrite selection"
      className="fixed z-[100] w-[360px] p-3 rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg flex flex-col gap-2"
      style={{ top: position.top, left: position.left }}
    >
      <input
        ref={inputRef}
        type="text"
        value={instruction}
        disabled={loading}
        placeholder="Add instruction (optional)"
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={handleInputKeyDown}
        className="w-full px-3 py-1.5 rounded-md border border-outline-variant bg-white text-on-surface font-body-sm text-body-sm focus:ring-2 focus:ring-secondary focus:border-secondary outline-none disabled:opacity-60"
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => onConfirm(instruction)}
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95 disabled:opacity-60"
      >
        {loading ? (
          <span className="material-symbols-outlined text-[18px] loading-spin">progress_activity</span>
        ) : (
          <span aria-hidden>✦</span>
        )}
        {loading ? "Rewriting…" : "Rewrite"}
      </button>
    </div>
  );
}
