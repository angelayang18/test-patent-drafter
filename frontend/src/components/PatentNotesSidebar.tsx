import { useCallback, useRef, useState } from "react";
import { AttorneyFeedbackSummaryPanel } from "./AttorneyFeedbackSummaryPanel";
import { NotesSidebarCoachmark } from "./NotesSidebarCoachmark";
import type { PatentSectionId } from "../types/patent";
import { hasSeenNotesSidebarHint, markNotesSidebarHintSeen } from "../utils/uiHints";

interface PatentNotesSidebarProps {
  attorneyFeedback: Record<PatentSectionId, string>;
  sectionLabels: Record<PatentSectionId, string>;
}

export function PatentNotesSidebar({
  attorneyFeedback,
  sectionLabels,
}: PatentNotesSidebarProps) {
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(() => !hasSeenNotesSidebarHint());

  const dismissHint = useCallback(() => {
    markNotesSidebarHintSeen();
    setShowHint(false);
  }, []);

  const handleToggle = () => {
    setOpen((wasOpen) => {
      if (!wasOpen && showHint) {
        dismissHint();
      }
      return !wasOpen;
    });
  };

  return (
    <div
      className={`shrink-0 flex h-full overflow-hidden border-l border-outline-variant bg-surface-container-lowest transition-[width] duration-300 ease-in-out ${
        open ? "w-[316px]" : "w-9"
      }`}
    >
      <button
        ref={toggleRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label={open ? "Collapse notes panel" : "Expand notes panel"}
        className={`flex w-9 shrink-0 items-center justify-center text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors ${
          showHint ? "notes-tab-pulse" : ""
        }`}
      >
        <span
          className="font-label-sm text-label-sm tracking-widest uppercase whitespace-nowrap"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Notes
        </span>
      </button>

      <aside
        aria-hidden={!open}
        className="flex w-[280px] shrink-0 flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0">
          <h3 className="font-label-md text-label-md text-on-surface">Notes</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close notes panel"
            className="flex size-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar min-h-0">
          <AttorneyFeedbackSummaryPanel
            attorneyFeedback={attorneyFeedback}
            sectionLabels={sectionLabels}
          />
        </div>
      </aside>

      {showHint && (
        <NotesSidebarCoachmark anchorRef={toggleRef} onDismiss={dismissHint} />
      )}
    </div>
  );
}
