import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GenericAppShell } from "../../components/GenericAppShell";
import { SavedIndicator, useSavedIndicator } from "../../components/SavedIndicator";
import { SectionCitationsPanel } from "../../components/SectionCitationsPanel";
import { SuggestTitlesButton, TitleSuggestionsList } from "../../components/TitleSuggestions";
import { UndoRedoToolbar } from "../../components/UndoRedoToolbar";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { useGenericWorkflow } from "../../context/GenericWorkflowContext";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import {
  ApiError,
  extractionNotesFromSources,
  getGenericTitleCitations,
  suggestGenericTitles,
} from "../../services/api";
import { GENERIC_STEP_PATHS } from "../../utils/genericStorage";
import "../../styles/patent-drafter.css";

export default function GenericReview() {
  const navigate = useNavigate();
  const {
    templateId,
    template,
    details,
    setDetails,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    gatherSourceText,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
    titleCitations,
    setTitleCitations,
  } = useGenericWorkflow();

  const paths = GENERIC_STEP_PATHS(templateId);
  const {
    value: title,
    replace: setTitle,
    push: pushTitle,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetTitle,
  } = useUndoRedo(details?.title ?? "");
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [suggestingTitles, setSuggestingTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();
  const flashSavedRef = useRef(flashSaved);
  flashSavedRef.current = flashSaved;
  const initialSynced = useRef(false);
  const suppressSavedIndicator = useRef(true);
  const hasDetailsRef = useRef(Boolean(details));
  hasDetailsRef.current = Boolean(details);

  useEffect(() => {
    if (!details?.title?.trim()) {
      navigate(paths.input, { replace: true });
      return;
    }
    if (!initialSynced.current) {
      resetTitle(details.title);
      initialSynced.current = true;
      window.setTimeout(() => {
        suppressSavedIndicator.current = false;
      }, 0);
    }
  }, [details, navigate, paths.input, resetTitle]);

  useEffect(() => {
    if (!details) return;
    setDetails({ title });
    saveToStorage();
  }, [title, details, setDetails, saveToStorage]);

  useEffect(() => {
    if (!hasDetailsRef.current || suppressSavedIndicator.current) {
      return;
    }
    flashSavedRef.current();
  }, [title]);

  const pastedText = inputSources.pastedText.trim();
  const websiteSources = cachedRemoteSources.website ?? [];
  const confluenceSource = cachedRemoteSources.confluence;
  const hasPasted = pastedText.length > 0;
  const hasUploaded = uploadedFiles.length > 0;
  const hasWebsite = websiteSources.some((entry) => entry.content.trim().length > 0);
  const hasConfluence = Boolean(confluenceSource?.content?.trim());
  const hasAnySource = hasUploaded || hasPasted || hasWebsite || hasConfluence;
  const titleTrimmed = title.trim();
  const extractionNotes = extractionNotesFromSources(inputSources);
  const isBusy = suggestingTitles;

  // Cheap, LLM-free citation refresh whenever the title changes (debounced).
  useEffect(() => {
    if (!hasAnySource || !titleTrimmed) {
      setTitleCitations([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { combined } = await gatherSourceText();
          if (cancelled || !combined.trim()) return;
          const citations = await getGenericTitleCitations(
            combined,
            template.name,
            titleTrimmed,
          );
          if (!cancelled) {
            setTitleCitations(citations);
          }
        } catch {
          // Citation refresh is best-effort; leave prior citations in place.
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    titleTrimmed,
    hasAnySource,
    gatherSourceText,
    template.name,
    setTitleCitations,
  ]);

  const handleSuggestTitles = () => {
    if (suggestingTitles || !hasAnySource) return;
    setError(null);
    setSuggestingTitles(true);

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available. Go back to Input and add at least one source.");
          return;
        }
        const { titles, citations } = await suggestGenericTitles(
          combined,
          template.name,
          title,
          extractionNotes,
        );
        setTitleSuggestions(titles);
        setTitleCitations(citations);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Title suggestion failed.");
      } finally {
        setSuggestingTitles(false);
      }
    })();
  };

  return (
    <GenericAppShell
      step="review"
      mainClassName="max-w-[900px] mx-auto px-margin-desktop py-10 pb-28"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to={paths.input} />}
          right={
            <>
              <SavedIndicator visible={savedVisible} />
              <UndoRedoToolbar
                canUndo={canUndo && !isBusy}
                canRedo={canRedo && !isBusy}
                onUndo={undo}
                onRedo={redo}
              />
              <WorkflowNextLink
                to={paths.draft}
                disabled={!titleTrimmed || !hasAnySource || suggestingTitles}
                onClick={() => {
                  setDetails({ title: titleTrimmed });
                  markStepComplete("review");
                  requestAutoDraft();
                  saveToStorage();
                }}
              >
                Next: Draft
              </WorkflowNextLink>
            </>
          }
        />
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
      )}

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
            disabled={suggestingTitles}
            onChange={(e) => {
              setTitleSuggestions([]);
              setTitle(e.target.value);
            }}
            className="w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none"
          />
          {!titleTrimmed && (
            <p className="font-body-sm text-body-sm text-error">A document title is required.</p>
          )}
          {titleSuggestions.length > 0 && (
            <TitleSuggestionsList
              suggestions={titleSuggestions}
              onSelect={(suggestion) => {
                pushTitle(suggestion);
                setTitleSuggestions([]);
              }}
            />
          )}
          <div className="flex justify-end">
            <SuggestTitlesButton
              onClick={handleSuggestTitles}
              loading={suggestingTitles}
              disabled={!hasAnySource}
            />
          </div>
          <SectionCitationsPanel
            citations={titleCitations}
            uploadedFiles={uploadedFiles}
            pastedText={inputSources.pastedText}
            cachedRemoteSources={cachedRemoteSources}
          />
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
