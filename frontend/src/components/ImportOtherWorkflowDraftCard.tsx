import { useId, useState } from "react";
import type { OtherWorkflowDraftSummary } from "../utils/draftStorage";
import {
  injectImportedDraftBlock,
  pastedTextHasImportedDraft,
  stripImportedDraftBlock,
} from "../utils/draftStorage";

interface ImportOtherWorkflowDraftCardProps {
  summary: OtherWorkflowDraftSummary;
  pastedText: string;
  onPastedTextChange: (value: string) => void;
  onDismiss: () => void;
}

/**
 * Dismissible card that lets users seed the current Input page with a completed
 * draft from the opposite workflow (grant ↔ patent) via pastedText.
 */
export function ImportOtherWorkflowDraftCard({
  summary,
  pastedText,
  onPastedTextChange,
  onDismiss,
}: ImportOtherWorkflowDraftCardProps) {
  const checkboxId = useId();
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const included = pastedTextHasImportedDraft(pastedText, summary.sourceMode);

  const sourceNoun = summary.sourceMode === "grant" ? "Grant" : "Patent";
  const descriptionNoun =
    summary.sourceMode === "grant" ? "grant application" : "patent draft";

  const handleToggle = (checked: boolean) => {
    if (checked) {
      onPastedTextChange(
        injectImportedDraftBlock(
          pastedText,
          summary.sourceMode,
          summary.serializedText,
        ),
      );
      return;
    }
    onPastedTextChange(stripImportedDraftBlock(pastedText, summary.sourceMode));
  };

  const handleDismiss = () => {
    if (included) {
      onPastedTextChange(stripImportedDraftBlock(pastedText, summary.sourceMode));
    }
    onDismiss();
  };

  return (
    <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card relative">
      <button
        type="button"
        aria-label="Dismiss import card"
        onClick={handleDismiss}
        className="absolute top-4 right-4 flex size-9 items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>

      <div className="flex items-center gap-3 mb-2 pr-10">
        <div className="p-2 bg-secondary/10 rounded-lg">
          <span className="material-symbols-outlined text-secondary">input</span>
        </div>
        <h3 className="font-title-lg text-title-lg">
          Import from existing {sourceNoun} draft
        </h3>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant mb-1">
        Use your existing {descriptionNoun} as a starting point
      </p>
      <p className="font-label-md text-label-md text-on-surface mb-6">
        {summary.displayLabel}
      </p>

      <label
        htmlFor={checkboxId}
        className="flex items-start gap-3 cursor-pointer select-none mb-4"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={included}
          onChange={(e) => handleToggle(e.target.checked)}
          className="mt-1 size-4 rounded border-outline-variant text-secondary focus:ring-secondary/30"
        />
        <span className="font-body-md text-body-md text-on-surface">
          Include as source
        </span>
      </label>

      <div>
        <button
          type="button"
          onClick={() => setSectionsOpen((open) => !open)}
          className="flex items-center gap-1 font-label-md text-label-md text-secondary hover:text-secondary/80 transition-colors"
          aria-expanded={sectionsOpen}
        >
          <span className="material-symbols-outlined text-[18px]">
            {sectionsOpen ? "expand_less" : "expand_more"}
          </span>
          View sections
        </button>

        {sectionsOpen && (
          <ul className="mt-3 space-y-3 border border-outline-variant rounded-lg bg-surface-container-low p-4">
            {summary.sections.map((section) => (
              <li key={section.id}>
                <p className="font-label-md text-label-md text-on-surface">
                  {section.label}
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 line-clamp-2">
                  {section.preview}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
