import { useState, type ReactNode } from "react";
import type { CachedRemoteSources } from "../utils/gatherSourceText";
import { fileIcon, formatFileSize } from "../utils/format";
import { SourceFilePreviewModal } from "./SourceFilePreviewModal";
import { SourceTextPreviewModal } from "./SourceTextPreviewModal";

export interface ReviewSourceFile {
  id: string;
  filename: string;
  sizeBytes: number;
  content?: string;
}

export interface ReviewSourceMaterialPanelProps {
  uploadedFiles: ReviewSourceFile[];
  cachedRemoteSources: CachedRemoteSources;
  relevantContentNotes: string;
  irrelevantContentNotes: string;
  pastedText: string;
  /** Optional slot under the source list (e.g. MidWorkflowUpload). */
  footer?: ReactNode;
  /** Short description under the Source Material heading. */
  subtitle?: string;
}

/**
 * Left-pane source list for Review pages: relevance guidance, Confluence,
 * websites, pasted text, and uploaded files, with click-to-preview.
 */
export function ReviewSourceMaterialPanel({
  uploadedFiles,
  cachedRemoteSources,
  relevantContentNotes,
  irrelevantContentNotes,
  pastedText,
  footer,
  subtitle = "Files and text used to extract details.",
}: ReviewSourceMaterialPanelProps) {
  const [previewFile, setPreviewFile] = useState<ReviewSourceFile | null>(null);
  const [textPreview, setTextPreview] = useState<{
    title: string;
    subtitle?: string;
    content: string;
  } | null>(null);

  const confluenceSource = cachedRemoteSources.confluence;
  const websiteSources = cachedRemoteSources.website ?? [];
  const relevantNotes = relevantContentNotes.trim();
  const irrelevantNotes = irrelevantContentNotes.trim();
  const pasted = pastedText.trim();
  const hasRelevanceGuidance = relevantNotes.length > 0 || irrelevantNotes.length > 0;
  const hasConfluence = Boolean(confluenceSource?.content?.trim());
  const hasWebsite = websiteSources.some((entry) => entry.content.trim().length > 0);
  const hasPasted = pasted.length > 0;
  const hasUploaded = uploadedFiles.length > 0;
  const hasAnySource = hasUploaded || hasConfluence || hasWebsite || hasPasted;

  return (
    <>
      <div className="p-8 border-b border-outline-variant shrink-0">
        <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
          Source Material
        </h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{subtitle}</p>
      </div>
      <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {!hasAnySource && !hasRelevanceGuidance ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            No source material found. Add files below, or go back to Input for pasted text,
            Confluence, or a website URL.
          </p>
        ) : (
          <>
            {hasRelevanceGuidance && (
              <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <span className="material-symbols-outlined">tune</span>
                </div>
                <div className="flex-grow min-w-0">
                  <p className="font-label-md text-label-md text-on-surface">Relevance guidance</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {[relevantNotes && "relevant", irrelevantNotes && "irrelevant"]
                      .filter(Boolean)
                      .join(" & ")}{" "}
                    notes for extraction
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Preview relevance guidance"
                  onClick={() =>
                    setTextPreview({
                      title: "Relevance guidance",
                      subtitle: "Applied during AI extraction",
                      content: [
                        relevantNotes &&
                          `Relevant — prioritize and extract from:\n${relevantNotes}`,
                        irrelevantNotes &&
                          `Irrelevant — ignore or de-emphasize:\n${irrelevantNotes}`,
                      ]
                        .filter(Boolean)
                        .join("\n\n"),
                    })
                  }
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                </button>
              </div>
            )}

            {hasConfluence && confluenceSource && (
              <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-secondary/10 text-secondary shrink-0">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    extension
                  </span>
                </div>
                <div className="flex-grow min-w-0">
                  <p className="font-label-md text-label-md text-on-surface truncate">
                    Confluence · {confluenceSource.spaceKey}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    {confluenceSource.url}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Preview Confluence space ${confluenceSource.spaceKey}`}
                  onClick={() =>
                    setTextPreview({
                      title: `Confluence · ${confluenceSource.spaceKey}`,
                      subtitle: confluenceSource.url,
                      content: confluenceSource.content,
                    })
                  }
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                </button>
              </div>
            )}

            {websiteSources
              .filter((entry) => entry.content.trim().length > 0)
              .map((websiteSource) => (
                <div
                  key={websiteSource.url}
                  className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4"
                >
                  <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
                    <span className="material-symbols-outlined">language</span>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">Website</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                      {websiteSource.url}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Preview website ${websiteSource.url}`}
                    onClick={() =>
                      setTextPreview({
                        title: "Website",
                        subtitle: websiteSource.url,
                        content: websiteSource.content,
                      })
                    }
                    className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                  >
                    <span className="material-symbols-outlined text-[20px]">visibility</span>
                  </button>
                </div>
              ))}

            {hasPasted && (
              <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
                  <span className="material-symbols-outlined">content_paste</span>
                </div>
                <div className="flex-grow min-w-0">
                  <p className="font-label-md text-label-md text-on-surface truncate">Pasted text</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {pasted.length.toLocaleString()} characters
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Preview pasted text"
                  onClick={() =>
                    setTextPreview({
                      title: "Pasted text",
                      subtitle: "Text entered on the Input step",
                      content: pasted,
                    })
                  }
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                </button>
              </div>
            )}

            {uploadedFiles.map((file) => (
              <div
                key={file.id}
                className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4"
              >
                <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
                  <span className="material-symbols-outlined">{fileIcon(file.filename)}</span>
                </div>
                <div className="flex-grow min-w-0">
                  <p className="font-label-md text-label-md text-on-surface truncate">
                    {file.filename}
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {formatFileSize(file.sizeBytes)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Preview ${file.filename}`}
                  onClick={() => setPreviewFile(file)}
                  className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-[20px]">visibility</span>
                </button>
              </div>
            ))}
          </>
        )}
        {footer}
      </div>

      <SourceFilePreviewModal
        file={previewFile ? { ...previewFile, content: previewFile.content ?? "" } : null}
        onClose={() => setPreviewFile(null)}
      />
      {textPreview && (
        <SourceTextPreviewModal
          title={textPreview.title}
          subtitle={textPreview.subtitle}
          content={textPreview.content}
          onClose={() => setTextPreview(null)}
        />
      )}
    </>
  );
}
