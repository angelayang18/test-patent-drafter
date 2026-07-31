import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import { ImportSavedDraftsCard } from "../components/ImportSavedDraftsCard";
import { UploadProgressPanel } from "../components/UploadProgressPanel";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { WorkflowNextButton } from "../components/WorkflowNavButtons";
import { RelevanceGuidancePanel } from "../components/RelevanceGuidancePanel";
import { SourceFilePreviewModal } from "../components/SourceFilePreviewModal";
import { usePatentWorkflow, type UploadedSourceFile } from "../context/PatentWorkflowContext";
import { usePatentFileUpload } from "../hooks/usePatentFileUpload";
import { ApiError, extractionNotesFromSources, extractInvention } from "../services/api";
import { fileIcon, formatFileSize } from "../utils/format";
import {
  getResumePath,
  workflowHasProgress,
} from "../utils/draftStorage";
import { computeExtractionSourceKey } from "../utils/extractionSourceKey";
import { SourceGatherError } from "../utils/gatherSourceText";
import "../styles/patent-drafter.css";

function getWebsiteUrlError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    new URL(trimmed);
    return null;
  } catch {
    return "Enter a valid URL (e.g. https://example.com/product-page).";
  }
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
    removeUploadedFile,
    setInputSources,
    gatherSourceText,
    setInvention,
    setFieldCitations,
    setExtractionSourceKey,
    getWorkflowSnapshot,
    saveToStorage,
    workflowResetting,
  } = usePatentWorkflow();

  const resumePath = getResumePath(getWorkflowSnapshot());
  const hasSavedProgress =
    !workflowResetting && workflowHasProgress(getWorkflowSnapshot());

  const { processFiles, uploadQueue, error: uploadError, uploading } = usePatentFileUpload();

  const [showToken, setShowToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confluenceError, setConfluenceError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<UploadedSourceFile | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [importCardDismissed, setImportCardDismissed] = useState(false);
  const loadedFromDraftId = getWorkflowSnapshot().loadedFromDraftId;

  const websiteUrlErrors = inputSources.websiteUrls.map((url) => getWebsiteUrlError(url));
  const websiteUrlError = websiteUrlErrors.find((err) => err !== null) ?? null;
  const hasPastedText = inputSources.pastedText.trim().length > 0;
  const hasUploadedFiles = uploadedFiles.length > 0;
  const hasWebsiteUrl = inputSources.websiteUrls.some((url) => url.trim().length > 0);
  const confluenceConfigured = Boolean(
    inputSources.confluenceUrl.trim() &&
      inputSources.confluenceSpaceKey.trim() &&
      inputSources.confluenceToken.trim(),
  );
  const hasAnySource =
    hasPastedText || hasUploadedFiles || hasWebsiteUrl || confluenceConfigured;
  const missingSource = !hasAnySource;
  const emptyPrimarySource = !hasUploadedFiles && !hasPastedText;
  const continueDisabled = submitting || uploading || Boolean(websiteUrlError);
  const confluenceLoading =
    submitting && Boolean(extractPhase?.toLowerCase().includes("confluence"));

  const clearConfluenceError = useCallback(() => {
    setConfluenceError(null);
  }, []);

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

  const hasExtractedDetails = Boolean(invention);

  const handleContinue = async () => {
    setHasAttemptedSubmit(true);
    setError(null);
    setConfluenceError(null);

    if (hasExtractedDetails) {
      navigate("/patent/review");
      return;
    }

    if (websiteUrlError) {
      return;
    }

    if (missingSource) {
      return;
    }

    setSubmitting(true);
    try {
      if (
        inputSources.confluenceUrl.trim() &&
        inputSources.confluenceToken.trim() &&
        !inputSources.confluenceSpaceKey.trim()
      ) {
        setConfluenceError("Confluence space key is required.");
        return;
      }

      const { combined, cache } = await gatherSourceText({
        onProgress: setExtractPhase,
      });

      if (!combined.trim()) {
        setError(
          "Add at least one source: upload a file, paste text, enter a website URL, or connect Confluence.",
        );
        return;
      }

      setExtractPhase("Extracting invention details (parallel AI analysis)…");
      const notes = extractionNotesFromSources(inputSources);
      const result = await extractInvention(combined, notes);
      setInvention(result.details);
      setFieldCitations(result.citations);
      setExtractionSourceKey(computeExtractionSourceKey(uploadedFiles, inputSources, cache));
      saveToStorage();
      navigate("/patent/review");
    } catch (err) {
      if (err instanceof SourceGatherError && err.source === "confluence") {
        setConfluenceError(err.message);
        return;
      }
      if (err instanceof SourceGatherError) {
        setError(err.message);
        return;
      }
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
            <div className="flex flex-col items-end gap-2">
              {hasAttemptedSubmit && missingSource && (
                <p
                  className="font-body-sm text-body-sm text-on-surface-variant text-right max-w-md"
                  role="status"
                >
                  Please provide at least one source: paste text, upload a file, or enter a URL.
                </p>
              )}
              <WorkflowNextButton
                disabled={continueDisabled}
                className={emptyPrimarySource ? "opacity-50 cursor-not-allowed" : ""}
                onClick={() => void handleContinue()}
              >
                {submitting ? "Extracting..." : "Next: Review"}
              </WorkflowNextButton>
            </div>
          }
        />
      }
    >
      {submitting && extractPhase && (
        <div className="mb-6">
          <GenerationProgress
            active
            label={extractPhase}
          />
        </div>
      )}

      {(error || uploadError) && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error border border-error/30">
          {error ?? uploadError}
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

      <div className="flex flex-col gap-10">
        {!importCardDismissed && (
          <ImportSavedDraftsCard
            excludeDraftId={loadedFromDraftId}
            pastedText={inputSources.pastedText}
            onPastedTextChange={(value) => setInputSources({ pastedText: value })}
            onDismiss={() => setImportCardDismissed(true)}
          />
        )}

        <div>
          <h2 className="font-headline-md text-headline-md text-primary">Add source material</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Upload technical documents or paste a description — use either or both.
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

            <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card h-full flex flex-col">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-secondary/10 rounded-lg">
                  <span className="material-symbols-outlined text-secondary">content_paste</span>
                </div>
                <h3 className="font-title-lg text-title-lg">Paste text</h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                Free-form invention description when you do not have files or links ready.
              </p>
              <textarea
                className="w-full flex-1 min-h-[200px] bg-white border border-outline-variant rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm resize-y"
                placeholder="Describe your invention in detail here..."
                rows={8}
                value={inputSources.pastedText}
                onChange={(e) => setInputSources({ pastedText: e.target.value })}
              />
            </section>
          </div>
        </div>

        <div>
          <h2 className="font-headline-md text-headline-md text-primary">Connect external sources</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Optionally pull content from Confluence or scrape a public webpage.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-gutter mt-6 items-start">
            <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-secondary/10 rounded-lg">
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
                      className={`w-full bg-white border rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm ${
                        confluenceError
                          ? "border-error/50 focus:ring-error/20 focus:border-error"
                          : "border-outline-variant"
                      }`}
                      placeholder="https://company.atlassian.net/wiki/..."
                      type="text"
                      value={inputSources.confluenceUrl}
                      onChange={(e) => {
                        clearConfluenceError();
                        setInputSources({ confluenceUrl: e.target.value });
                      }}
                      aria-invalid={confluenceError ? true : undefined}
                      aria-describedby={confluenceError ? "confluence-error" : undefined}
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
                      className={`w-full bg-white border rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm ${
                        confluenceError
                          ? "border-error/50 focus:ring-error/20 focus:border-error"
                          : "border-outline-variant"
                      }`}
                      placeholder="ENG"
                      type="text"
                      value={inputSources.confluenceSpaceKey}
                      onChange={(e) => {
                        clearConfluenceError();
                        setInputSources({ confluenceSpaceKey: e.target.value });
                      }}
                      aria-invalid={confluenceError ? true : undefined}
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
                        className={`w-full bg-white border rounded-lg p-3 pr-12 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm ${
                          confluenceError
                            ? "border-error/50 focus:ring-error/20 focus:border-error"
                            : "border-outline-variant"
                        }`}
                        placeholder="••••••••••••••••"
                        type={showToken ? "text" : "password"}
                        value={inputSources.confluenceToken}
                        onChange={(e) => {
                          clearConfluenceError();
                          setInputSources({ confluenceToken: e.target.value });
                        }}
                        autoComplete="off"
                        aria-invalid={confluenceError ? true : undefined}
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
                {confluenceLoading && (
                  <div
                    className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant rounded-lg bg-secondary/5 border border-secondary/20 px-3 py-2"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="material-symbols-outlined loading-spin text-secondary text-[18px]">
                      progress_activity
                    </span>
                    Connecting to Confluence…
                  </div>
                )}
                {confluenceError && (
                  <p
                    id="confluence-error"
                    role="alert"
                    className="font-body-sm text-body-sm text-error rounded-lg bg-error-container/20 border border-error/30 px-3 py-2"
                  >
                    {confluenceError}
                  </p>
                )}
                {!confluenceLoading && !confluenceError && confluenceConfigured && (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Confluence content is fetched when you click <strong>Next: Review</strong>.
                  </p>
                )}
              </div>
            </section>

            <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card h-full">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-secondary/10 rounded-lg">
                  <span className="material-symbols-outlined text-secondary">public</span>
                </div>
                <h3 className="font-title-lg text-title-lg">Website URLs</h3>
              </div>
              <div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mb-4">
                  Public product or documentation pages whose text will be scraped for context.
                </p>
                <div className="space-y-3">
                  {(inputSources.websiteUrls.length > 0
                    ? inputSources.websiteUrls
                    : [""]
                  ).map((url, index) => {
                    const rowError = websiteUrlErrors[index] ?? getWebsiteUrlError(url);
                    const inputId = `website-url-${index}`;
                    const errorId = `website-url-error-${index}`;
                    return (
                      <div key={inputId} className="space-y-2">
                        <div className="flex items-center gap-3">
                          <input
                            id={inputId}
                            className={`min-w-0 flex-1 bg-white border rounded-lg p-3 focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none transition-all font-body-sm text-body-sm ${
                              rowError
                                ? "border-error/50 focus:ring-error/20 focus:border-error"
                                : "border-outline-variant"
                            }`}
                            placeholder="https://example.com/product-page"
                            type="url"
                            value={url}
                            onChange={(e) => {
                              const next = [...inputSources.websiteUrls];
                              if (next.length === 0) {
                                next.push(e.target.value);
                              } else {
                                next[index] = e.target.value;
                              }
                              setInputSources({ websiteUrls: next });
                            }}
                            aria-invalid={rowError ? true : undefined}
                            aria-describedby={rowError ? errorId : undefined}
                          />
                          <button
                            type="button"
                            className="shrink-0 p-2 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
                            aria-label={`Remove website URL ${index + 1}`}
                            onClick={() => {
                              const current =
                                inputSources.websiteUrls.length > 0
                                  ? inputSources.websiteUrls
                                  : [""];
                              if (current.length <= 1) {
                                setInputSources({ websiteUrls: [""] });
                                return;
                              }
                              setInputSources({
                                websiteUrls: current.filter((_, i) => i !== index),
                              });
                            }}
                          >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                          </button>
                        </div>
                        {rowError && (
                          <p
                            id={errorId}
                            role="alert"
                            className="font-body-sm text-body-sm text-error rounded-lg bg-error-container/20 border border-error/30 px-3 py-2"
                          >
                            {rowError}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 font-label-md text-label-md text-secondary hover:text-secondary/80 transition-colors"
                  onClick={() =>
                    setInputSources({
                      websiteUrls: [
                        ...(inputSources.websiteUrls.length > 0
                          ? inputSources.websiteUrls
                          : [""]),
                        "",
                      ],
                    })
                  }
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Add website
                </button>
              </div>
            </section>
          </div>
        </div>

        <RelevanceGuidancePanel
          relevantContentNotes={inputSources.relevantContentNotes}
          irrelevantContentNotes={inputSources.irrelevantContentNotes}
          onRelevantChange={(value) => setInputSources({ relevantContentNotes: value })}
          onIrrelevantChange={(value) => setInputSources({ irrelevantContentNotes: value })}
        />
      </div>
      <SourceFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </AppShell>
  );
}
