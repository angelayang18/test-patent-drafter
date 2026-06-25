import type { ReactNode } from "react";
import type { FilingInfo, PatentFigure } from "../types/patent";
import { PatentDocumentPreview } from "./PatentDocumentPreview";

interface DocumentPreviewModalProps {
  open: boolean;
  onClose: () => void;
  inventionTitle?: string;
  filingInfo?: FilingInfo | null;
  sections: Record<string, string>;
  pendingSectionIds?: string[];
  figures?: PatentFigure[];
  onSectionClick?: (sectionId: string) => void;
  footerNote?: ReactNode;
}

export function DocumentPreviewModal({
  open,
  onClose,
  inventionTitle,
  filingInfo,
  sections,
  pendingSectionIds,
  figures,
  onSectionClick,
  footerNote,
}: DocumentPreviewModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex">
      <button
        type="button"
        aria-label="Close document preview"
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
        className="w-full max-w-3xl bg-surface-container-low h-full shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-lowest shrink-0">
          <div>
            <h2 id="document-preview-title" className="font-headline-md text-headline-md text-primary">
              Document preview
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              Live preview of your provisional application as you draft
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-8 bg-[#ECECEC]">
          <PatentDocumentPreview
            inventionTitle={inventionTitle}
            filingInfo={filingInfo}
            sections={sections}
            pendingSectionIds={pendingSectionIds}
            figures={figures}
            onSectionClick={
              onSectionClick
                ? (sectionId) => {
                    onSectionClick(sectionId);
                    onClose();
                  }
                : undefined
            }
          />
          {footerNote && (
            <p className="text-center font-body-sm text-body-sm text-on-surface-variant mt-6 max-w-[720px] mx-auto">
              {footerNote}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
