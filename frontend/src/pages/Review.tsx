import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { GenerationProgress } from "../components/GenerationProgress";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultInvention, usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useUndoRedo } from "../hooks/useUndoRedo";
import {
  ApiError,
  extractInvention,
  extractInventionField,
  type ExtractableInventionField,
} from "../services/api";
import type { InventionDetails } from "../types/patent";
import { fileIcon, formatFileSize } from "../utils/format";
import "../styles/patent-drafter.css";

type ReviewFieldKey = ExtractableInventionField;

const REVIEW_FIELDS: {
  key: ReviewFieldKey;
  label: string;
  hint: string;
  multiline: boolean;
  rows?: number;
}[] = [
  {
    key: "invention_title",
    label: "Invention Title",
    hint: "Short, specific title for the patent cover sheet (maximum 15 words; no marketing language).",
    multiline: false,
  },
  {
    key: "problem_being_solved",
    label: "Technical Problem Being Solved",
    hint: "The gap or limitation in existing technology that your invention addresses.",
    multiline: true,
    rows: 4,
  },
  {
    key: "core_technical_solution",
    label: "Technical Solution / Core Mechanism",
    hint: "How the invention works—the main components and steps that solve the problem.",
    multiline: true,
    rows: 5,
  },
  {
    key: "novel_mechanism",
    label: "What Makes It Novel",
    hint: "The distinguishing feature compared to prior art—not merely an improvement.",
    multiline: true,
    rows: 4,
  },
  {
    key: "alternative_embodiments",
    label: "Alternative Embodiments",
    hint: "Other ways the invention could be built or deployed (one per line).",
    multiline: true,
    rows: 4,
  },
];

function RegenerateButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex items-center gap-2 text-secondary font-label-sm text-label-sm hover:underline disabled:opacity-50"
    >
      <span className={`material-symbols-outlined text-[16px] ${loading ? "loading-spin" : ""}`}>
        autorenew
      </span>
      {loading ? "Regenerating..." : "Regenerate with AI"}
    </button>
  );
}

function AiField({
  label,
  hint,
  children,
  onRegenerate,
  regenerating,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <label className="font-label-md text-label-md text-primary">{label}</label>
          <span className="bg-secondary-fixed text-on-secondary-fixed text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
            AI-Generated
          </span>
        </div>
        {hint && (
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{hint}</p>
        )}
      </div>
      {children}
      <div className="flex justify-end">
        <RegenerateButton onClick={onRegenerate} loading={regenerating} />
      </div>
    </div>
  );
}

export default function Review() {
  const navigate = useNavigate();
  const {
    invention,
    setInvention,
    uploadedFiles,
    gatherSourceText,
    saveToStorage,
  } = usePatentWorkflow();

  const {
    value: form,
    replace,
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  } = useUndoRedo<InventionDetails>(invention ?? defaultInvention);

  const [regeneratingField, setRegeneratingField] = useState<ReviewFieldKey | "all" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const initialSynced = useRef(false);
  useEffect(() => {
    if (invention && !initialSynced.current) {
      reset(invention);
      initialSynced.current = true;
    }
  }, [invention, reset]);

  useEffect(() => {
    if (!invention) {
      navigate("/", { replace: true });
    }
  }, [invention, navigate]);

  const persistForm = useCallback(() => {
    setInvention(form);
    saveToStorage();
  }, [form, setInvention, saveToStorage]);

  useEffect(() => {
    setInvention(form);
    saveToStorage();
  }, [form, setInvention, saveToStorage]);

  const handleRegenerateAll = async () => {
    setError(null);
    setRegeneratingField("all");
    push(structuredClone(form));
    try {
      const combined = await gatherSourceText();
      if (!combined.trim()) {
        setError("No source material available. Go back to Input and add sources.");
        return;
      }
      const details = await extractInvention(combined);
      push(details);
      setInvention(details);
      saveToStorage();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Regeneration failed.");
    } finally {
      setRegeneratingField(null);
    }
  };

  const handleRegenerateField = async (field: ReviewFieldKey) => {
    setError(null);
    setRegeneratingField(field);
    push(structuredClone(form));
    try {
      const combined = await gatherSourceText();
      if (!combined.trim()) {
        setError("No source material available. Go back to Input and add sources.");
        return;
      }
      const patch = await extractInventionField(combined, field, form);
      const next = { ...form, ...patch };
      push(next);
      setInvention(next);
      saveToStorage();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Regeneration failed.");
    } finally {
      setRegeneratingField(null);
    }
  };

  const updateField = <K extends keyof InventionDetails>(key: K, value: InventionDetails[K]) => {
    replace({ ...form, [key]: value });
  };

  const isBusy = regeneratingField !== null;

  const renderFieldValue = (field: (typeof REVIEW_FIELDS)[number]) => {
    if (field.key === "alternative_embodiments") {
      const altText = form.alternative_embodiments.join("\n");
      return (
        <textarea
          className="w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface h-32 focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none resize-none"
          value={altText}
          disabled={regeneratingField === field.key}
          onChange={(e) =>
            updateField(
              "alternative_embodiments",
              e.target.value
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
          onBlur={persistForm}
        />
      );
    }

    const value = form[field.key];
    if (field.multiline) {
      return (
        <textarea
          className="w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none resize-none"
          style={{ minHeight: `${(field.rows ?? 4) * 1.75}rem` }}
          value={typeof value === "string" ? value : ""}
          disabled={regeneratingField === field.key}
          onChange={(e) => updateField(field.key, e.target.value as InventionDetails[typeof field.key])}
          onBlur={persistForm}
        />
      );
    }

    return (
      <input
        className="w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none"
        type="text"
        value={typeof value === "string" ? value : ""}
        disabled={regeneratingField === field.key}
        onChange={(e) => updateField(field.key, e.target.value as InventionDetails[typeof field.key])}
        onBlur={persistForm}
      />
    );
  };

  return (
    <AppShell
      step="review"
      mainClassName="flex flex-col min-h-0 flex-1 overflow-hidden"
      footer={
        <WorkflowFooter
          left={
            <Link
              to="/"
              className="px-6 py-2.5 rounded-lg border border-outline text-on-surface font-label-md text-label-md hover:bg-surface transition-all flex items-center gap-2 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Back
            </Link>
          }
          right={
            <>
              <UndoRedoToolbar
                canUndo={canUndo && !isBusy}
                canRedo={canRedo && !isBusy}
                onUndo={undo}
                onRedo={redo}
              />
              <button
                type="button"
                onClick={persistForm}
                className="px-6 py-2.5 rounded-lg text-secondary border border-secondary font-label-md text-label-md hover:bg-secondary/5 transition-all active:scale-95"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => {
                  persistForm();
                  navigate("/draft");
                }}
                className="px-8 py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container shadow-md transition-all flex items-center gap-2 active:scale-95"
              >
                Next: Draft Patent Sections
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
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
              regeneratingField === "all"
                ? "Regenerating all invention fields"
                : `Regenerating ${REVIEW_FIELDS.find((f) => f.key === regeneratingField)?.label ?? "field"}`
            }
          />
        </div>
      )}

      <div className="flex-grow grid grid-cols-1 md:grid-cols-10 min-h-0 overflow-hidden">
        <aside className="md:col-span-4 bg-surface border-r border-outline-variant flex flex-col overflow-hidden">
          <div className="p-8 border-b border-outline-variant shrink-0">
            <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
              Source Material
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Files and text used to extract invention details.
            </p>
          </div>
          <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {uploadedFiles.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No uploaded files. Sources may include pasted text, Confluence, or a website URL.
              </p>
            ) : (
              uploadedFiles.map((file) => (
                <div
                  key={file.id}
                  className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4"
                >
                  <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <span className="material-symbols-outlined">{fileIcon(file.filename)}</span>
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="font-label-md text-label-md text-on-surface truncate">
                      {file.filename}
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {formatFileSize(file.sizeBytes)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        <section className="md:col-span-6 bg-surface-container-lowest flex flex-col overflow-hidden">
          <div className="p-8 border-b border-outline-variant flex justify-between items-start gap-4 shrink-0">
            <div>
              <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
                Extracted Invention Details
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Edit fields below, then continue to draft full patent sections.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRegenerateAll()}
              disabled={isBusy}
              className="px-4 py-2 bg-secondary/10 text-secondary rounded-lg font-label-md text-label-md hover:bg-secondary/20 disabled:opacity-50 flex items-center gap-2 shrink-0"
            >
              <span
                className={`material-symbols-outlined text-sm ${regeneratingField === "all" ? "loading-spin" : ""}`}
              >
                autorenew
              </span>
              Regenerate all
            </button>
          </div>
          <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar pb-8">
            {REVIEW_FIELDS.map((field) => (
              <AiField
                key={field.key}
                label={field.label}
                hint={field.hint}
                onRegenerate={() => void handleRegenerateField(field.key)}
                regenerating={regeneratingField === field.key}
              >
                {renderFieldValue(field)}
              </AiField>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
