import { useId, useState } from "react";
import type { PatentSectionId } from "../types/patent";

interface AttorneyFeedbackPanelProps {
  sectionId: PatentSectionId | string;
  sectionLabel: string;
  panelTitle?: string;
  panelDescription?: string;
  showApprove?: boolean;
  value: string;
  onChange: (value: string) => void;
  approved?: boolean;
  onApprove?: (approved: boolean) => void;
  disabled?: boolean;
}

export function AttorneyFeedbackPanel({
  sectionId,
  sectionLabel,
  panelTitle = "Patent professional feedback",
  panelDescription,
  showApprove = true,
  value,
  onChange,
  approved = false,
  onApprove,
  disabled = false,
}: AttorneyFeedbackPanelProps) {
  const textareaId = useId();
  const [expanded, setExpanded] = useState(Boolean(value.trim()));

  return (
    <section className="rounded-lg border border-outline-variant bg-surface-container-low/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
        aria-expanded={expanded}
        aria-controls={`${textareaId}-panel`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="material-symbols-outlined text-secondary text-[22px] shrink-0 mt-0.5">
            rate_review
          </span>
          <div className="min-w-0">
            <h2 className="font-label-md text-label-md text-on-surface">
              {panelTitle}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              {panelDescription ??
                `Notes for ${sectionLabel.toLowerCase()} — submitted at export to improve future drafts org-wide.`}
            </p>
          </div>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div id={`${textareaId}-panel`} className="px-4 pb-4 border-t border-outline-variant/60">
          <label htmlFor={textareaId} className="sr-only">
            {panelTitle} for {sectionLabel}
          </label>
          <textarea
            id={textareaId}
            rows={3}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={
              showApprove
                ? `e.g. Claims should use "comprising" not "including"; tighten background prior-art contrast for ${sectionId}…`
                : `Notes for revising ${sectionLabel.toLowerCase()}…`
            }
            className="mt-3 w-full bg-surface-container-lowest border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px] disabled:opacity-60"
          />
          {showApprove && onApprove && (
            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={approved}
                disabled={disabled}
                onChange={(event) => onApprove(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-outline-variant text-secondary focus:ring-secondary/40 disabled:opacity-60"
              />
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Mark this section as a high-quality example for future drafts.
              </span>
            </label>
          )}
        </div>
      )}
    </section>
  );
}
