import { useId, useMemo, useState } from "react";

interface AttorneyFeedbackSummaryPanelProps {
  sectionIds: string[];
  feedback: Record<string, string>;
  sectionLabels: Record<string, string>;
  heading?: string;
  emptyStateText?: string;
}

export function AttorneyFeedbackSummaryPanel({
  sectionIds,
  feedback,
  sectionLabels,
  heading = "All Patent Professional Notes",
  emptyStateText = "No patent professional notes added yet. Add feedback in each section of the Draft page.",
}: AttorneyFeedbackSummaryPanelProps) {
  const panelId = useId();
  const entriesWithFeedback = useMemo(
    () =>
      sectionIds
        .map((id) => ({
          id,
          label: sectionLabels[id] ?? id,
          feedback: feedback[id]?.trim() ?? "",
        }))
        .filter((entry) => entry.feedback.length > 0),
    [sectionIds, feedback, sectionLabels],
  );
  const hasFeedback = entriesWithFeedback.length > 0;
  const [expanded, setExpanded] = useState(hasFeedback);

  return (
    <section className="rounded-lg border border-outline-variant bg-surface-container-low/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-container-low transition-colors"
        aria-expanded={expanded}
        aria-controls={`${panelId}-content`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <span className="material-symbols-outlined text-secondary text-[22px] shrink-0 mt-0.5">
            rate_review
          </span>
          <div className="min-w-0">
            <h2 className="font-label-md text-label-md text-on-surface">{heading}</h2>
          </div>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div
          id={`${panelId}-content`}
          className="px-4 pb-4 border-t border-outline-variant/60"
        >
          {!hasFeedback ? (
            <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
              {emptyStateText}
            </p>
          ) : (
            <ul className="mt-3 space-y-4">
              {entriesWithFeedback.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-outline-variant bg-surface-container-lowest p-3"
                >
                  <h3 className="font-label-sm text-label-sm text-on-surface mb-1.5">
                    {entry.label}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-wrap">
                    {entry.feedback}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
