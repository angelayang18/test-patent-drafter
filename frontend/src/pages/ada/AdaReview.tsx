import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AutoResizeTextarea } from "../../components/AutoResizeTextarea";
import { AdaAppShell } from "../../components/AdaAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { HorizontalSplitPane } from "../../components/HorizontalSplitPane";
import { ReviewAiField } from "../../components/ReviewAiField";
import { ReviewDetailsPane } from "../../components/ReviewDetailsPane";
import {
  computeCoreFieldEmptiness,
  ReviewEmptyFieldsBanner,
} from "../../components/ReviewEmptyFieldsBanner";
import { ReviewSourceMaterialPanel } from "../../components/ReviewSourceMaterialPanel";
import { SavedIndicator, useSavedIndicator } from "../../components/SavedIndicator";
import { SectionCitationsPanel } from "../../components/SectionCitationsPanel";
import { SelectionRegeneratePopover } from "../../components/SelectionRegeneratePopover";
import { SuggestTitlesButton, TitleSuggestionsList } from "../../components/TitleSuggestions";
import { UndoRedoToolbar } from "../../components/UndoRedoToolbar";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { ADA_CORE_FIELD_KEYS, ADA_REVIEW_FIELDS } from "../../constants/adaFields";
import { ADA_CITATION_FIELD_LABELS } from "../../constants/reviewFieldCitationLabels";
import { useAdaWorkflow } from "../../context/AdaWorkflowContext";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useTextareaSelectionRegenerate } from "../../hooks/useTextareaSelectionRegenerate";
import {
  ApiError,
  extractionNotesFromSources,
  extractAda,
  extractAdaField,
  regenerateSelection,
  suggestTitles,
  type ExtractableAdaField,
} from "../../services/api";
import { defaultAdaDetails, type ADADetails } from "../../types/patent";
import { buildReviewFieldValues } from "../../utils/resolveCitationPreviewSource";
import "../../styles/patent-drafter.css";

const TEXTAREA_CLASS =
  "w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none";

export default function AdaReview() {
  const navigate = useNavigate();
  const {
    adaDetails,
    setAdaDetails,
    inputSources,
    uploadedFiles,
    cachedRemoteSources,
    fieldCitations,
    setFieldCitations,
    gatherSourceText,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
  } = useAdaWorkflow();

  const {
    value: form,
    replace,
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoRedo<ADADetails>(adaDetails ?? defaultAdaDetails);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [regeneratingSelection, setRegeneratingSelection] = useState(false);
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [suggestingTitles, setSuggestingTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();
  const flashSavedRef = useRef(flashSaved);
  flashSavedRef.current = flashSaved;
  const formRef = useRef(form);
  const selectionFieldRef = useRef<string | null>(null);
  const initialSynced = useRef(false);
  const suppressSavedIndicator = useRef(true);
  const hasDetailsRef = useRef(Boolean(adaDetails));
  hasDetailsRef.current = Boolean(adaDetails);

  const isBusy = regenerating.size > 0 || regeneratingSelection || suggestingTitles;
  const {
    selection: textareaSelection,
    dismiss: dismissSelectionPopover,
    handleMouseUp,
    handleKeyUp,
  } = useTextareaSelectionRegenerate(isBusy);

  const reviewFieldValues = useMemo(
    () =>
      buildReviewFieldValues(
        ADA_CITATION_FIELD_LABELS,
        form as unknown as Record<string, unknown>,
      ),
    [form],
  );

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!adaDetails) {
      navigate("/ada/input", { replace: true });
      return;
    }
    if (!initialSynced.current) {
      reset(adaDetails);
      initialSynced.current = true;
      window.setTimeout(() => {
        suppressSavedIndicator.current = false;
      }, 0);
    }
  }, [adaDetails, navigate, reset]);

  useEffect(() => {
    if (!adaDetails) return;
    setAdaDetails(form);
    saveToStorage();
  }, [form, adaDetails, setAdaDetails, saveToStorage]);

  useEffect(() => {
    if (!hasDetailsRef.current || suppressSavedIndicator.current) {
      return;
    }
    flashSavedRef.current();
  }, [form]);

  const extractionNotes = extractionNotesFromSources(inputSources);

  const { allCoreFieldsEmpty, someCoreFieldsEmpty } = useMemo(
    () =>
      computeCoreFieldEmptiness(ADA_CORE_FIELD_KEYS.map((key) => form[key] ?? "")),
    [form],
  );

  const updateField = (key: ExtractableAdaField, value: string) => {
    replace({ ...form, [key]: value });
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

  const fieldDisabled = (fieldKey: string) =>
    regenerating.has(fieldKey) || regenerating.has("all") || regeneratingSelection;

  const handleRegenerateField = (field: ExtractableAdaField) => {
    if (
      regenerating.has(field) ||
      regenerating.has("all") ||
      suggestingTitles ||
      regeneratingSelection
    ) {
      return;
    }
    setRegenerating((prev) => new Set(prev).add(field));
    setError(null);
    push(structuredClone(formRef.current));

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const result = await extractAdaField(
          combined,
          field,
          formRef.current,
          extractionNotes,
        );
        const next = { ...formRef.current, ...result.details };
        formRef.current = next;
        push(next);
        setFieldCitations(result.citations);
        if (field === "study_title") {
          setTitleSuggestions([]);
        }
        flashSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Re-extraction failed.");
      } finally {
        setRegenerating((prev) => {
          const next = new Set(prev);
          next.delete(field);
          return next;
        });
      }
    })();
  };

  const handleRegenerateAll = () => {
    if (suggestingTitles || regeneratingSelection) return;
    setRegenerating((prev) => new Set(prev).add("all"));
    setError(null);
    push(structuredClone(formRef.current));
    void (async () => {
      try {
        const { combined } = await gatherSourceText({ onProgress: setExtractPhase });
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const result = await extractAda(combined, extractionNotes);
        push(result.details);
        setAdaDetails(result.details);
        setFieldCitations(result.citations);
        setTitleSuggestions([]);
        flashSaved();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Extraction failed.");
      } finally {
        setRegenerating((prev) => {
          const next = new Set(prev);
          next.delete("all");
          return next;
        });
        setExtractPhase(null);
      }
    })();
  };

  const handleSuggestTitles = () => {
    if (suggestingTitles || regenerating.size > 0 || regeneratingSelection) return;
    setError(null);
    setSuggestingTitles(true);

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const titles = await suggestTitles(
          combined,
          "ada",
          formRef.current.study_title,
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

  const handleConfirmSelectionRegenerate = (instruction: string) => {
    const fieldKey = selectionFieldRef.current as ExtractableAdaField | null;
    if (!fieldKey || !textareaSelection) return;

    setError(null);
    setRegeneratingSelection(true);
    push(structuredClone(formRef.current));

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available.");
          dismissSelectionPopover();
          return;
        }

        const fullFieldText = formRef.current[fieldKey] ?? "";
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
        const next = { ...formRef.current, [fieldKey]: newText };
        formRef.current = next;
        push(next);
        setAdaDetails(next);
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

  return (
    <AdaAppShell
      step="review"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/ada/input" />}
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
                to="/ada/draft"
                disabled={allCoreFieldsEmpty || isBusy}
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
              suggestingTitles
                ? "Suggesting titles…"
                : extractPhase ??
                  (regenerating.has("all")
                    ? "Regenerating all ADA fields"
                    : regenerating.size > 1
                      ? `Regenerating ${regenerating.size} fields`
                      : `Regenerating ${ADA_REVIEW_FIELDS.find((f) => regenerating.has(f.key))?.label ?? "field"}`)
            }
          />
        </div>
      )}

      <HorizontalSplitPane
        storageKey="ada-drafter-review-split"
        defaultLeftPercent={40}
        left={
          <ReviewSourceMaterialPanel
            uploadedFiles={uploadedFiles}
            cachedRemoteSources={cachedRemoteSources}
            relevantContentNotes={inputSources.relevantContentNotes}
            irrelevantContentNotes={inputSources.irrelevantContentNotes}
            pastedText={inputSources.pastedText}
            subtitle="Files and text used to extract ADA study details."
          />
        }
        right={
          <ReviewDetailsPane
            title="Extracted ADA Study Details"
            description="Edit fields below, then continue to draft ADA report sections."
            onRegenerateAll={() => void handleRegenerateAll()}
            regeneratingAll={regenerating.has("all")}
            isBusy={isBusy}
          >
            <ReviewEmptyFieldsBanner
              allCoreFieldsEmpty={allCoreFieldsEmpty}
              someCoreFieldsEmpty={someCoreFieldsEmpty}
              detailNoun="ADA study detail"
            />
            {ADA_REVIEW_FIELDS.map((field) => {
              const isTitleField = field.key === "study_title";
              return (
                <div key={field.key} className="space-y-4">
                  <ReviewAiField
                    label={field.label}
                    hint={field.hint}
                    onRegenerate={() => handleRegenerateField(field.key)}
                    regenerating={regenerating.has(field.key)}
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
                    <AutoResizeTextarea
                      className={TEXTAREA_CLASS}
                      value={form[field.key]}
                      disabled={fieldDisabled(field.key)}
                      {...selectionHandlers(field.key)}
                      onChange={(e) => {
                        if (isTitleField) {
                          setTitleSuggestions([]);
                        }
                        updateField(field.key, e.target.value);
                      }}
                    />
                    {isTitleField && titleSuggestions.length > 0 && (
                      <TitleSuggestionsList
                        suggestions={titleSuggestions}
                        onSelect={(title) => {
                          push({ ...form, study_title: title });
                          setTitleSuggestions([]);
                        }}
                      />
                    )}
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
    </AdaAppShell>
  );
}
