import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GenericAppShell } from "../../components/GenericAppShell";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { useGenericWorkflow } from "../../context/GenericWorkflowContext";
import { GENERIC_STEP_PATHS } from "../../utils/genericStorage";
import "../../styles/patent-drafter.css";

export default function GenericReview() {
  const navigate = useNavigate();
  const {
    templateId,
    details,
    setDetails,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
  } = useGenericWorkflow();

  const paths = GENERIC_STEP_PATHS(templateId);
  const [title, setTitle] = useState(details?.title ?? "");

  useEffect(() => {
    if (!details?.title?.trim()) {
      navigate(paths.input, { replace: true });
      return;
    }
    setTitle(details.title);
  }, [details, navigate, paths.input]);

  useEffect(() => {
    if (!details) return;
    setDetails({ title });
    saveToStorage();
  }, [title, details, setDetails, saveToStorage]);

  const pastedText = inputSources.pastedText.trim();
  const websiteSources = cachedRemoteSources.website ?? [];
  const confluenceSource = cachedRemoteSources.confluence;
  const hasPasted = pastedText.length > 0;
  const hasUploaded = uploadedFiles.length > 0;
  const hasWebsite = websiteSources.some((entry) => entry.content.trim().length > 0);
  const hasConfluence = Boolean(confluenceSource?.content?.trim());
  const hasAnySource = hasUploaded || hasPasted || hasWebsite || hasConfluence;
  const titleTrimmed = title.trim();

  return (
    <GenericAppShell
      step="review"
      mainClassName="max-w-[900px] mx-auto px-margin-desktop py-10 pb-28"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to={paths.input} />}
          right={
            <WorkflowNextLink
              to={paths.draft}
              disabled={!titleTrimmed || !hasAnySource}
              onClick={() => {
                setDetails({ title: titleTrimmed });
                markStepComplete("review");
                requestAutoDraft();
                saveToStorage();
              }}
            >
              Next: Draft
            </WorkflowNextLink>
          }
        />
      }
    >
      <div className="mb-8">
        <h1 className="font-headline-lg text-headline-lg text-primary">Review document</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          Confirm the title and source material, then continue to drafting.
        </p>
      </div>

      <div className="space-y-8">
        <div className="space-y-3">
          <div>
            <label
              htmlFor="generic-review-title"
              className="font-label-md text-label-md text-primary"
            >
              Document title
            </label>
          </div>
          <input
            id="generic-review-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none"
          />
          {!titleTrimmed && (
            <p className="font-body-sm text-body-sm text-error">A document title is required.</p>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="font-title-md text-title-md text-primary">Source material</h2>
          {!hasAnySource && (
            <p className="font-body-sm text-body-sm text-error">
              No source material found. Go back to Input and add at least one source.
            </p>
          )}

          <ul className="space-y-3">
            {uploadedFiles.map((file) => (
              <li
                key={file.id}
                className="p-4 rounded-lg border border-outline-variant bg-surface-container-lowest"
              >
                <p className="font-label-md text-label-md text-on-surface">{file.filename}</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {file.content.trim().length.toLocaleString()} characters
                </p>
              </li>
            ))}
            {hasPasted && (
              <li className="p-4 rounded-lg border border-outline-variant bg-surface-container-lowest">
                <p className="font-label-md text-label-md text-on-surface">Pasted text</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {pastedText.length.toLocaleString()} characters
                </p>
              </li>
            )}
            {websiteSources
              .filter((entry) => entry.content.trim().length > 0)
              .map((entry) => (
                <li
                  key={entry.url}
                  className="p-4 rounded-lg border border-outline-variant bg-surface-container-lowest"
                >
                  <p className="font-label-md text-label-md text-on-surface">Website</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 break-all">
                    {entry.url}
                  </p>
                </li>
              ))}
            {hasConfluence && confluenceSource && (
              <li className="p-4 rounded-lg border border-outline-variant bg-surface-container-lowest">
                <p className="font-label-md text-label-md text-on-surface">Confluence</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Space {confluenceSource.spaceKey}
                </p>
              </li>
            )}
          </ul>
        </div>
      </div>
    </GenericAppShell>
  );
}
