import { useId, useState } from "react";

interface RelevanceGuidancePanelProps {
  relevantContentNotes: string;
  irrelevantContentNotes: string;
  onRelevantChange: (value: string) => void;
  onIrrelevantChange: (value: string) => void;
}

export function RelevanceGuidancePanel({
  relevantContentNotes,
  irrelevantContentNotes,
  onRelevantChange,
  onIrrelevantChange,
}: RelevanceGuidancePanelProps) {
  const idPrefix = useId();
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-3 w-full text-left"
        aria-expanded={expanded}
      >
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <span className="material-symbols-outlined text-primary">tune</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-headline-md text-headline-md text-primary">Relevance guidance</h2>
          {!expanded && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              ▸ Optional: Add relevance guidance
            </p>
          )}
          {expanded && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Optional — tell the AI what to prioritize or ignore across all sources below.
            </p>
          )}
        </div>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0 mt-1">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mt-6">
          <div>
            <label
              htmlFor={`${idPrefix}-relevant`}
              className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
            >
              Relevant content
            </label>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
              Topics, documents, or sections to prioritize (e.g. core RAG architecture, slide 5 in
              the deck).
            </p>
            <textarea
              id={`${idPrefix}-relevant`}
              className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px]"
              placeholder="e.g. Hybrid retrieval pipeline, embedding model, agent orchestration…"
              rows={3}
              value={relevantContentNotes}
              onChange={(e) => onRelevantChange(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor={`${idPrefix}-irrelevant`}
              className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
            >
              Irrelevant content
            </label>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
              Material to ignore or de-emphasize (e.g. marketing pages, HR wiki, roadmap slides).
            </p>
            <textarea
              id={`${idPrefix}-irrelevant`}
              className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px]"
              placeholder="e.g. Company overview, pricing, team bios, %%qa%% template blocks…"
              rows={3}
              value={irrelevantContentNotes}
              onChange={(e) => onIrrelevantChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
