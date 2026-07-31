import { useEffect, useState, type ReactNode } from "react";
import type { UploadedSourceFile } from "../context/PatentWorkflowContext";
import type { SectionCitation } from "../types/patent";
import { SourceFilePreviewModal } from "./SourceFilePreviewModal";

interface SectionCitationsPanelProps {
  citations: SectionCitation[];
  /** Uploaded files available for click-to-preview; labels matching a filename are clickable. */
  uploadedFiles?: UploadedSourceFile[];
}

function findUploadedFile(
  label: string,
  uploadedFiles: UploadedSourceFile[],
): UploadedSourceFile | undefined {
  return uploadedFiles.find((file) => file.filename === label);
}

export function SectionCitationsPanel({
  citations,
  uploadedFiles = [],
}: SectionCitationsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedSourceFile | null>(null);
  const [highlightText, setHighlightText] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!previewFile) {
      setHighlightText(undefined);
    }
  }, [previewFile]);

  if (!citations.length) {
    return null;
  }

  const openPreview = (file: UploadedSourceFile, excerpt: string) => {
    setHighlightText(excerpt);
    setPreviewFile(file);
  };

  return (
    <>
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
            {citations.map((citation) => {
              const matchedFile = findUploadedFile(citation.label, uploadedFiles);
              const location = citation.location?.trim() ?? "";
              const quote = citation.excerpt;

              let labelNode: ReactNode;
              if (matchedFile) {
                labelNode = (
                  <button
                    type="button"
                    className="font-label-sm text-label-sm text-primary underline underline-offset-2 hover:text-primary/80 text-left"
                    onClick={() => openPreview(matchedFile, quote)}
                  >
                    {citation.label}
                  </button>
                );
              } else {
                labelNode = (
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {citation.label}
                  </span>
                );
              }

              return (
                <li
                  key={`${citation.label}:${location}:${quote.slice(0, 40)}`}
                  className="font-body-sm text-body-sm text-on-surface"
                >
                  {labelNode}
                  {location ? (
                    <>
                      {" — "}
                      <span className="text-on-surface-variant">{location}</span>
                    </>
                  ) : null}
                  {" — "}
                  <span>&ldquo;{quote}&rdquo;</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SourceFilePreviewModal
        file={previewFile}
        highlightText={highlightText}
        onClose={() => setPreviewFile(null)}
      />
    </>
  );
}
