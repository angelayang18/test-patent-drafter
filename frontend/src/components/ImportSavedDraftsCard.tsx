import { useEffect, useId, useState } from "react";
import type {
  ImportableDraftKind,
  SavedDraftImportSummary,
} from "../utils/draftStorage";
import {
  DRAFTS_CHANGED_EVENT,
  formatSavedAt,
  injectImportedDraftBlock,
  listImportableSavedDraftSummaries,
  pastedTextHasImportedDraft,
  stripImportedDraftBlock,
} from "../utils/draftStorage";

const KIND_BADGE_LABELS: Record<ImportableDraftKind, string> = {
  patent: "Patent",
  grant: "Grant",
  sow: "SOW",
  ada: "ADA",
  generic: "Custom",
};

interface ImportSavedDraftsCardProps {
  /** Active workflow's loadedFromDraftId — excluded so a draft cannot import itself. */
  excludeDraftId?: string | null;
  pastedText: string;
  onPastedTextChange: (value: string) => void;
  onDismiss: () => void;
}

function readImportableDrafts(excludeDraftId?: string | null): SavedDraftImportSummary[] {
  const drafts = listImportableSavedDraftSummaries();
  if (!excludeDraftId) {
    return drafts;
  }
  return drafts.filter((draft) => draft.id !== excludeDraftId);
}

/**
 * Dismissible multi-select card that lets users seed the current Input page
 * with one or more saved drafts via pastedText.
 */
export function ImportSavedDraftsCard({
  excludeDraftId,
  pastedText,
  onPastedTextChange,
  onDismiss,
}: ImportSavedDraftsCardProps) {
  const baseId = useId();
  const [drafts, setDrafts] = useState<SavedDraftImportSummary[]>(() =>
    readImportableDrafts(excludeDraftId),
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const refresh = () => {
      setDrafts(readImportableDrafts(excludeDraftId));
    };
    refresh();
    window.addEventListener(DRAFTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DRAFTS_CHANGED_EVENT, refresh);
  }, [excludeDraftId]);

  if (drafts.length === 0) {
    return null;
  }

  const handleToggle = (draft: SavedDraftImportSummary, checked: boolean) => {
    if (checked) {
      onPastedTextChange(
        injectImportedDraftBlock(pastedText, draft.id, draft.serializedText),
      );
      return;
    }
    onPastedTextChange(stripImportedDraftBlock(pastedText, draft.id));
  };

  const handleDismiss = () => {
    let next = pastedText;
    for (const draft of drafts) {
      if (pastedTextHasImportedDraft(next, draft.id)) {
        next = stripImportedDraftBlock(next, draft.id);
      }
    }
    if (next !== pastedText) {
      onPastedTextChange(next);
    }
    onDismiss();
  };

  const toggleSections = (draftId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(draftId)) {
        next.delete(draftId);
      } else {
        next.add(draftId);
      }
      return next;
    });
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
        <h3 className="font-title-lg text-title-lg">Import from saved drafts</h3>
      </div>

      <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
        Include one or more prior drafts as source material
      </p>

      <ul className="space-y-5">
        {drafts.map((draft) => {
          const checkboxId = `${baseId}-${draft.id}`;
          const included = pastedTextHasImportedDraft(pastedText, draft.id);
          const sectionsOpen = expandedIds.has(draft.id);
          const modeLabel = KIND_BADGE_LABELS[draft.kind];

          return (
            <li
              key={draft.id}
              className="border border-outline-variant rounded-lg bg-surface-container-low p-4"
            >
              <label
                htmlFor={checkboxId}
                className="flex items-start gap-3 cursor-pointer select-none"
              >
                <input
                  id={checkboxId}
                  type="checkbox"
                  checked={included}
                  onChange={(e) => handleToggle(draft, e.target.checked)}
                  className="mt-1 size-4 rounded border-outline-variant text-secondary focus:ring-secondary/30"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-body-md text-body-md text-on-surface">
                      {draft.title}
                    </span>
                    <span className="font-label-md text-label-md text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded">
                      {modeLabel}
                    </span>
                  </span>
                  <span className="block font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Saved {formatSavedAt(draft.savedAt)}
                  </span>
                </span>
              </label>

              <div className="mt-3 ml-7">
                <button
                  type="button"
                  onClick={() => toggleSections(draft.id)}
                  className="flex items-center gap-1 font-label-md text-label-md text-secondary hover:text-secondary/80 transition-colors"
                  aria-expanded={sectionsOpen}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {sectionsOpen ? "expand_less" : "expand_more"}
                  </span>
                  View sections
                </button>

                {sectionsOpen && (
                  <ul className="mt-3 space-y-3 border border-outline-variant rounded-lg bg-surface-container-lowest p-4">
                    {draft.sections.map((section) => (
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
