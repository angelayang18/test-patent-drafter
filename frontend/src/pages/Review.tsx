import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AutoResizeTextarea } from "../components/AutoResizeTextarea";
import { GenerationProgress } from "../components/GenerationProgress";
import { HorizontalSplitPane } from "../components/HorizontalSplitPane";
import { MidWorkflowUpload } from "../components/MidWorkflowUpload";
import { SourceFilePreviewModal } from "../components/SourceFilePreviewModal";
import { SourceTextPreviewModal } from "../components/SourceTextPreviewModal";
import { SelectionRegeneratePopover } from "../components/SelectionRegeneratePopover";
import { SavedIndicator, useSavedIndicator } from "../components/SavedIndicator";
import { SuggestTitlesButton, TitleSuggestionsList } from "../components/TitleSuggestions";
import { UndoRedoToolbar } from "../components/UndoRedoToolbar";
import { WorkflowBackLink, WorkflowNextLink } from "../components/WorkflowNavButtons";
import { WorkflowFooter } from "../components/WorkflowFooter";
import { defaultGrantDetails, defaultInvention } from "../types/patent";
import { usePatentWorkflow, type UploadedSourceFile } from "../context/PatentWorkflowContext";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { useTextareaSelectionRegenerate } from "../hooks/useTextareaSelectionRegenerate";
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
import { fileIcon, formatFileSize } from "../utils/format";
import {
  computeExtractionSourceKey,
  hasExtractedGrantReviewContent,
  hasExtractedReviewContent,
  hasSourceMaterialConfigured,
  needsExtraction,
  needsGrantExtraction,
} from "../utils/extractionSourceKey";
import { SourceGatherError } from "../utils/gatherSourceText";
import "../styles/patent-drafter.css";

type ReviewFieldKey = ExtractableInventionField;

const TITLE_MAX_LENGTH = 500;

const CORE_REVIEW_FIELD_KEYS = [
  "invention_title",
  "problem_being_solved",
  "core_technical_solution",
  "novel_mechanism",
] as const satisfies readonly ReviewFieldKey[];

function hasCoreReviewFieldContent(
  details: InventionDetails,
  key: (typeof CORE_REVIEW_FIELD_KEYS)[number],
): boolean {
  const value = details[key];
  return typeof value === "string" && value.trim().length > 0;
}

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

const GRANT_CORE_REVIEW_FIELD_KEYS = [
  "project_title",
  "problem_statement",
  "proposed_solution",
  "innovation_and_impact",
] as const satisfies readonly ExtractableGrantField[];

const GRANT_REVIEW_FIELDS: {
  key: ExtractableGrantField;
  label: string;
  hint: string;
  multiline: boolean;
}[] = [
  {
    key: "project_title",
    label: "Project Title",
    hint: "Concise working title for the grant proposal.",
    multiline: true,
  },
  {
    key: "problem_statement",
    label: "Problem Statement",
    hint: "The need or gap the project addresses.",
    multiline: true,
  },
  {
    key: "proposed_solution",
    label: "Proposed Solution",
    hint: "What the project will do and how it addresses the problem.",
    multiline: true,
  },
  {
    key: "innovation_and_impact",
    label: "Innovation & Impact",
    hint: "What is novel and the expected outcomes or impact.",
    multiline: true,
  },
  {
    key: "target_population",
    label: "Target Population",
    hint: "Who benefits and at what scale.",
    multiline: true,
  },
  {
    key: "team_qualifications",
    label: "Team Qualifications",
    hint: "Relevant expertise and organizational capacity.",
    multiline: true,
  },
  {
    key: "budget_overview",
    label: "Budget Overview",
    hint: "High-level budget categories and rationale if available.",
    multiline: true,
  },
  {
    key: "evaluation_plan",
    label: "Evaluation Plan",
    hint: "How success will be measured.",
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
  extraActions,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  onRegenerate: () => void;
  regenerating: boolean;
  extraActions?: ReactNode;
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
      <div className="flex justify-end items-center gap-4">
        {extraActions}
        <RegenerateButton onClick={onRegenerate} loading={regenerating} />
      </div>
    </div>
  );
}

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
  const [previewFile, setPreviewFile] = useState<UploadedSourceFile | null>(null);
  const [textPreview, setTextPreview] = useState<{
    title: string;
    subtitle?: string;
    content: string;
  } | null>(null);
  const { visible: savedVisible, flash: flashSaved } = useSavedIndicator();

  const initialSynced = useRef(false);
  const suppressSavedIndicator = useRef(true);
  const autoExtractStarted = useRef(false);
  const formRef = useRef<InventionDetails | GrantDetails>(form);
  const selectionFieldRef = useRef<string | null>(null);

  const reviewFields = isGrant ? GRANT_REVIEW_FIELDS : REVIEW_FIELDS;

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
    if (suppressSavedIndicator.current) return;

    const timer = window.setTimeout(() => flashSaved(), 400);
    return () => window.clearTimeout(timer);
  }, [form, reviewData, isGrant, setInvention, setGrantDetails, saveToStorage, flashSaved, workflowResetting]);

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
        const details = isGrant
          ? await extractGrant(combined, extractionNotes)
          : await extractInvention(combined, extractionNotes);
        if (isGrant) {
          grantUndo.reset(details as GrantDetails);
          setGrantDetails(details as GrantDetails);
        } else {
          patentUndo.reset(details as InventionDetails);
          setInvention(details as InventionDetails);
        }
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
      const details = isGrant
        ? await extractGrant(combined, extractionNotes)
        : await extractInvention(combined, extractionNotes);
      pushForm(details);
      if (isGrant) {
        setGrantDetails(details as GrantDetails);
      } else {
        setInvention(details as InventionDetails);
      }
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
        const patch = isGrant
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
        const next = { ...formRef.current, ...patch };
        formRef.current = next;
        pushForm(next);
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
      const filledCount = GRANT_CORE_REVIEW_FIELD_KEYS.filter(
        (key) => typeof grantForm[key] === "string" && grantForm[key].trim().length > 0,
      ).length;
      return {
        allCoreFieldsEmpty: filledCount === 0,
        someCoreFieldsEmpty: filledCount > 0 && filledCount < GRANT_CORE_REVIEW_FIELD_KEYS.length,
      };
    }
    const patentForm = form as InventionDetails;
    const filledCount = CORE_REVIEW_FIELD_KEYS.filter((key) =>
      hasCoreReviewFieldContent(patentForm, key),
    ).length;
    return {
      allCoreFieldsEmpty: filledCount === 0,
      someCoreFieldsEmpty: filledCount > 0 && filledCount < CORE_REVIEW_FIELD_KEYS.length,
    };
  }, [form, isGrant]);

  const confluenceSource = cachedRemoteSources.confluence;
  const websiteSources = cachedRemoteSources.website ?? [];
  const pastedText = inputSources.pastedText.trim();
  const relevantNotes = inputSources.relevantContentNotes.trim();
  const irrelevantNotes = inputSources.irrelevantContentNotes.trim();
  const hasRelevanceGuidance = relevantNotes.length > 0 || irrelevantNotes.length > 0;
  const hasConfluence = Boolean(confluenceSource?.content?.trim());
  const hasWebsite = websiteSources.some((entry) => entry.content.trim().length > 0);
  const hasPasted = pastedText.length > 0;
  const hasUploaded = uploadedFiles.length > 0;
  const hasAnySource = hasUploaded || hasConfluence || hasWebsite || hasPasted;

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
                  No source material found. Add files below, or go back to Input for pasted text,
                  Confluence, or a website URL.
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

                  {websiteSources
                    .filter((entry) => entry.content.trim().length > 0)
                    .map((websiteSource) => (
                    <div
                      key={websiteSource.url}
                      className="bg-surface-container-lowest border border-outline-variant p-4 rounded-lg flex items-center gap-4"
                    >
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
                  ))}

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
              <MidWorkflowUpload />
            </div>
          </>
        }
        right={
          <>
            <div className="p-8 border-b border-outline-variant flex justify-between items-start gap-4 shrink-0">
              <div>
                <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
                  {isGrant ? "Extracted Grant Details" : "Extracted Invention Details"}
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  {isGrant
                    ? "Edit fields below, then continue to draft grant application sections."
                    : "Edit fields below, then continue to draft full patent sections."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRegenerateAll()}
                disabled={isBusy}
                className="px-4 py-2 bg-secondary/10 text-secondary rounded-lg font-label-md text-label-md hover:bg-secondary/20 disabled:opacity-50 flex items-center gap-2 shrink-0"
              >
                <span
                  className={`material-symbols-outlined text-sm ${regeneratingFields.has("all") ? "loading-spin" : ""}`}
                >
                  autorenew
                </span>
                Regenerate all
              </button>
            </div>
            <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar pb-8">
              {allCoreFieldsEmpty && (
                <div
                  role="alert"
                  className="p-4 rounded-lg bg-error-container/20 text-error border border-error/30 font-body-sm text-body-sm"
                >
                  Please fill in at least one {isGrant ? "grant detail" : "invention detail"} before drafting.
                </div>
              )}
              {someCoreFieldsEmpty && (
                <div className="p-4 rounded-lg bg-secondary/10 text-on-surface border border-secondary/30 font-body-sm text-body-sm">
                  Some {isGrant ? "grant details are" : "invention details are"} still empty. You can continue, but draft quality may
                  improve if you fill in the remaining fields.
                </div>
              )}
              {reviewFields.map((field) => {
                const isTitleField =
                  field.key === "invention_title" || field.key === "project_title";
                return (
                  <AiField
                    key={field.key}
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
                  </AiField>
                );
              })}
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
      <SelectionRegeneratePopover
        anchorRect={textareaSelection?.anchorRect ?? null}
        loading={regeneratingSelection}
        onConfirm={handleConfirmSelectionRegenerate}
        onDismiss={dismissSelectionPopover}
      />
    </AppShell>
  );
}
