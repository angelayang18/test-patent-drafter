import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AutoResizeTextarea } from "../components/AutoResizeTextarea";
import { GenerationProgress } from "../components/GenerationProgress";
import { HorizontalSplitPane } from "../components/HorizontalSplitPane";
import { MidWorkflowUpload } from "../components/MidWorkflowUpload";
import { ReviewAiField } from "../components/ReviewAiField";
import { ReviewDetailsPane } from "../components/ReviewDetailsPane";
import {
  computeCoreFieldEmptiness,
  ReviewEmptyFieldsBanner,
} from "../components/ReviewEmptyFieldsBanner";
import { ReviewSourceMaterialPanel } from "../components/ReviewSourceMaterialPanel";
import { SectionCitationsPanel } from "../components/SectionCitationsPanel";
import { SelectionRegeneratePopover } from "../components/SelectionRegeneratePopover";
import { SavedIndicator, useSavedIndicator } from "../components/SavedIndicator";
import { SuggestTitlesButton, TitleSuggestionsList } from "../components/TitleSuggestions";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowBackLink, WorkflowNextLink } from "../components/WorkflowNavButtons";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultGrantDetails, defaultInvention } from "../types/patent";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { useTextareaSelectionRegenerate } from "../hooks/useTextareaSelectionRegenerate";
import {
  GRANT_CORE_FIELD_KEYS,
  GRANT_REVIEW_FIELDS as GRANT_REVIEW_FIELD_DEFS,
} from "../constants/grantFields";
import {
  PATENT_CORE_FIELD_KEYS,
  PATENT_REVIEW_FIELDS as PATENT_REVIEW_FIELD_DEFS,
} from "../constants/patentFields";
import {
  GRANT_CITATION_FIELD_LABELS,
  PATENT_CITATION_FIELD_LABELS,
} from "../constants/reviewFieldCitationLabels";
import {
  ApiError,
  extractionNotesFromSources,
  extractGrant,
  extractGrantField,
  extractInvention,
  extractInventionField,
  regenerateSelection,
  suggestTitles,
  type ExtractableGrantField,
  type ExtractableInventionField,
} from "../services/api";
import type { GrantDetails, InventionDetails } from "../types/patent";
import {
  computeExtractionSourceKey,
  hasExtractedGrantReviewContent,
  hasExtractedReviewContent,
  hasSourceMaterialConfigured,
  needsExtraction,
  needsGrantExtraction,
} from "../utils/extractionSourceKey";
import { SourceGatherError } from "../utils/gatherSourceText";
import { buildReviewFieldValues } from "../utils/resolveCitationPreviewSource";
import "../styles/patent-drafter.css";

const TITLE_MAX_LENGTH = 500;

function hasCoreReviewFieldContent(
  details: InventionDetails,
  key: (typeof PATENT_CORE_FIELD_KEYS)[number],
): boolean {
  const value = details[key];
  return typeof value === "string" && value.trim().length > 0;
}

/** Review fields with multiline flag for the patent Review UI. */
const REVIEW_FIELDS = PATENT_REVIEW_FIELD_DEFS.map((field) => ({
  ...field,
  multiline: true as const,
}));

/** Review fields with multiline flag for grant mode on the patent Review UI. */
const GRANT_REVIEW_FIELDS = GRANT_REVIEW_FIELD_DEFS.map((field) => ({
  ...field,
  multiline: true as const,
}));

export default function Review() {
  const navigate = useNavigate();
  const {
    workflowMode,
    invention,
    grantDetails,
    setInvention,
    setGrantDetails,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    fieldCitations,
    setFieldCitations,
    gatherSourceText,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
    extractionSourceKey,
    setExtractionSourceKey,
    workflowResetting,
  } = usePatentWorkflow();

  const isGrant = workflowMode === "grant";
  const reviewData = isGrant ? grantDetails : invention;

  const patentUndo = useUndoRedo<InventionDetails>(invention ?? defaultInvention);
  const grantUndo = useUndoRedo<GrantDetails>(grantDetails ?? defaultGrantDetails);
  const form = isGrant ? grantUndo.value : patentUndo.value;
  const undo = isGrant ? grantUndo.undo : patentUndo.undo;
  const redo = isGrant ? grantUndo.redo : patentUndo.redo;
  const canUndo = isGrant ? grantUndo.canUndo : patentUndo.canUndo;
  const canRedo = isGrant ? grantUndo.canRedo : patentUndo.canRedo;
  const pushForm = (next: InventionDetails | GrantDetails) => {
    if (isGrant) {
      grantUndo.push(next as GrantDetails);
    } else {
      patentUndo.push(next as InventionDetails);
    }
  };

  const [regeneratingFields, setRegeneratingFields] = useState<Set<string>>(
    new Set(),
  );
  const [regeneratingSelection, setRegeneratingSelection] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [suggestingTitles, setSuggestingTitles] = useState(false);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();
  const flashSavedRef = useRef(flashSaved);
  flashSavedRef.current = flashSaved;

  const initialSynced = useRef(false);
  const suppressSavedIndicator = useRef(true);
  const autoExtractStarted = useRef(false);
  const formRef = useRef<InventionDetails | GrantDetails>(form);
  const selectionFieldRef = useRef<string | null>(null);

  const reviewFields = isGrant ? GRANT_REVIEW_FIELDS : REVIEW_FIELDS;

  const reviewFieldValues = useMemo(
    () =>
      buildReviewFieldValues(
        isGrant ? GRANT_CITATION_FIELD_LABELS : PATENT_CITATION_FIELD_LABELS,
        form as unknown as Record<string, unknown>,
      ),
    [form, isGrant],
  );

  const isBusy = regeneratingFields.size > 0 || regeneratingSelection || suggestingTitles;
  const {
    selection: textareaSelection,
    dismiss: dismissSelectionPopover,
    handleMouseUp,
    handleKeyUp,
  } = useTextareaSelectionRegenerate(isBusy);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (reviewData && !initialSynced.current) {
      if (isGrant) {
        grantUndo.reset(reviewData as GrantDetails);
      } else {
        patentUndo.reset(reviewData as InventionDetails);
      }
      initialSynced.current = true;
      window.setTimeout(() => {
        suppressSavedIndicator.current = false;
      }, 0);
    }
  }, [reviewData, isGrant, grantUndo, patentUndo]);

  useEffect(() => {
    if (workflowResetting) {
      return;
    }
    if (!reviewData) {
      navigate("/patent", { replace: true });
    }
  }, [reviewData, navigate, workflowResetting]);

  // Persist form → context/storage. May recreate reviewData/saveToStorage identities.
  useEffect(() => {
    if (workflowResetting || !reviewData) {
      return;
    }
    if (isGrant) {
      setGrantDetails(form as GrantDetails);
    } else {
      setInvention(form as InventionDetails);
    }
    saveToStorage();
  }, [form, reviewData, isGrant, setInvention, setGrantDetails, saveToStorage, workflowResetting]);

  // Flash immediately on form edits (each keystroke extends the 2s window via flash()).
  // Do not debounce: a delayed flash leaves a gap where a prior hide timer can blank the
  // indicator before the new flash runs — that was the vanishing-"Saved" flicker.
  const hasReviewDataRef = useRef(Boolean(reviewData));
  hasReviewDataRef.current = Boolean(reviewData);
  useEffect(() => {
    if (workflowResetting || !hasReviewDataRef.current || suppressSavedIndicator.current) {
      return;
    }
    flashSavedRef.current();
  }, [form, workflowResetting]);

  const extractionNotes = extractionNotesFromSources(inputSources);

  const rememberExtractionSources = (
    sourceCache: typeof cachedRemoteSources = cachedRemoteSources,
  ) => {
    const key = computeExtractionSourceKey(uploadedFiles, inputSources, sourceCache);
    setExtractionSourceKey(key);
    return key;
  };

  useEffect(() => {
    if (autoExtractStarted.current || !reviewData) {
      return;
    }

    if (
      !extractionSourceKey &&
      (isGrant
        ? hasExtractedGrantReviewContent(reviewData as GrantDetails)
        : hasExtractedReviewContent(reviewData as InventionDetails)) &&
      hasSourceMaterialConfigured(uploadedFiles, inputSources, cachedRemoteSources)
    ) {
      rememberExtractionSources();
      autoExtractStarted.current = true;
      return;
    }

    const shouldExtract = isGrant
      ? needsGrantExtraction(
          grantDetails,
          extractionSourceKey,
          uploadedFiles,
          inputSources,
          cachedRemoteSources,
        )
      : needsExtraction(
          invention,
          extractionSourceKey,
          uploadedFiles,
          inputSources,
          cachedRemoteSources,
        );

    if (!shouldExtract) {
      autoExtractStarted.current = true;
      return;
    }

    autoExtractStarted.current = true;

    const runAutoExtraction = async () => {
      setError(null);
      setRegeneratingFields((prev) => new Set(prev).add("all"));
      suppressSavedIndicator.current = true;
      try {
        const { combined, cache } = await gatherSourceText({
          onProgress: setExtractPhase,
        });
        if (!combined.trim()) {
          setError("No source material available. Go back to Input and add sources.");
          return;
        }
        setExtractPhase(
          isGrant
            ? "Extracting grant application details (parallel AI analysis)…"
            : "Extracting invention details (parallel AI analysis)…",
        );
        const result = isGrant
          ? await extractGrant(combined, extractionNotes)
          : await extractInvention(combined, extractionNotes);
        if (isGrant) {
          grantUndo.reset(result.details as GrantDetails);
          setGrantDetails(result.details as GrantDetails);
        } else {
          patentUndo.reset(result.details as InventionDetails);
          setInvention(result.details as InventionDetails);
        }
        setFieldCitations(result.citations);
        rememberExtractionSources(cache);
        saveToStorage();
      } catch (err) {
        if (err instanceof SourceGatherError) {
          setError(err.message);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Extraction failed.");
      } finally {
        setRegeneratingFields((prev) => {
          const next = new Set(prev);
          next.delete("all");
          return next;
        });
        setExtractPhase(null);
        window.setTimeout(() => {
          suppressSavedIndicator.current = false;
        }, 0);
      }
    };

    void runAutoExtraction();
  }, [
    reviewData,
    isGrant,
    invention,
    grantDetails,
    extractionSourceKey,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    gatherSourceText,
    extractionNotes,
    grantUndo,
    patentUndo,
    setInvention,
    setGrantDetails,
    setFieldCitations,
    saveToStorage,
    setExtractionSourceKey,
  ]);

  const handleRegenerateAll = async () => {
    setError(null);
    setRegeneratingFields((prev) => new Set(prev).add("all"));
    pushForm(structuredClone(form));
    try {
      const { combined, cache } = await gatherSourceText();
      if (!combined.trim()) {
        setError("No source material available. Go back to Input and add sources.");
        return;
      }
      const result = isGrant
        ? await extractGrant(combined, extractionNotes)
        : await extractInvention(combined, extractionNotes);
      pushForm(result.details);
      if (isGrant) {
        setGrantDetails(result.details as GrantDetails);
      } else {
        setInvention(result.details as InventionDetails);
      }
      setFieldCitations(result.citations);
      rememberExtractionSources(cache);
      saveToStorage();
      flashSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Regeneration failed.");
    } finally {
      setRegeneratingFields((prev) => {
        const next = new Set(prev);
        next.delete("all");
        return next;
      });
    }
  };

  const handleRegenerateField = (field: string) => {
    if (regeneratingFields.has(field) || regeneratingFields.has("all") || regeneratingSelection) {
      return;
    }

    setError(null);
    pushForm(structuredClone(formRef.current));
    setRegeneratingFields((prev) => new Set(prev).add(field));

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available. Go back to Input and add sources.");
          return;
        }
        const result = isGrant
          ? await extractGrantField(
              combined,
              field as ExtractableGrantField,
              formRef.current as GrantDetails,
              extractionNotes,
            )
          : await extractInventionField(
              combined,
              field as ExtractableInventionField,
              formRef.current as InventionDetails,
              extractionNotes,
            );
        const next = { ...formRef.current, ...result.details };
        formRef.current = next;
        pushForm(next);
        setFieldCitations(result.citations);
        if (field === "invention_title" || field === "project_title") {
          setTitleSuggestions([]);
        }
        if (isGrant) {
          setGrantDetails(next as GrantDetails);
        } else {
          setInvention(next as InventionDetails);
        }
        saveToStorage();
        flashSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Regeneration failed.");
      } finally {
        setRegeneratingFields((prev) => {
          const next = new Set(prev);
          next.delete(field);
          return next;
        });
      }
    })();
  };

  const handleSuggestTitles = () => {
    if (suggestingTitles || regeneratingFields.size > 0 || regeneratingSelection) {
      return;
    }

    setError(null);
    setSuggestingTitles(true);

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available. Go back to Input and add sources.");
          return;
        }
        const currentTitle = isGrant
          ? ((formRef.current as GrantDetails).project_title ?? "")
          : ((formRef.current as InventionDetails).invention_title ?? "");
        const titles = await suggestTitles(
          combined,
          isGrant ? "grant" : "patent",
          currentTitle,
          extractionNotes,
        );
        setTitleSuggestions(titles);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Title suggestion failed.");
      } finally {
        setSuggestingTitles(false);
      }
    })();
  };

  const getFieldText = (fieldKey: string): string => {
    const current = formRef.current as unknown as Record<string, unknown>;
    if (!isGrant && fieldKey === "alternative_embodiments") {
      return ((current.alternative_embodiments as string[]) ?? []).join("\n");
    }
    const value = current[fieldKey];
    return typeof value === "string" ? value : "";
  };

  const applyFieldText = (fieldKey: string, text: string) => {
    if (!isGrant && fieldKey === "alternative_embodiments") {
      const embodiments = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const next = {
        ...(formRef.current as InventionDetails),
        alternative_embodiments: embodiments,
      };
      formRef.current = next;
      pushForm(next);
      setInvention(next);
      return;
    }

    const next = { ...formRef.current, [fieldKey]: text };
    formRef.current = next;
    pushForm(next);
    if (isGrant) {
      setGrantDetails(next as GrantDetails);
    } else {
      setInvention(next as InventionDetails);
    }
  };

  const handleConfirmSelectionRegenerate = (instruction: string) => {
    const fieldKey = selectionFieldRef.current;
    if (!fieldKey || !textareaSelection) return;

    setError(null);
    setRegeneratingSelection(true);
    pushForm(structuredClone(formRef.current));

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available. Go back to Input and add sources.");
          dismissSelectionPopover();
          return;
        }

        const fullFieldText = getFieldText(fieldKey);
        const replacement = await regenerateSelection(
          combined,
          fullFieldText,
          textareaSelection.text,
          instruction,
        );
        const newText =
          fullFieldText.slice(0, textareaSelection.start) +
          replacement +
          fullFieldText.slice(textareaSelection.end);
        applyFieldText(fieldKey, newText);
        saveToStorage();
        flashSaved();
        dismissSelectionPopover();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Selection rewrite failed.");
      } finally {
        setRegeneratingSelection(false);
      }
    })();
  };

  const selectionHandlers = (fieldKey: string) => ({
    onMouseUp: (event: React.MouseEvent<HTMLTextAreaElement>) => {
      selectionFieldRef.current = fieldKey;
      handleMouseUp(event);
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      selectionFieldRef.current = fieldKey;
      handleKeyUp(event);
    },
  });

  const updateField = (key: string, value: string | string[]) => {
    if (isGrant) {
      grantUndo.replace({ ...(form as GrantDetails), [key]: value });
    } else {
      patentUndo.replace({ ...(form as InventionDetails), [key]: value });
    }
  };

  const selectTitleSuggestion = (title: string) => {
    const applied =
      !isGrant && title.length > TITLE_MAX_LENGTH
        ? title.slice(0, TITLE_MAX_LENGTH)
        : title;
    updateField(isGrant ? "project_title" : "invention_title", applied);
    setTitleSuggestions([]);
  };

  const fieldDisabled = (fieldKey: string) =>
    regeneratingFields.has(fieldKey) || regeneratingSelection;

  const { allCoreFieldsEmpty, someCoreFieldsEmpty } = useMemo(() => {
    if (isGrant) {
      const grantForm = form as GrantDetails;
      return computeCoreFieldEmptiness(
        GRANT_CORE_FIELD_KEYS.map((key) =>
          typeof grantForm[key] === "string" ? grantForm[key] : "",
        ),
      );
    }
    const patentForm = form as InventionDetails;
    return computeCoreFieldEmptiness(
      PATENT_CORE_FIELD_KEYS.map((key) =>
        hasCoreReviewFieldContent(patentForm, key) ? (patentForm[key] as string) : "",
      ),
    );
  }, [form, isGrant]);

  const textareaClassName =
    "w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none";

  const titleLength = isGrant
    ? ((form as GrantDetails).project_title?.length ?? 0)
    : ((form as InventionDetails).invention_title?.length ?? 0);
  const titleTooLong = !isGrant && titleLength > TITLE_MAX_LENGTH;

  const renderFieldValue = (field: (typeof reviewFields)[number]) => {
    if (!isGrant && field.key === "alternative_embodiments") {
      const altText = ((form as InventionDetails).alternative_embodiments ?? []).join("\n");
      return (
        <AutoResizeTextarea
          className={textareaClassName}
          value={altText}
          disabled={fieldDisabled(field.key)}
          {...selectionHandlers(field.key)}
          onChange={(e) =>
            updateField(
              "alternative_embodiments",
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      );
    }

    if (!isGrant && field.key === "invention_title") {
      const titleValue =
        typeof (form as InventionDetails).invention_title === "string"
          ? (form as InventionDetails).invention_title
          : "";
      const length = titleValue.length;
      const nearLimit = length >= TITLE_MAX_LENGTH - 50;
      const atOrOverLimit = length >= TITLE_MAX_LENGTH;

      return (
        <>
          <AutoResizeTextarea
            className={textareaClassName}
            value={titleValue}
            maxLength={TITLE_MAX_LENGTH}
            disabled={fieldDisabled(field.key)}
            {...selectionHandlers(field.key)}
            onChange={(e) => {
              setTitleSuggestions([]);
              updateField("invention_title", e.target.value);
            }}
          />
          <div className="flex flex-col items-end gap-1">
            <p
              className={`font-body-sm text-body-sm ${nearLimit ? "text-error" : "text-on-surface-variant"}`}
            >
              {length} / {TITLE_MAX_LENGTH}
            </p>
            {atOrOverLimit && (
              <p className="font-body-sm text-body-sm text-error">
                Title must be 500 characters or fewer.
              </p>
            )}
          </div>
          {titleSuggestions.length > 0 && (
            <TitleSuggestionsList
              suggestions={titleSuggestions}
              enforceMaxLength
              maxLength={TITLE_MAX_LENGTH}
              onSelect={selectTitleSuggestion}
            />
          )}
        </>
      );
    }

    const value = (form as unknown as Record<string, unknown>)[field.key];
    if (field.multiline) {
      const isProjectTitle = isGrant && field.key === "project_title";
      return (
        <>
          <AutoResizeTextarea
            className={textareaClassName}
            value={typeof value === "string" ? value : ""}
            disabled={fieldDisabled(field.key)}
            {...selectionHandlers(field.key)}
            onChange={(e) => {
              if (isProjectTitle) {
                setTitleSuggestions([]);
              }
              updateField(field.key, e.target.value);
            }}
          />
          {isProjectTitle && titleSuggestions.length > 0 && (
            <TitleSuggestionsList
              suggestions={titleSuggestions}
              onSelect={selectTitleSuggestion}
            />
          )}
        </>
      );
    }

    return null;
  };

  return (
    <AppShell
      step="review"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/patent" />}
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
                to="/patent/draft"
                disabled={allCoreFieldsEmpty || titleTooLong}
                onClick={() => {
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
        <div className="mx-margin-desktop mt-4 p-4 rounded-lg bg-error-container/20 text-error text-sm shrink-0">
          {error}
        </div>
      )}

      {isBusy && (
        <div className="mx-margin-desktop mt-4 shrink-0">
          <GenerationProgress
            active
            label={
              extractPhase ??
              (regeneratingFields.has("all")
                ? isGrant
                  ? "Regenerating all grant fields"
                  : "Regenerating all invention fields"
                : regeneratingFields.size > 1
                  ? `Regenerating ${regeneratingFields.size} fields`
                  : `Regenerating ${reviewFields.find((f) => regeneratingFields.has(f.key))?.label ?? "field"}`)
            }
          />
        </div>
      )}

      <HorizontalSplitPane
        storageKey="patent-drafter-review-split"
        defaultLeftPercent={40}
        left={
          <ReviewSourceMaterialPanel
            uploadedFiles={uploadedFiles}
            cachedRemoteSources={cachedRemoteSources}
            relevantContentNotes={inputSources.relevantContentNotes}
            irrelevantContentNotes={inputSources.irrelevantContentNotes}
            pastedText={inputSources.pastedText}
            subtitle={
              isGrant
                ? "Files and text used to extract grant details."
                : "Files and text used to extract invention details."
            }
            footer={<MidWorkflowUpload />}
          />
        }
        right={
          <ReviewDetailsPane
            title={isGrant ? "Extracted Grant Details" : "Extracted Invention Details"}
            description={
              isGrant
                ? "Edit fields below, then continue to draft grant application sections."
                : "Edit fields below, then continue to draft full patent sections."
            }
            onRegenerateAll={() => void handleRegenerateAll()}
            regeneratingAll={regeneratingFields.has("all")}
            isBusy={isBusy}
          >
            <ReviewEmptyFieldsBanner
              allCoreFieldsEmpty={allCoreFieldsEmpty}
              someCoreFieldsEmpty={someCoreFieldsEmpty}
              detailNoun={isGrant ? "grant detail" : "invention detail"}
            />
            {reviewFields.map((field) => {
              const isTitleField =
                field.key === "invention_title" || field.key === "project_title";
              return (
                <div key={field.key} className="space-y-4">
                  <ReviewAiField
                    label={field.label}
                    hint={field.hint}
                    onRegenerate={() => handleRegenerateField(field.key)}
                    regenerating={regeneratingFields.has(field.key)}
                    extraActions={
                      isTitleField ? (
                        <SuggestTitlesButton
                          onClick={handleSuggestTitles}
                          loading={suggestingTitles}
                          disabled={isBusy}
                        />
                      ) : undefined
                    }
                  >
                    {renderFieldValue(field)}
                  </ReviewAiField>
                  <SectionCitationsPanel
                    citations={fieldCitations[field.key] ?? []}
                    uploadedFiles={uploadedFiles}
                    pastedText={inputSources.pastedText}
                    cachedRemoteSources={cachedRemoteSources}
                    reviewFieldValues={reviewFieldValues}
                  />
                </div>
              );
            })}
          </ReviewDetailsPane>
        }
      />
      <SelectionRegeneratePopover
        anchorRect={textareaSelection?.anchorRect ?? null}
        loading={regeneratingSelection}
        onConfirm={handleConfirmSelectionRegenerate}
        onDismiss={dismissSelectionPopover}
      />
    </AppShell>
  );
}
