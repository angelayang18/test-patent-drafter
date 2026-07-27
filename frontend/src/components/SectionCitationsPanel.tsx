import { useState } from "react";
import type { SectionCitation } from "../types/patent";

interface SectionCitationsPanelProps {
  citations: SectionCitation[];
}

export function SectionCitationsPanel({ citations }: SectionCitationsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!citations.length) {
    return null;
  }

  return (
    <section className="mt-4 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm bento-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-3 w-full text-left"
        aria-expanded={expanded}
      >
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <span className="material-symbols-outlined text-primary">format_quote</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-headline-md text-headline-md text-primary">Source citations</h3>
          {!expanded && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              ▸ {citations.length} source{citations.length === 1 ? "" : "s"} used for this section
            </p>
          )}
          {expanded && (
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Excerpts retrieved from your source material for this section.
            </p>
          )}
        </div>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0 mt-1">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <ul className="mt-6 space-y-4">
          {citations.map((citation) => (
            <li
              key={`${citation.label}:${citation.excerpt.slice(0, 40)}`}
              className="font-body-sm text-body-sm text-on-surface"
            >
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                {citation.label}
              </span>
              {" — "}
              {citation.excerpt}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
