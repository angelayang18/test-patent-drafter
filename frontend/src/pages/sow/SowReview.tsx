import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AutoResizeTextarea } from "../../components/AutoResizeTextarea";
import { SowAppShell } from "../../components/SowAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { SOW_CORE_FIELD_KEYS, SOW_REVIEW_FIELDS } from "../../constants/sowFields";
import { useSowWorkflow } from "../../context/SowWorkflowContext";
import {
  ApiError,
  extractionNotesFromSources,
  extractSow,
  extractSowField,
  type ExtractableSowField,
} from "../../services/api";
import { defaultSowDetails, type SOWDetails } from "../../types/patent";
import "../../styles/patent-drafter.css";

export default function SowReview() {
  const navigate = useNavigate();
  const {
    sowDetails,
    setSowDetails,
    inputSources,
    gatherSourceText,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
  } = useSowWorkflow();

  const [form, setForm] = useState<SOWDetails>(sowDetails ?? defaultSowDetails);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const formRef = useRef(form);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!sowDetails) {
      navigate("/sow/input", { replace: true });
      return;
    }
    setForm(sowDetails);
  }, [sowDetails, navigate]);

  useEffect(() => {
    if (!sowDetails) return;
    setSowDetails(form);
    saveToStorage();
  }, [form, sowDetails, setSowDetails, saveToStorage]);

  const extractionNotes = extractionNotesFromSources(inputSources);
  const isBusy = regenerating.size > 0;

  const coreFilled = SOW_CORE_FIELD_KEYS.filter(
    (key) => form[key]?.trim().length > 0,
  ).length;
  const allCoreEmpty = coreFilled === 0;

  const updateField = (key: ExtractableSowField, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegenerateField = (field: ExtractableSowField) => {
    if (regenerating.has(field) || regenerating.has("all")) return;
    setRegenerating((prev) => new Set(prev).add(field));
    setError(null);

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const patch = await extractSowField(
          combined,
          field,
          formRef.current,
          extractionNotes,
        );
        setForm((prev) => ({ ...prev, ...patch }));
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
    void (async () => {
      try {
        const { combined } = await gatherSourceText({ onProgress: setExtractPhase });
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const details = await extractSow(combined, extractionNotes);
        setForm(details);
        setSowDetails(details);
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
    <SowAppShell
      step="review"
      mainClassName="max-w-[900px] mx-auto px-margin-desktop py-10 pb-28"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/sow/input" />}
          right={
            <WorkflowNextLink
              to="/sow/draft"
              disabled={allCoreEmpty || isBusy}
              onClick={() => {
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
          <h1 className="font-headline-lg text-headline-lg text-primary">Review SOW details</h1>
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
        {SOW_REVIEW_FIELDS.map((field) => (
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
          </div>
        ))}
      </div>
    </SowAppShell>
  );
}
