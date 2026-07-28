import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AutoResizeTextarea } from "../../components/AutoResizeTextarea";
import { AdaAppShell } from "../../components/AdaAppShell";
import { GenerationProgress } from "../../components/GenerationProgress";
import { SuggestTitlesButton, TitleSuggestionsList } from "../../components/TitleSuggestions";
import { WorkflowFooter } from "../../components/WorkflowFooter";
import { WorkflowBackLink, WorkflowNextLink } from "../../components/WorkflowNavButtons";
import { ADA_CORE_FIELD_KEYS, ADA_REVIEW_FIELDS } from "../../constants/adaFields";
import { useAdaWorkflow } from "../../context/AdaWorkflowContext";
import {
  ApiError,
  extractionNotesFromSources,
  extractAda,
  extractAdaField,
  suggestTitles,
  type ExtractableAdaField,
} from "../../services/api";
import { defaultAdaDetails, type ADADetails } from "../../types/patent";
import "../../styles/patent-drafter.css";

export default function AdaReview() {
  const navigate = useNavigate();
  const {
    adaDetails,
    setAdaDetails,
    inputSources,
    gatherSourceText,
    saveToStorage,
    markStepComplete,
    requestAutoDraft,
  } = useAdaWorkflow();

  const [form, setForm] = useState<ADADetails>(adaDetails ?? defaultAdaDetails);
  const [regenerating, setRegenerating] = useState<Set<string>>(new Set());
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [suggestingTitles, setSuggestingTitles] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractPhase, setExtractPhase] = useState<string | null>(null);
  const formRef = useRef(form);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    if (!adaDetails) {
      navigate("/ada/input", { replace: true });
      return;
    }
    setForm(adaDetails);
  }, [adaDetails, navigate]);

  useEffect(() => {
    if (!adaDetails) return;
    setAdaDetails(form);
    saveToStorage();
  }, [form, adaDetails, setAdaDetails, saveToStorage]);

  const extractionNotes = extractionNotesFromSources(inputSources);
  const isBusy = regenerating.size > 0 || suggestingTitles;

  const coreFilled = ADA_CORE_FIELD_KEYS.filter(
    (key) => form[key]?.trim().length > 0,
  ).length;
  const allCoreEmpty = coreFilled === 0;

  const updateField = (key: ExtractableAdaField, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegenerateField = (field: ExtractableAdaField) => {
    if (regenerating.has(field) || regenerating.has("all") || suggestingTitles) return;
    setRegenerating((prev) => new Set(prev).add(field));
    setError(null);

    void (async () => {
      try {
        const { combined } = await gatherSourceText();
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const patch = await extractAdaField(
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
    if (suggestingTitles) return;
    setRegenerating((prev) => new Set(prev).add("all"));
    setError(null);
    void (async () => {
      try {
        const { combined } = await gatherSourceText({ onProgress: setExtractPhase });
        if (!combined.trim()) {
          setError("No source material available.");
          return;
        }
        const details = await extractAda(combined, extractionNotes);
        setForm(details);
        setAdaDetails(details);
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
    if (suggestingTitles || regenerating.size > 0) return;
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

  const textareaClassName =
    "w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none";

  return (
    <AdaAppShell
      step="review"
      mainClassName="max-w-[900px] mx-auto px-margin-desktop py-10 pb-28"
      footer={
        <WorkflowFooter
          left={<WorkflowBackLink to="/ada/input" />}
          right={
            <WorkflowNextLink
              to="/ada/draft"
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
              suggestingTitles
                ? "Suggesting titles…"
                : extractPhase ??
                  (regenerating.has("all")
                    ? "Re-extracting all fields"
                    : "Re-extracting field…")
            }
          />
        </div>
      )}

      <div className="flex justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary">Review ADA study details</h1>
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
        {ADA_REVIEW_FIELDS.map((field) => {
          const isTitleField = field.key === "study_title";
          return (
            <div key={field.key} className="space-y-3">
              <div>
                <label className="font-label-md text-label-md text-primary">{field.label}</label>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{field.hint}</p>
              </div>
              <AutoResizeTextarea
                className={textareaClassName}
                value={form[field.key]}
                disabled={regenerating.has(field.key) || regenerating.has("all")}
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
                    updateField("study_title", title);
                    setTitleSuggestions([]);
                  }}
                />
              )}
              <div className="flex justify-end items-center gap-4">
                {isTitleField && (
                  <SuggestTitlesButton
                    onClick={handleSuggestTitles}
                    loading={suggestingTitles}
                    disabled={isBusy && !suggestingTitles}
                  />
                )}
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
          );
        })}
      </div>
    </AdaAppShell>
  );
}
