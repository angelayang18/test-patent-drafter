import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import {
  UploadProgressPanel,
  type UploadQueueItem,
} from "../components/UploadProgressPanel";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { WorkflowNextButton } from "../components/WorkflowNavButtons";
import { SourceFilePreviewModal } from "../components/SourceFilePreviewModal";
import { usePatentWorkflow, type UploadedSourceFile } from "../context/PatentWorkflowContext";
import {
  ApiError,
  extractionNotesFromSources,
  extractInvention,
  uploadDocuments,
} from "../services/api";
import { fileIcon, formatFileSize } from "../utils/format";
import { getResumePath, workflowHasProgress } from "../utils/draftStorage";
import "../styles/patent-drafter.css";

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx"];

function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function InputPage() {
  const navigate = useNavigate();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const {
    uploadedFiles,
    inputSources,
    invention,
    addUploadedFilesAndPersist,
    removeUploadedFile,
    setInputSources,
    gatherSourceText,
    setInvention,
    getWorkflowSnapshot,
    saveToStorage,
  } = usePatentWorkflow();

  const resumePath = getResumePath(getWorkflowSnapshot());
  const hasSavedProgress = workflowHasProgress(getWorkflowSnapshot());

  const [showToken, setShowToken] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<UploadedSourceFile | null>(null);

  const uploading = uploadQueue.some(
    (item) => item.status === "pending" || item.status === "parsing",
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter(isAcceptedFile);
      if (files.length === 0) {
        setError("Please upload PDF, DOCX, or PPTX files only.");
        return;
      }
      setError(null);

      const queue: UploadQueueItem[] = files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        filename: file.name,
        sizeBytes: file.size,
        status: "pending",
      }));
      setUploadQueue(queue.map((item) => ({ ...item, status: "parsing" as const })));

      const parsed: {
        id: string;
        filename: string;
        sizeBytes: number;
        content: string;
      }[] = [];

      try {
        const results = await uploadDocuments(files);
        const resultByName = new Map(
          results.map((result) => [result.filename ?? "", result]),
        );

        const finalQueue: UploadQueueItem[] = queue.map((item) => {
          const result = resultByName.get(item.filename);
          if (!result) {
            return {
              ...item,
              status: "error" as const,
              error: "No response from server.",
            };
          }

          parsed.push({
            id: item.id,
            filename: result.filename ?? item.filename,
            sizeBytes: item.sizeBytes,
            content: result.content,
          });
          return { ...item, status: "done" as const };
        });
        setUploadQueue(finalQueue);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Upload failed.";
        setUploadQueue((prev) =>
          prev.map((item) => ({ ...item, status: "error", error: message })),
        );
      }

      if (parsed.length > 0) {
        addUploadedFilesAndPersist(parsed);
      }

      const failedCount = files.length - parsed.length;
      if (failedCount > 0 && parsed.length === 0) {
        setError(
          failedCount === 1
            ? "Could not parse the uploaded file."
            : `Could not parse ${failedCount} file(s).`,
        );
      } else if (failedCount > 0) {
        setError(
          `${parsed.length} file(s) added; ${failedCount} failed to parse. See details below.`,
        );
      }

      if (failedCount === 0) {
        window.setTimeout(() => setUploadQueue([]), 2000);
      }
    },
    [addUploadedFilesAndPersist],
  );

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

  const handleContinue = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (
        inputSources.confluenceUrl.trim() &&
        inputSources.confluenceToken.trim() &&
        !inputSources.confluenceSpaceKey.trim()
      ) {
        throw new ApiError("Confluence space key is required.", 400);
      }

      setExtractPhase("Gathering sources (files, web, Confluence)…");
      const combined = await gatherSourceText();

      if (!combined.trim()) {
        setError(
          "Add at least one source: upload a file, paste text, enter a website URL, or connect Confluence.",
        );
        return;
      }

      setExtractPhase("Extracting invention details (parallel AI analysis)…");
      const details = await extractInvention(combined, extractionNotesFromSources(inputSources));
      setInvention(details);
      saveToStorage();
      navigate("/review");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to extract invention details.");
    } finally {
      setSubmitting(false);
      setExtractPhase(null);
    }
  };

  const handleRemoveFile = (id: string) => {
    removeUploadedFile(id);
    saveToStorage();
  };

  return (
    <AppShell
      step="input"
      mainClassName="max-w-[1440px] mx-auto px-margin-desktop py-12"
      footer={
        <WorkflowFooter
          right={
            <WorkflowNextButton
              disabled={submitting || uploading}
              onClick={() => void handleContinue()}
            >
              {submitting ? "Extracting..." : "Next: Review"}
            </WorkflowNextButton>
          }
        />
      }
    >
      {submitting && (
        <div className="mb-6">
          <GenerationProgress
            active
            label={extractPhase ?? "Extracting invention details from your sources"}
          />
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error border border-error/30">
          {error}
        </div>
      )}

      {hasSavedProgress && (
        <div className="mb-6 p-4 rounded-lg bg-secondary-container/15 border border-secondary/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="font-title-md text-title-md text-on-surface">
              {invention?.invention_title?.trim()
                ? `Continue “${invention.invention_title}”?`
                : "Continue your saved draft?"}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Your progress is saved in this browser. Use <strong>Drafts</strong> in the header to
              upload a draft file or manage saved copies.
            </p>
          </div>
          <Link
            to={resumePath}
            onClick={() => saveToStorage()}
            className="px-6 py-2.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md hover:bg-secondary/90 transition-all active:scale-95 shrink-0 text-center"
          >
            Continue draft
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card">
            <h2 className="font-headline-md text-headline-md text-primary mb-2">Upload Documents</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              Upload invention write-ups or technical decks; text is extracted automatically for AI
              analysis.
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
              className={`border-2 border-dashed border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center bg-surface-container-low transition-all group ${
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
                {uploading
                  ? "Parsing your documents…"
                  : "Drag files here or click to browse"}
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
                      className="flex items-center gap-3 p-4 bg-surface rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="material-symbols-outlined text-primary shrink-0">
                          {fileIcon(file.filename)}
                        </span>
                        <div className="min-w-0">
                          <span className="font-body-md text-body-md font-medium block truncate">
                            {file.filename}
                          </span>
                          <span className="font-body-sm text-body-sm text-on-surface-variant">
                            {formatFileSize(file.sizeBytes)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          aria-label={`Preview ${file.filename}`}
                          onClick={() => setPreviewFile(file)}
                          className="flex size-9 items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-all"
                        >
                          <span className="material-symbols-outlined text-[20px]">visibility</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${file.filename}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFile(file.id);
                          }}
                          className="flex size-9 items-center justify-center text-error hover:bg-error-container rounded-full transition-all active:scale-90"
                        >
                          <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6">
          <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card h-full">
            <h2 className="font-headline-md text-headline-md text-primary mb-2">Connect a Source</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              Optionally pull content from Confluence, a public webpage, or paste text directly.
            </p>
            <div className="space-y-6">
              <div className="p-6 border border-outline-variant rounded-xl bg-surface-container-low">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <span className="material-symbols-outlined text-primary">tune</span>
                  </div>
                  <div>
                    <h3 className="font-title-lg text-title-lg">Relevance guidance</h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      Optional — helps the AI focus extraction on what matters for the patent.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="relevant-content-notes"
                      className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
                    >
                      Relevant content
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                      Topics, documents, or sections the AI should prioritize (e.g. core RAG
                      architecture, claims chart in deck slide 5).
                    </p>
                    <textarea
                      id="relevant-content-notes"
                      className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px]"
                      placeholder="e.g. Hybrid retrieval pipeline, embedding model, agent orchestration…"
                      rows={3}
                      value={inputSources.relevantContentNotes}
                      onChange={(e) =>
                        setInputSources({ relevantContentNotes: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="irrelevant-content-notes"
                      className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
                    >
                      Irrelevant content
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                      Material to ignore or de-emphasize (e.g. marketing pages, HR wiki, roadmap
                      slides).
                    </p>
                    <textarea
                      id="irrelevant-content-notes"
                      className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y min-h-[88px]"
                      placeholder="e.g. Company overview, pricing, team bios, %%qa%% template blocks…"
                      rows={3}
                      value={inputSources.irrelevantContentNotes}
                      onChange={(e) =>
                        setInputSources({ irrelevantContentNotes: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border border-outline-variant rounded-xl bg-surface hover:border-secondary transition-all group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-secondary/10 rounded-lg group-hover:bg-secondary/20 transition-colors">
                    <span
                      className="material-symbols-outlined text-secondary"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      extension
                    </span>
                  </div>
                  <h3 className="font-title-lg text-title-lg">Confluence</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="confluence-url"
                      className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
                    >
                      Confluence URL
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                      Wiki or page URL for your Atlassian site (used to locate the API base).
                    </p>
                    <input
                      id="confluence-url"
                      className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm"
                      placeholder="https://company.atlassian.net/wiki/..."
                      type="text"
                      value={inputSources.confluenceUrl}
                      onChange={(e) => setInputSources({ confluenceUrl: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="confluence-space"
                      className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
                    >
                      Space key
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                      Short space identifier (e.g. ENG) shown in Confluence URLs.
                    </p>
                    <input
                      id="confluence-space"
                      className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm"
                      placeholder="ENG"
                      type="text"
                      value={inputSources.confluenceSpaceKey}
                      onChange={(e) => setInputSources({ confluenceSpaceKey: e.target.value })}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="confluence-token"
                      className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
                    >
                      API token
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                      Personal access token from Atlassian account settings for API access.
                    </p>
                    <div className="relative">
                      <input
                        id="confluence-token"
                        className="w-full bg-white border border-outline-variant rounded-lg p-3 pr-12 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm"
                        placeholder="••••••••••••••••"
                        type={showToken ? "text" : "password"}
                        value={inputSources.confluenceToken}
                        onChange={(e) => setInputSources({ confluenceToken: e.target.value })}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        aria-label={showToken ? "Hide API token" : "Show API token"}
                        onClick={() => setShowToken((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-primary rounded-full transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {showToken ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border border-outline-variant rounded-xl bg-surface hover:border-secondary transition-all group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-secondary/10 rounded-lg group-hover:bg-secondary/20 transition-colors">
                    <span className="material-symbols-outlined text-secondary">public</span>
                  </div>
                  <h3 className="font-title-lg text-title-lg">Website URL</h3>
                </div>
                <div>
                  <label
                    htmlFor="website-url"
                    className="block font-label-sm text-label-sm text-on-surface-variant mb-1"
                  >
                    Scraping URL
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                    Public product or documentation page whose text will be scraped for context.
                  </p>
                  <input
                    id="website-url"
                    className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm"
                    placeholder="https://example.com/product-page"
                    type="url"
                    value={inputSources.websiteUrl}
                    onChange={(e) => setInputSources({ websiteUrl: e.target.value })}
                  />
                </div>
              </div>

              <div className="p-6 border border-outline-variant rounded-xl bg-surface hover:border-secondary transition-all group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-secondary/10 rounded-lg group-hover:bg-secondary/20 transition-colors">
                    <span className="material-symbols-outlined text-secondary">content_paste</span>
                  </div>
                  <h3 className="font-title-lg text-title-lg">Paste Text</h3>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                  Free-form invention description when you do not have files or links ready.
                </p>
                <textarea
                  className="w-full bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-none"
                  placeholder="Describe your invention in detail here..."
                  rows={4}
                  value={inputSources.pastedText}
                  onChange={(e) => setInputSources({ pastedText: e.target.value })}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
      <SourceFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </AppShell>
  );
}
