import { useState } from "react";
import { AttorneyFeedbackSummaryPanel } from "./AttorneyFeedbackSummaryPanel";
import type { PatentSectionId } from "../types/patent";

interface PatentNotesSidebarProps {
  attorneyFeedback: Record<PatentSectionId, string>;
  sectionLabels: Record<PatentSectionId, string>;
}

export function PatentNotesSidebar({
  attorneyFeedback,
  sectionLabels,
}: PatentNotesSidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute inset-y-0 right-0 z-30">
      <aside
        aria-hidden={!open}
        className={`absolute inset-y-0 right-9 flex flex-col w-[280px] bg-surface-container-lowest border-l border-outline-variant shadow-lg transition-transform duration-300 ease-in-out overflow-hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
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

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Collapse notes panel" : "Expand notes panel"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center border-l border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
      >
        <span
          className="font-label-sm text-label-sm tracking-widest uppercase whitespace-nowrap"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Notes
        </span>
      </button>
    </div>
  );
}
