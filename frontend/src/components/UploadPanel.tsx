import { useCallback, useEffect, useId, useRef, useState } from "react";
import { UploadProgressPanel } from "./UploadProgressPanel";
import { SourceFilePreviewModal } from "./SourceFilePreviewModal";
import type { InputSources, UploadedSourceFile } from "../context/grantContext";
import { useGrantFileUpload } from "../hooks/useGrantFileUpload";
import { fileIcon, formatFileSize } from "../utils/format";
import type { UploadQueueItem } from "../types/upload";

function getWebsiteUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    new URL(trimmed);
    return null;
  } catch {
    return "Enter a valid URL (e.g. https://example.com/product-page).";
  }
}

export interface UploadPanelProps {
  inputSources: InputSources;
  onInputSourcesChange: (patch: Partial<InputSources>) => void;
  uploadedFiles: UploadedSourceFile[];
  onRemoveFile: (id: string) => void;
  /** When provided, uses external upload state instead of the built-in grant hook. */
  processFiles?: (fileList: FileList | File[]) => Promise<void>;
  uploadQueue?: UploadQueueItem[];
  uploading?: boolean;
  confluenceError?: string | null;
  onClearConfluenceError?: () => void;
  confluenceLoading?: boolean;
}

export default function UploadPanel({
  inputSources,
  onInputSourcesChange,
  uploadedFiles,
  onRemoveFile,
  processFiles: externalProcessFiles,
  uploadQueue: externalUploadQueue,
  uploading: externalUploading,
  confluenceError = null,
  onClearConfluenceError,
  confluenceLoading = false,
}: UploadPanelProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [showToken, setShowToken] = useState(false);
  const [previewFile, setPreviewFile] = useState<UploadedSourceFile | null>(null);

  const internalUpload = useGrantFileUpload();
  const processFiles = externalProcessFiles ?? internalUpload.processFiles;
  const uploadQueue = externalUploadQueue ?? internalUpload.uploadQueue;
  const uploading = externalUploading ?? internalUpload.uploading;

  const websiteUrlError = getWebsiteUrlError(inputSources.websiteUrl);
  const confluenceConfigured = Boolean(
    inputSources.confluenceUrl.trim() &&
      inputSources.confluenceSpaceKey.trim() &&
      inputSources.confluenceToken.trim(),
  );

  const clearConfluenceError = useCallback(() => {
    onClearConfluenceError?.();
  }, [onClearConfluenceError]);

  useEffect(() => {
    const dropzone = dropzoneRef.current;
    if (!dropzone) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.add("border-secondary", "bg-secondary/10");
    };
    const onDragLeave = () => {
      dropzone.classList.remove("border-secondary", "bg-secondary/10");
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.remove("border-secondary", "bg-secondary/10");
      if (e.dataTransfer?.files?.length) {
        void processFiles(e.dataTransfer.files);
      }
    };

    dropzone.addEventListener("dragover", onDragOver);
    dropzone.addEventListener("dragleave", onDragLeave);
    dropzone.addEventListener("drop", onDrop);
    return () => {
      dropzone.removeEventListener("dragover", onDragOver);
      dropzone.removeEventListener("dragleave", onDragLeave);
      dropzone.removeEventListener("drop", onDrop);
    };
  }, [processFiles]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void processFiles(e.target.files);
      e.target.value = "";
    }
  };

  return (
    <>
      <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card">
        <div className="flex items-start gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <span className="material-symbols-outlined text-primary">tune</span>
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md text-primary">Relevance guidance</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Optional — tell the AI what to prioritize or ignore across all sources below.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter">
          <div>
            <label
              htmlFor={`${fileInputId}-relevant`}
              className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
            >
              Relevant content
            </label>
            <textarea
              id={`${fileInputId}-relevant`}
              className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px]"
              placeholder="e.g. Project goals, budget notes, team bios…"
              rows={3}
              value={inputSources.relevantContentNotes}
              onChange={(e) => onInputSourcesChange({ relevantContentNotes: e.target.value })}
            />
          </div>
          <div>
            <label
              htmlFor={`${fileInputId}-irrelevant`}
              className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
            >
              Irrelevant content
            </label>
            <textarea
              id={`${fileInputId}-irrelevant`}
              className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px]"
              placeholder="e.g. Marketing pages, unrelated HR content…"
              rows={3}
              value={inputSources.irrelevantContentNotes}
              onChange={(e) => onInputSourcesChange({ irrelevantContentNotes: e.target.value })}
            />
          </div>
        </div>
      </section>

      <div>
        <h2 className="font-headline-md text-headline-md text-primary">Add source material</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          Upload documents or paste a description — use either or both.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mt-6 items-start">
          <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card h-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <span className="material-symbols-outlined text-primary">cloud_upload</span>
              </div>
              <h3 className="font-title-lg text-title-lg">Upload documents</h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              PDF, DOCX, or PPTX — text is extracted automatically for AI analysis.
            </p>
            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.pptx"
              multiple
              onChange={handleFileInputChange}
            />
            <div
              ref={dropzoneRef}
              role="button"
              tabIndex={uploading ? -1 : 0}
              aria-disabled={uploading}
              onClick={() => !uploading && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (uploading) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed border-outline-variant rounded-xl p-8 lg:p-10 flex flex-col items-center justify-center bg-surface-container-low transition-all group ${
                uploading
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-primary/5 hover:border-primary cursor-pointer"
              }`}
            >
              <span
                className={`material-symbols-outlined text-primary text-5xl mb-4 transition-transform ${
                  uploading ? "loading-spin" : "group-hover:scale-110"
                }`}
              >
                {uploading ? "progress_activity" : "cloud_upload"}
              </span>
              <p className="font-title-lg text-title-lg text-on-surface mb-2">
                {uploading ? "Parsing your documents…" : "Drag files here or click to browse"}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Accepted formats: PDF, .docx, .pptx
              </p>
            </div>
            <UploadProgressPanel items={uploadQueue} />
            <div className="mt-8">
              <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider mb-4">
                Uploaded Files
              </h3>
              {uploadedFiles.length === 0 ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  No files uploaded yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-4 bg-surface rounded-lg border border-outline-variant"
                    >
                      <span className="material-symbols-outlined text-primary shrink-0">
                        {fileIcon(file.filename)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="font-body-md text-body-md font-medium block truncate">
                          {file.filename}
                        </span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {formatFileSize(file.sizeBytes)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Preview ${file.filename}`}
                        onClick={() => setPreviewFile(file)}
                        className="flex size-9 items-center justify-center text-on-surface-variant hover:text-primary rounded-full"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${file.filename}`}
                        onClick={() => onRemoveFile(file.id)}
                        className="flex size-9 items-center justify-center text-error hover:bg-error-container rounded-full"
                      >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card h-full flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-secondary/10 rounded-lg">
                <span className="material-symbols-outlined text-secondary">content_paste</span>
              </div>
              <h3 className="font-title-lg text-title-lg">Paste text</h3>
            </div>
            <textarea
              className="w-full flex-1 min-h-[200px] bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y"
              placeholder="Paste project description, RFP text, or notes here…"
              rows={8}
              value={inputSources.pastedText}
              onChange={(e) => onInputSourcesChange({ pastedText: e.target.value })}
            />
          </section>
        </div>
      </div>

      <div>
        <h2 className="font-headline-md text-headline-md text-primary">Connect external sources</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mt-6 items-start">
          <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-secondary/10 rounded-lg">
                <span className="material-symbols-outlined text-secondary">extension</span>
              </div>
              <h3 className="font-title-lg text-title-lg">Confluence</h3>
            </div>
            <div className="space-y-4">
              <input
                className={`w-full bg-white border rounded-lg p-3 font-body-sm text-body-sm ${
                  confluenceError ? "border-error/50" : "border-outline-variant"
                }`}
                placeholder="https://company.atlassian.net/wiki/..."
                value={inputSources.confluenceUrl}
                onChange={(e) => {
                  clearConfluenceError();
                  onInputSourcesChange({ confluenceUrl: e.target.value });
                }}
              />
              <input
                className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-sm text-body-sm"
                placeholder="Space key (e.g. ENG)"
                value={inputSources.confluenceSpaceKey}
                onChange={(e) => {
                  clearConfluenceError();
                  onInputSourcesChange({ confluenceSpaceKey: e.target.value });
                }}
              />
              <div className="relative">
                <input
                  className="w-full bg-white border border-outline-variant rounded-lg p-3 pr-12 font-body-sm text-body-sm"
                  placeholder="API token"
                  type={showToken ? "text" : "password"}
                  value={inputSources.confluenceToken}
                  onChange={(e) => {
                    clearConfluenceError();
                    onInputSourcesChange({ confluenceToken: e.target.value });
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    {showToken ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
              {confluenceLoading && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">Connecting to Confluence…</p>
              )}
              {confluenceError && (
                <p className="font-body-sm text-body-sm text-error">{confluenceError}</p>
              )}
              {!confluenceLoading && !confluenceError && confluenceConfigured && (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Confluence content is fetched when you continue to Review.
                </p>
              )}
            </div>
          </section>

          <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-secondary/10 rounded-lg">
                <span className="material-symbols-outlined text-secondary">public</span>
              </div>
              <h3 className="font-title-lg text-title-lg">Website URL</h3>
            </div>
            <input
              className={`w-full bg-white border rounded-lg p-3 font-body-sm text-body-sm ${
                websiteUrlError ? "border-error/50" : "border-outline-variant"
              }`}
              placeholder="https://example.com/product-page"
              type="url"
              value={inputSources.websiteUrl}
              onChange={(e) => onInputSourcesChange({ websiteUrl: e.target.value })}
            />
            {websiteUrlError && (
              <p className="mt-2 font-body-sm text-body-sm text-error">{websiteUrlError}</p>
            )}
          </section>
        </div>
      </div>

      <SourceFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </>
  );
}

export { getWebsiteUrlError };
