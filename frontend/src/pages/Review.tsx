import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AutoResizeTextarea } from "../components/AutoResizeTextarea";
import { GenerationProgress } from "../components/GenerationProgress";
import { HorizontalSplitPane } from "../components/HorizontalSplitPane";
import { SourceFilePreviewModal } from "../components/SourceFilePreviewModal";
import { SourceTextPreviewModal } from "../components/SourceTextPreviewModal";
import { SavedIndicator, useSavedIndicator } from "../components/SavedIndicator";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowBackLink, WorkflowNextLink } from "../components/WorkflowNavButtons";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultInvention, usePatentWorkflow, type UploadedSourceFile } from "../context/PatentWorkflowContext";
import { useUndoRedo } from "../hooks/useUndoRedo";
import {
  ApiError,
  extractionNotesFromSources,
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
}[] = [
  {
    key: "invention_title",
    label: "Invention Title",
    hint: "Short, specific title for the patent cover sheet (maximum 15 words; no marketing language).",
    multiline: true,
  },
  {
    key: "problem_being_solved",
    label: "Technical Problem Being Solved",
    hint: "The gap or limitation in existing technology that your invention addresses.",
    multiline: true,
  },
  {
    key: "core_technical_solution",
    label: "Technical Solution / Core Mechanism",
    hint: "How the invention works—the main components and steps that solve the problem.",
    multiline: true,
  },
  {
    key: "novel_mechanism",
    label: "What Makes It Novel",
    hint: "The distinguishing feature compared to prior art—not merely an improvement.",
    multiline: true,
  },
  {
    key: "alternative_embodiments",
    label: "Alternative Embodiments",
    hint: "Other ways the invention could be built or deployed (one per line).",
    multiline: true,
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
    inputSources,
    cachedRemoteSources,
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
  const [previewFile, setPreviewFile] = useState<UploadedSourceFile | null>(null);
  const [textPreview, setTextPreview] = useState<{
    title: string;
    subtitle?: string;
    content: string;
  } | null>(null);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();

  const initialSynced = useRef(false);
  const suppressSavedIndicator = useRef(true);
  useEffect(() => {
    if (invention && !initialSynced.current) {
      reset(invention);
      initialSynced.current = true;
      window.setTimeout(() => {
        suppressSavedIndicator.current = false;
      }, 0);
    }
  }, [invention, reset]);

  useEffect(() => {
    if (!invention) {
      navigate("/", { replace: true });
    }
  }, [invention, navigate]);

  useEffect(() => {
    setInvention(form);
    saveToStorage();
    if (suppressSavedIndicator.current) return;

    const timer = window.setTimeout(() => flashSaved(), 400);
    return () => window.clearTimeout(timer);
  }, [form, setInvention, saveToStorage, flashSaved]);

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
      const details = await extractInvention(combined, extractionNotes);
      push(details);
      setInvention(details);
      saveToStorage();
      flashSaved();
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
      const patch = await extractInventionField(combined, field, form, extractionNotes);
      const next = { ...form, ...patch };
      push(next);
      setInvention(next);
      saveToStorage();
      flashSaved();
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

  const extractionNotes = extractionNotesFromSources(inputSources);
  const confluenceSource = cachedRemoteSources.confluence;
  const websiteSource = cachedRemoteSources.website;
  const pastedText = inputSources.pastedText.trim();
  const relevantNotes = inputSources.relevantContentNotes.trim();
  const irrelevantNotes = inputSources.irrelevantContentNotes.trim();
  const hasRelevanceGuidance = relevantNotes.length > 0 || irrelevantNotes.length > 0;
  const hasConfluence = Boolean(confluenceSource?.content?.trim());
  const hasWebsite = Boolean(websiteSource?.content?.trim());
  const hasPasted = pastedText.length > 0;
  const hasUploaded = uploadedFiles.length > 0;
  const hasAnySource = hasUploaded || hasConfluence || hasWebsite || hasPasted;

  const textareaClassName =
    "w-full bg-white border border-outline-variant rounded-lg p-4 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary transition-all outline-none";

  const renderFieldValue = (field: (typeof REVIEW_FIELDS)[number]) => {
    if (field.key === "alternative_embodiments") {
      const altText = form.alternative_embodiments.join("\n");
      return (
        <AutoResizeTextarea
          className={textareaClassName}
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
        />
      );
    }

    const value = form[field.key];
    if (field.multiline) {
      return (
        <AutoResizeTextarea
          className={textareaClassName}
          value={typeof value === "string" ? value : ""}
          disabled={regeneratingField === field.key}
          onChange={(e) => updateField(field.key, e.target.value as InventionDetails[typeof field.key])}
        />
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
          left={<WorkflowBackLink to="/" />}
          right={
            <>
              <SavedIndicator visible={savedVisible} />
              <UndoRedoToolbar
                canUndo={canUndo && !isBusy}
                canRedo={canRedo && !isBusy}
                onUndo={undo}
                onRedo={redo}
              />
              <WorkflowNextLink to="/draft">Next: Draft</WorkflowNextLink>
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

      <HorizontalSplitPane
        storageKey="patent-drafter-review-split"
        defaultLeftPercent={40}
        left={
          <>
            <div className="p-8 border-b border-outline-variant shrink-0">
              <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
                Source Material
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Files and text used to extract invention details.
              </p>
            </div>
            <div className="flex-grow overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {!hasAnySource && !hasRelevanceGuidance ? (
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  No source material found. Go back to Input and add files, pasted text, Confluence,
                  or a website URL.
                </p>
              ) : (
                <>
                  {hasRelevanceGuidance && (
                    <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                      <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <span className="material-symbols-outlined">tune</span>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="font-label-md text-label-md text-on-surface">
                          Relevance guidance
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {[relevantNotes && "relevant", irrelevantNotes && "irrelevant"]
                            .filter(Boolean)
                            .join(" & ")}{" "}
                          notes for extraction
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Preview relevance guidance"
                        onClick={() =>
                          setTextPreview({
                            title: "Relevance guidance",
                            subtitle: "Applied during AI extraction",
                            content: [
                              relevantNotes &&
                                `Relevant — prioritize and extract from:\n${relevantNotes}`,
                              irrelevantNotes &&
                                `Irrelevant — ignore or de-emphasize:\n${irrelevantNotes}`,
                            ]
                              .filter(Boolean)
                              .join("\n\n"),
                          })
                        }
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </div>
                  )}

                  {hasConfluence && confluenceSource && (
                    <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                      <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-secondary/10 text-secondary shrink-0">
                        <span
                          className="material-symbols-outlined"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          extension
                        </span>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="font-label-md text-label-md text-on-surface truncate">
                          Confluence · {confluenceSource.spaceKey}
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {confluenceSource.url}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Preview Confluence space ${confluenceSource.spaceKey}`}
                        onClick={() =>
                          setTextPreview({
                            title: `Confluence · ${confluenceSource.spaceKey}`,
                            subtitle: confluenceSource.url,
                            content: confluenceSource.content,
                          })
                        }
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </div>
                  )}

                  {hasWebsite && websiteSource && (
                    <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                      <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
                        <span className="material-symbols-outlined">language</span>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="font-label-md text-label-md text-on-surface truncate">
                          Website
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
                          {websiteSource.url}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`Preview website ${websiteSource.url}`}
                        onClick={() =>
                          setTextPreview({
                            title: "Website",
                            subtitle: websiteSource.url,
                            content: websiteSource.content,
                          })
                        }
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </div>
                  )}

                  {hasPasted && (
                    <div className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4">
                      <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
                        <span className="material-symbols-outlined">content_paste</span>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="font-label-md text-label-md text-on-surface truncate">
                          Pasted text
                        </p>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {pastedText.length.toLocaleString()} characters
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Preview pasted text"
                        onClick={() =>
                          setTextPreview({
                            title: "Pasted text",
                            subtitle: "Text entered on the Input step",
                            content: pastedText,
                          })
                        }
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </div>
                  )}

                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4"
                    >
                      <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-primary/5 text-primary shrink-0">
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
                      <button
                        type="button"
                        aria-label={`Preview ${file.filename}`}
                        onClick={() => setPreviewFile(file)}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px]">visibility</span>
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        }
        right={
          <>
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
          </>
        }
      />
      <SourceFilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      {textPreview && (
        <SourceTextPreviewModal
          title={textPreview.title}
          subtitle={textPreview.subtitle}
          content={textPreview.content}
          onClose={() => setTextPreview(null)}
        />
      )}
    </AppShell>
  );
}
