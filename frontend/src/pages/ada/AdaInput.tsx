import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImportSavedDraftsCard } from "../../components/ImportSavedDraftsCard";
import UploadPanel, { getWebsiteUrlError } from "../../components/UploadPanel";
import { AdaAppShell } from "../../components/AdaAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowNextButton } from "../../components/WorkflowNavButtons";
import { useAdaWorkflow } from "../../context/AdaWorkflowContext";
import { useAdaFileUpload } from "../../hooks/useAdaFileUpload";
import {
  ApiError,
  extractionNotesFromSources,
  extractAda,
} from "../../services/api";
import { computeExtractionSourceKey } from "../../utils/extractionSourceKey";
import { getAdaResumePath, adaWorkflowHasProgress } from "../../utils/adaStorage";
import { SourceGatherError } from "../../utils/gatherSourceText";
import "../../styles/patent-drafter.css";

export default function AdaInput() {
  const navigate = useNavigate();
  const {
    adaDetails,
    uploadedFiles,
    inputSources,
    setInputSources,
    setAdaDetails,
    setExtractionSourceKey,
    gatherSourceText,
    removeUploadedFile,
    getWorkflowSnapshot,
    saveToStorage,
  } = useAdaWorkflow();

  const { processFiles, uploadQueue, error: uploadError, uploading } = useAdaFileUpload();
  const [submitting, setSubmitting] = useState(false);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confluenceError, setConfluenceError] = useState<string | null>(null);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [importCardDismissed, setImportCardDismissed] = useState(false);
  const loadedFromDraftId = getWorkflowSnapshot().loadedFromDraftId;

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
  const resumePath = getAdaResumePath(getWorkflowSnapshot());
  const hasSavedProgress = adaWorkflowHasProgress(getWorkflowSnapshot());

  const handleContinue = async () => {
    setHasAttemptedSubmit(true);
    setError(null);
    setConfluenceError(null);

    if (websiteUrlError || !hasAnySource) {
      return;
    }

    if (adaDetails) {
      navigate("/ada/review");
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

      const { combined, cache } = await gatherSourceText({ onProgress: setExtractPhase });
      if (!combined.trim()) {
        setError("Add at least one source: upload a file, paste text, enter a URL, or connect Confluence.");
        return;
      }

      setExtractPhase("Extracting ADA study details…");
      const details = await extractAda(combined, extractionNotesFromSources(inputSources));
      setAdaDetails(details);
      setExtractionSourceKey(computeExtractionSourceKey(uploadedFiles, inputSources, cache));
      saveToStorage();
      navigate("/ada/review");
    } catch (err) {
      if (err instanceof SourceGatherError && err.source === "confluence") {
        setConfluenceError(err.message);
        return;
      }
      if (err instanceof SourceGatherError) {
        setError(err.message);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Failed to extract ADA details.");
    } finally {
      setSubmitting(false);
      setExtractPhase(null);
    }
  };

  return (
    <AdaAppShell
      step="input"
      mainClassName="max-w-[1440px] mx-auto px-margin-desktop py-12"
      footer={
        <WorkflowFooter
          right={
            <div className="flex flex-col items-end gap-2">
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
                className={emptyPrimarySource ? "opacity-50 cursor-not-allowed" : ""}
                onClick={() => void handleContinue()}
              >
                {submitting ? "Extracting…" : "Next: Review"}
              </WorkflowNextButton>
            </div>
          }
        />
      }
    >
      {submitting && extractPhase && (
        <div className="mb-6">
          <GenerationProgress active label={extractPhase} />
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
              {adaDetails?.study_title?.trim()
                ? `Continue “${adaDetails.study_title}”?`
                : "Continue your saved ADA draft?"}
            </p>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Your progress is saved in this browser. Use <strong>Drafts</strong> in the header to
              upload a draft file or manage saved copies.
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
          confluenceLoading={submitting && Boolean(extractPhase?.toLowerCase().includes("confluence"))}
        />
      </div>
    </AdaAppShell>
  );
}
