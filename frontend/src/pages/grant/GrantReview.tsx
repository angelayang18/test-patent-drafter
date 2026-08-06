import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AutoResizeTextarea } from "../../components/AutoResizeTextarea";
import { GrantAppShell } from "../../components/GrantAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { SavedIndicator, useSavedIndicator } from "../../components/SavedIndicator";
import { SectionCitationsPanel } from "../../components/SectionCitationsPanel";
import { UndoRedoToolbar } from "../../components/UndoRedoToolbar";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { GRANT_CORE_FIELD_KEYS, GRANT_REVIEW_FIELDS } from "../../constants/grantFields";
import { useGrantWorkflow } from "../../context/GrantWorkflowContext";
import { useUndoRedo } from "../../hooks/useUndoRedo";
import {
  ApiError,
  extractionNotesFromSources,
  extractGrant,
  extractGrantField,
  type ExtractableGrantField,
} from "../../services/api";
import { defaultGrantDetails, type GrantDetails } from "../../types/patent";
import "../../styles/patent-drafter.css";

export default function GrantReview() {
  const navigate = useNavigate();
  const {
    grantDetails,
    setGrantDetails,
    inputSources,
    uploadedFiles,
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
  const [error, setError] = useState<string | null>(null);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();
  const flashSavedRef = useRef(flashSaved);
  flashSavedRef.current = flashSaved;
  const formRef = useRef(form);
  const initialSynced = useRef(false);
  const suppressSavedIndicator = useRef(true);
  const hasDetailsRef = useRef(Boolean(grantDetails));
  hasDetailsRef.current = Boolean(grantDetails);

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
  const isBusy = regenerating.size > 0;

  const coreFilled = GRANT_CORE_FIELD_KEYS.filter(
    (key) => form[key]?.trim().length > 0,
  ).length;
  const allCoreEmpty = coreFilled === 0;

  const updateField = (key: ExtractableGrantField, value: string) => {
    replace({ ...form, [key]: value });
  };

  const handleRegenerateField = (field: ExtractableGrantField) => {
    if (regenerating.has(field) || regenerating.has("all")) return;
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

  const textareaClassName =
    "w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none";

  return (
    <GrantAppShell
      step="review"
      mainClassName="max-w-[900px] mx-auto px-margin-desktop py-10 pb-28"
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
                disabled={allCoreEmpty || isBusy}
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
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
      )}

      {isBusy && (
        <div className="mb-6">
          <GenerationProgress
            active
            label={
              extractPhase ??
              (regenerating.has("all")
                ? "Re-extracting all fields"
                : "Re-extracting field…")
            }
          />
        </div>
      )}

      <div className="flex justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary">Review grant details</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Edit extracted fields or re-extract from your source material.
          </p>
        </div>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleRegenerateAll()}
          className="px-4 py-2 bg-secondary/10 text-secondary rounded-lg font-label-md text-label-md hover:bg-secondary/20 disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          <span
            className={`material-symbols-outlined text-sm ${regenerating.has("all") ? "loading-spin" : ""}`}
          >
            autorenew
          </span>
          Re-extract all
        </button>
      </div>

      {allCoreEmpty && (
        <div className="mb-6 p-4 rounded-lg bg-error-container/20 text-error text-sm">
          Fill in at least one core field before drafting.
        </div>
      )}

      <div className="space-y-8">
        {GRANT_REVIEW_FIELDS.map((field) => (
          <div key={field.key} className="space-y-3">
            <div>
              <label className="font-label-md text-label-md text-primary">{field.label}</label>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{field.hint}</p>
            </div>
            <AutoResizeTextarea
              className={textareaClassName}
              value={form[field.key]}
              disabled={regenerating.has(field.key) || regenerating.has("all")}
              onChange={(e) => updateField(field.key, e.target.value)}
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleRegenerateField(field.key)}
                className="flex items-center gap-2 text-secondary font-label-sm text-label-sm hover:underline disabled:opacity-50"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${regenerating.has(field.key) ? "loading-spin" : ""}`}
                >
                  autorenew
                </span>
                {regenerating.has(field.key) ? "Re-extracting…" : "Re-extract"}
              </button>
            </div>
            <SectionCitationsPanel
              citations={fieldCitations[field.key] ?? []}
              uploadedFiles={uploadedFiles}
            />
          </div>
        ))}
      </div>
    </GrantAppShell>
  );
}
