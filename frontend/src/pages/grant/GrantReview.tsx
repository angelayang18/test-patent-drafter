import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AutoResizeTextarea } from "../../components/AutoResizeTextarea";
import { GrantAppShell } from "../../components/GrantAppShell";
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
import { GRANT_CORE_FIELD_KEYS, GRANT_REVIEW_FIELDS } from "../../constants/grantFields";
import { GRANT_CITATION_FIELD_LABELS } from "../../constants/reviewFieldCitationLabels";
import { useGrantWorkflow } from "../../context/GrantWorkflowContext";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import { useTextareaSelectionRegenerate } from "../../hooks/useTextareaSelectionRegenerate";
import {
  ApiError,
  extractionNotesFromSources,
  extractGrant,
  extractGrantField,
  regenerateSelection,
  suggestTitles,
  type ExtractableGrantField,
} from "../../services/api";
import { defaultGrantDetails, type GrantDetails } from "../../types/patent";
import { buildReviewFieldValues } from "../../utils/resolveCitationPreviewSource";
import "../../styles/patent-drafter.css";

const TEXTAREA_CLASS =
  "w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none";

export default function GrantReview() {
  const navigate = useNavigate();
  const {
    grantDetails,
    setGrantDetails,
    inputSources,
    uploadedFiles,
    cachedRemoteSources,
    fieldCitations,
    setFieldCitations,
    gatherSourceText,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
  } = useGrantWorkflow();

  const {
    value: form,
    replace,
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoRedo<GrantDetails>(grantDetails ?? defaultGrantDetails);
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
  const hasDetailsRef = useRef(Boolean(grantDetails));
  hasDetailsRef.current = Boolean(grantDetails);

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
        GRANT_CITATION_FIELD_LABELS,
        form as unknown as Record<string, unknown>,
      ),
    [form],
  );

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!grantDetails) {
      navigate("/grant/input", { replace: true });
      return;
    }
    if (!initialSynced.current) {
      reset(grantDetails);
      initialSynced.current = true;
      window.setTimeout(() => {
        suppressSavedIndicator.current = false;
      }, 0);
    }
  }, [grantDetails, navigate, reset]);

  useEffect(() => {
    if (!grantDetails) return;
    setGrantDetails(form);
    saveToStorage();
  }, [form, grantDetails, setGrantDetails, saveToStorage]);

  useEffect(() => {
    if (!hasDetailsRef.current || suppressSavedIndicator.current) {
      return;
    }
    flashSavedRef.current();
  }, [form]);

  const extractionNotes = extractionNotesFromSources(inputSources);

  const { allCoreFieldsEmpty, someCoreFieldsEmpty } = useMemo(
    () =>
      computeCoreFieldEmptiness(
        GRANT_CORE_FIELD_KEYS.map((key) => form[key] ?? ""),
      ),
    [form],
  );

  const updateField = (key: ExtractableGrantField, value: string) => {
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

  const handleRegenerateField = (field: ExtractableGrantField) => {
    if (regenerating.has(field) || regenerating.has("all") || regeneratingSelection) return;
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
        const result = await extractGrantField(
          combined,
          field,
          formRef.current,
          extractionNotes,
        );
        const next = { ...formRef.current, ...result.details };
        formRef.current = next;
        push(next);
        setFieldCitations(result.citations);
        if (field === "project_title") {
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
        const result = await extractGrant(combined, extractionNotes);
        push(result.details);
        setGrantDetails(result.details);
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
          "grant",
          formRef.current.project_title,
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
    const fieldKey = selectionFieldRef.current as ExtractableGrantField | null;
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
        setGrantDetails(next);
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
    <GrantAppShell
      step="review"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/grant/input" />}
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
                to="/grant/draft"
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
                    ? "Regenerating all grant fields"
                    : regenerating.size > 1
                      ? `Regenerating ${regenerating.size} fields`
                      : `Regenerating ${GRANT_REVIEW_FIELDS.find((f) => regenerating.has(f.key))?.label ?? "field"}`)
            }
          />
        </div>
      )}

      <HorizontalSplitPane
        storageKey="grant-drafter-review-split"
        defaultLeftPercent={40}
        left={
          <ReviewSourceMaterialPanel
            uploadedFiles={uploadedFiles}
            cachedRemoteSources={cachedRemoteSources}
            relevantContentNotes={inputSources.relevantContentNotes}
            irrelevantContentNotes={inputSources.irrelevantContentNotes}
            pastedText={inputSources.pastedText}
            subtitle="Files and text used to extract grant details."
          />
        }
        right={
          <ReviewDetailsPane
            title="Extracted Grant Details"
            description="Edit fields below, then continue to draft grant application sections."
            onRegenerateAll={() => void handleRegenerateAll()}
            regeneratingAll={regenerating.has("all")}
            isBusy={isBusy}
          >
            <ReviewEmptyFieldsBanner
              allCoreFieldsEmpty={allCoreFieldsEmpty}
              someCoreFieldsEmpty={someCoreFieldsEmpty}
              detailNoun="grant detail"
            />
            {GRANT_REVIEW_FIELDS.map((field) => {
              const isTitleField = field.key === "project_title";
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
                          push({ ...form, project_title: title });
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
    </GrantAppShell>
  );
}
