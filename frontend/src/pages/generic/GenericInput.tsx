import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImportSavedDraftsCard } from "../../components/ImportSavedDraftsCard";
import UploadPanel, { getWebsiteUrlError } from "../../components/UploadPanel";
import { GenericAppShell } from "../../components/GenericAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowNextButton } from "../../components/WorkflowNavButtons";
import { useGenericWorkflow } from "../../context/GenericWorkflowContext";
import { useGenericFileUpload } from "../../hooks/useGenericFileUpload";
import { computeExtractionSourceKey } from "../../utils/extractionSourceKey";
import {
  GENERIC_STEP_PATHS,
  getGenericResumePath,
  genericWorkflowHasProgress,
} from "../../utils/genericStorage";
import { SourceGatherError } from "../../utils/gatherSourceText";
import "../../styles/patent-drafter.css";

export default function GenericInput() {
  const navigate = useNavigate();
  const {
    templateId,
    template,
    details,
    uploadedFiles,
    inputSources,
    setInputSources,
    setDetails,
    setExtractionSourceKey,
    gatherSourceText,
    removeUploadedFile,
    getWorkflowSnapshot,
    saveToStorage,
    markStepComplete,
  } = useGenericWorkflow();

  const { processFiles, uploadQueue, error: uploadError, uploading } = useGenericFileUpload();
  const [title, setTitle] = useState(details?.title ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [gatherPhase, setGatherPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confluenceError, setConfluenceError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [importCardDismissed, setImportCardDismissed] = useState(false);
  const loadedFromDraftId = getWorkflowSnapshot().loadedFromDraftId;
  const paths = GENERIC_STEP_PATHS(templateId);

  const websiteUrlError =
    inputSources.websiteUrls.map((url) => getWebsiteUrlError(url)).find((err) => err !== null) ??
    null;
  const hasPastedText = inputSources.pastedText.trim().length > 0;
  const hasUploadedFiles = uploadedFiles.length > 0;
  const emptyPrimarySource = !hasUploadedFiles && !hasPastedText;
  const hasAnySource =
    inputSources.pastedText.trim().length > 0 ||
    uploadedFiles.length > 0 ||
    inputSources.websiteUrls.some((url) => url.trim().length > 0) ||
    (inputSources.confluenceUrl.trim() &&
      inputSources.confluenceSpaceKey.trim() &&
      inputSources.confluenceToken.trim());
  const titleTrimmed = title.trim();
  const resumePath = getGenericResumePath(templateId, getWorkflowSnapshot());
  const hasSavedProgress = genericWorkflowHasProgress(getWorkflowSnapshot());

  const handleContinue = async () => {
    setHasAttemptedSubmit(true);
    setError(null);
    setConfluenceError(null);

    if (websiteUrlError || !hasAnySource || !titleTrimmed) {
      return;
    }

    if (details?.title?.trim()) {
      setDetails({ title: titleTrimmed });
      saveToStorage();
      navigate(paths.review);
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

      const { combined, cache } = await gatherSourceText({ onProgress: setGatherPhase });
      if (!combined.trim()) {
        setError(
          "Add at least one source: upload a file, paste text, enter a URL, or connect Confluence.",
        );
        return;
      }

      setDetails({ title: titleTrimmed });
      setExtractionSourceKey(computeExtractionSourceKey(uploadedFiles, inputSources, cache));
      markStepComplete("input");
      saveToStorage();
      navigate(paths.review);
    } catch (err) {
      if (err instanceof SourceGatherError && err.source === "confluence") {
        setConfluenceError(err.message);
        return;
      }
      if (err instanceof SourceGatherError) {
        setError(err.message);
        return;
      }
      setError("Failed to gather source material.");
    } finally {
      setSubmitting(false);
      setGatherPhase(null);
    }
  };

  return (
    <GenericAppShell
      step="input"
      mainClassName="max-w-[1440px] mx-auto px-margin-desktop py-12"
      footer={
        <WorkflowFooter
          right={
            <div className="flex flex-col items-end gap-2">
              {hasAttemptedSubmit && !titleTrimmed && (
                <p
                  className="font-body-sm text-body-sm text-on-surface-variant text-right max-w-md"
                  role="status"
                >
                  Please enter a document title.
                </p>
              )}
              {hasAttemptedSubmit && !hasAnySource && (
                <p
                  className="font-body-sm text-body-sm text-on-surface-variant text-right max-w-md"
                  role="status"
                >
                  Please add at least one source — paste text or upload a document.
                </p>
              )}
              <WorkflowNextButton
                disabled={submitting || uploading || Boolean(websiteUrlError)}
                className={
                  emptyPrimarySource || !titleTrimmed ? "opacity-50 cursor-not-allowed" : ""
                }
                onClick={() => void handleContinue()}
              >
                {submitting ? "Gathering sources…" : "Next: Review"}
              </WorkflowNextButton>
            </div>
          }
        />
      }
    >
      {submitting && gatherPhase && (
        <div className="mb-6">
          <GenerationProgress active label={gatherPhase} />
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
              {details?.title?.trim()
                ? `Continue “${details.title}”?`
                : `Continue your saved ${template.name} draft?`}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Your progress is saved in this browser.
            </p>
          </div>
          <Link
            to={resumePath}
            onClick={() => saveToStorage()}
            className="px-6 py-2.5 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md shrink-0 text-center"
          >
            Continue draft
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-10">
        <div className="space-y-3">
          <div>
            <label
              htmlFor="generic-document-title"
              className="font-label-md text-label-md text-primary"
            >
              Document title
            </label>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Used as the document heading when drafting and exporting.
            </p>
          </div>
          <input
            id="generic-document-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`e.g. ${template.name}`}
            className="w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none"
          />
        </div>

        {!importCardDismissed && (
          <ImportSavedDraftsCard
            excludeDraftId={loadedFromDraftId}
            pastedText={inputSources.pastedText}
            onPastedTextChange={(value) => setInputSources({ pastedText: value })}
            onDismiss={() => setImportCardDismissed(true)}
          />
        )}
        <UploadPanel
          inputSources={inputSources}
          onInputSourcesChange={setInputSources}
          uploadedFiles={uploadedFiles}
          onRemoveFile={(id) => {
            removeUploadedFile(id);
            saveToStorage();
          }}
          processFiles={processFiles}
          uploadQueue={uploadQueue}
          uploading={uploading}
          confluenceError={confluenceError}
          onClearConfluenceError={() => setConfluenceError(null)}
          confluenceLoading={
            submitting && Boolean(gatherPhase?.toLowerCase().includes("confluence"))
          }
        />
      </div>
    </GenericAppShell>
  );
}
