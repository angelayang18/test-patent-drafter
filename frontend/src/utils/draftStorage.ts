import type { FilingInfo, PatentFigure, PatentSectionId, WorkflowMode } from "../types/patent";
import {
  EMPTY_FILING_INFO,
  emptyApprovedExemplars,
  emptyAttorneyFeedback,
  GRANT_SECTION_IDS,
  GRANT_SECTION_LABELS,
  PATENT_SECTION_IDS,
  SECTION_LABELS,
} from "../types/patent";
import type { InputSources, UploadedSourceFile } from "../context/PatentWorkflowContext";
import type { CachedRemoteSources } from "./gatherSourceText";
import type { GrantDetails, InventionDetails } from "../types/patent";
import { hasGrantDraftSections, readActiveGrantWorkflow } from "./grantStorage";
import { sanitizePatentProse } from "./documentPreview";

export type WorkflowStep = "input" | "review" | "draft" | "figures" | "export";

export const WORKFLOW_STEP_ORDER: WorkflowStep[] = [
  "input",
  "review",
  "draft",
  "figures",
  "export",
];

export const WORKFLOW_STEP_PATHS: Record<WorkflowStep, string> = {
  input: "/",
  review: "/review",
  draft: "/draft",
  figures: "/figures",
  export: "/export",
};

export const ACTIVE_WORKFLOW_KEY = "patent-drafter-workflow";
const LEGACY_SESSION_KEY = "patent-drafter-workflow";
const DRAFT_LIBRARY_KEY = "patent-drafter-draft-library";
const DRAFT_FILE_FORMAT = "patent-drafter-draft";
const DRAFT_FILE_VERSION = 2;
const MAX_SAVED_DRAFTS = 20;

export const GRANT_STEP_ORDER: WorkflowStep[] = ["input", "review", "draft", "export"];

export function getWorkflowStepOrder(mode: WorkflowMode = "patent"): WorkflowStep[] {
  return mode === "grant" ? GRANT_STEP_ORDER : WORKFLOW_STEP_ORDER;
}

export interface WorkflowSnapshot {
  workflowMode: WorkflowMode;
  invention: InventionDetails | null;
  grantDetails: GrantDetails | null;
  sections: Record<string, string>;
  figures: PatentFigure[];
  brief_description_of_drawings: string;
  filingInfo: FilingInfo;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources?: CachedRemoteSources;
  attorneyFeedback?: Record<PatentSectionId, string>;
  attorneyFeedbackGlobal?: string;
  approvedExemplars?: Record<PatentSectionId, boolean>;
  aiInitialSections?: Record<string, string>;
  includeInLearningCorpus?: boolean;
  /** Steps explicitly finished via footer navigation (merged with inferred progress). */
  completedSteps?: WorkflowStep[];
  /** Fingerprint of sources used for the last successful extraction. */
  extractionSourceKey?: string | null;
  /** Set when leaving Review via "Next: Draft"; consumed once on the Draft page. */
  autoDraftPending?: boolean;
}

export interface SavedDraftRecord {
  id: string;
  name: string;
  savedAt: string;
  workflow: WorkflowSnapshot;
}

export interface DraftFileExport {
  format: typeof DRAFT_FILE_FORMAT;
  version: number;
  savedAt: string;
  name: string;
  workflow: WorkflowSnapshot;
}

const emptyInputSources: InputSources = {
  relevantContentNotes: "",
  irrelevantContentNotes: "",
  confluenceUrl: "",
  confluenceSpaceKey: "",
  confluenceToken: "",
  websiteUrl: "",
  pastedText: "",
};

function sanitizeSections(sections: Record<string, string> | undefined): Record<string, string> {
  if (!sections) {
    return {};
  }
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(sections)) {
    cleaned[key] = typeof value === "string" ? sanitizePatentProse(value) : value;
  }
  return cleaned;
}

export function normalizeWorkflow(
  raw: Partial<WorkflowSnapshot> | null | undefined,
): WorkflowSnapshot {
  return {
    workflowMode: raw?.workflowMode ?? "patent",
    invention: raw?.invention ?? null,
    grantDetails: raw?.grantDetails ?? null,
    sections: sanitizeSections(raw?.sections),
    figures: raw?.figures ?? [],
    brief_description_of_drawings: raw?.brief_description_of_drawings ?? "",
    filingInfo: { ...EMPTY_FILING_INFO, ...raw?.filingInfo },
    uploadedFiles: raw?.uploadedFiles ?? [],
    inputSources: { ...emptyInputSources, ...raw?.inputSources },
    cachedRemoteSources: raw?.cachedRemoteSources ?? {},
    attorneyFeedback: { ...emptyAttorneyFeedback(), ...raw?.attorneyFeedback },
    attorneyFeedbackGlobal: raw?.attorneyFeedbackGlobal ?? "",
    approvedExemplars: { ...emptyApprovedExemplars(), ...raw?.approvedExemplars },
    aiInitialSections: raw?.aiInitialSections ?? {},
    includeInLearningCorpus: raw?.includeInLearningCorpus ?? true,
    completedSteps: raw?.completedSteps ?? [],
    extractionSourceKey: raw?.extractionSourceKey ?? null,
    autoDraftPending: raw?.autoDraftPending ?? false,
  };
}

export function hasDraftSections(sections: Record<string, string>): boolean {
  return Object.values(sections).some((section) => section?.trim());
}

export function hasFiguresProgress(workflow: WorkflowSnapshot): boolean {
  return workflow.figures.length > 0 || workflow.brief_description_of_drawings.trim().length > 0;
}

/** Completed steps from explicit marks plus saved workflow data (for resume and nav gating). */
export function getCompletedSteps(workflow: WorkflowSnapshot): Set<WorkflowStep> {
  const completed = new Set<WorkflowStep>(workflow.completedSteps ?? []);
  const isGrant = workflow.workflowMode === "grant";

  if (isGrant ? workflow.grantDetails : workflow.invention) {
    completed.add("input");
  }
  if (hasDraftSections(workflow.sections)) {
    completed.add("review");
  }
  if (!isGrant && hasFiguresProgress(workflow)) {
    completed.add("draft");
    completed.add("figures");
  }

  return completed;
}

/** Whether the user may navigate to this workflow step from the navbar. */
export function isWorkflowStepAccessible(
  step: WorkflowStep,
  workflow: WorkflowSnapshot,
): boolean {
  if (step === "input") {
    return true;
  }

  const isGrant = workflow.workflowMode === "grant";
  const stepOrder = getWorkflowStepOrder(workflow.workflowMode);

  if (step === "figures" && isGrant) {
    return false;
  }

  if (step === "export") {
    if (isGrant) {
      return (workflow.completedSteps ?? []).includes("draft");
    }
    return (workflow.completedSteps ?? []).includes("figures");
  }

  const stepIndex = stepOrder.indexOf(step);
  if (stepIndex <= 0) {
    return false;
  }
  const previousStep = stepOrder[stepIndex - 1];
  return getCompletedSteps(workflow).has(previousStep);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — caller may surface an error
    throw new Error("Could not save draft. Browser storage may be full.");
  }
}

/** Migrate sessionStorage workflow from older builds, then read active workflow. */
export function readActiveWorkflow(): WorkflowSnapshot {
  try {
    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy && !localStorage.getItem(ACTIVE_WORKFLOW_KEY)) {
      localStorage.setItem(ACTIVE_WORKFLOW_KEY, legacy);
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch {
    // ignore migration errors
  }

  const stored = readJson<Partial<WorkflowSnapshot>>(ACTIVE_WORKFLOW_KEY);
  return normalizeWorkflow(stored);
}

export function writeActiveWorkflow(workflow: WorkflowSnapshot): void {
  writeJson(ACTIVE_WORKFLOW_KEY, workflow);
}

/** Blank workflow used when starting over (step resets to input, no resume path). */
export function createEmptyWorkflowSnapshot(): WorkflowSnapshot {
  return normalizeWorkflow(null);
}

export function clearActiveWorkflow(): void {
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    localStorage.removeItem(ACTIVE_WORKFLOW_KEY);
  } catch {
    // ignore quota / private-mode errors
  }
}

export function listSavedDrafts(): SavedDraftRecord[] {
  const records = readJson<SavedDraftRecord[]>(DRAFT_LIBRARY_KEY) ?? [];
  return records.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function saveDraftToLibrary(
  name: string,
  workflow: WorkflowSnapshot,
): SavedDraftRecord {
  const trimmedName = name.trim() || defaultDraftName(workflow);
  const record: SavedDraftRecord = {
    id: crypto.randomUUID(),
    name: trimmedName,
    savedAt: new Date().toISOString(),
    workflow: normalizeWorkflow(workflow),
  };

  const existing = listSavedDrafts();
  const next = [record, ...existing].slice(0, MAX_SAVED_DRAFTS);
  writeJson(DRAFT_LIBRARY_KEY, next);
  return record;
}

export function deleteSavedDraft(id: string): void {
  const next = listSavedDrafts().filter((draft) => draft.id !== id);
  writeJson(DRAFT_LIBRARY_KEY, next);
}

export function defaultDraftName(workflow: WorkflowSnapshot): string {
  const title =
    workflow.workflowMode === "grant"
      ? workflow.grantDetails?.project_title?.trim()
      : workflow.invention?.invention_title?.trim();
  if (title) return title;
  return workflow.workflowMode === "grant"
    ? `Grant application ${new Date().toLocaleDateString()}`
    : `Patent draft ${new Date().toLocaleDateString()}`;
}

export function workflowHasProgress(workflow: WorkflowSnapshot): boolean {
  if (workflow.invention || workflow.grantDetails) return true;
  if (workflow.uploadedFiles.length > 0) return true;
  if (Object.values(workflow.inputSources).some((value) => value.trim())) return true;
  if (Object.values(workflow.sections).some((section) => section?.trim())) return true;
  if (workflow.figures.length > 0) return true;
  if (workflow.brief_description_of_drawings.trim()) return true;
  return false;
}

/** Best step to resume editing after loading a saved workflow. */
export function getResumePath(workflow: WorkflowSnapshot): string {
  if (workflow.workflowMode === "grant") {
    if (Object.values(workflow.sections).some((section) => section?.trim())) {
      return "/grant/draft";
    }
    if (workflow.grantDetails) {
      return "/grant/review";
    }
    return "/grant/input";
  }

  if (workflow.figures.length > 0 || workflow.brief_description_of_drawings.trim()) {
    return "/figures";
  }
  if (Object.values(workflow.sections).some((section) => section?.trim())) {
    return "/draft";
  }
  if (workflow.invention) {
    return "/review";
  }
  return "/";
}

export function buildDraftFileExport(
  name: string,
  workflow: WorkflowSnapshot,
): DraftFileExport {
  return {
    format: DRAFT_FILE_FORMAT,
    version: DRAFT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    name: name.trim() || defaultDraftName(workflow),
    workflow: normalizeWorkflow(workflow),
  };
}

export function parseDraftFile(raw: unknown): DraftFileExport {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid draft file.");
  }

  const data = raw as Partial<DraftFileExport>;
  if (data.format !== DRAFT_FILE_FORMAT) {
    throw new Error("Unrecognized draft file format.");
  }
  if (!data.workflow || typeof data.workflow !== "object") {
    throw new Error("Draft file is missing workflow data.");
  }

  return {
    format: DRAFT_FILE_FORMAT,
    version: data.version ?? 1,
    savedAt: data.savedAt ?? new Date().toISOString(),
    name: data.name?.trim() || defaultDraftName(normalizeWorkflow(data.workflow)),
    workflow: normalizeWorkflow(data.workflow),
  };
}

export async function readDraftFile(file: File): Promise<DraftFileExport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Draft file is not valid JSON.");
  }
  return parseDraftFile(parsed);
}

export function downloadDraftFile(name: string, workflow: WorkflowSnapshot): void {
  const payload = buildDraftFileExport(name, workflow);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = name.trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "patent-draft";
  anchor.href = url;
  anchor.download = `${safeName}.patent-draft.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatSavedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const PREVIEW_MAX_CHARS = 120;

const IMPORT_MARKERS: Record<
  WorkflowMode,
  { start: string; end: string; kindLabel: string }
> = {
  grant: {
    start: "--- Imported Grant Application Draft ---",
    end: "--- End Imported Draft ---",
    kindLabel: "Grant Application Draft",
  },
  patent: {
    start: "--- Imported Patent Draft ---",
    end: "--- End Imported Draft ---",
    kindLabel: "Patent Draft",
  },
};

export interface OtherWorkflowDraftSectionPreview {
  id: string;
  label: string;
  preview: string;
}

export interface OtherWorkflowDraftSummary {
  sourceMode: WorkflowMode;
  title: string;
  displayLabel: string;
  sections: OtherWorkflowDraftSectionPreview[];
  serializedText: string;
}

function truncatePreview(text: string, maxChars = PREVIEW_MAX_CHARS): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trimEnd()}…`;
}

function buildSectionPreviews(
  sections: Record<string, string>,
  orderedIds: readonly string[],
  labels: Record<string, string>,
): OtherWorkflowDraftSectionPreview[] {
  const previews: OtherWorkflowDraftSectionPreview[] = [];
  for (const id of orderedIds) {
    const content = sections[id]?.trim() ?? "";
    if (!content) continue;
    previews.push({
      id,
      label: labels[id] ?? id,
      preview: truncatePreview(content),
    });
  }
  return previews;
}

function serializeSectionsBlock(
  sections: Record<string, string>,
  orderedIds: readonly string[],
  labels: Record<string, string>,
): string {
  const parts: string[] = [];
  for (const id of orderedIds) {
    const content = sections[id]?.trim() ?? "";
    if (!content) continue;
    const label = labels[id] ?? id;
    parts.push(`## ${label}\n\n${content}`);
  }
  return parts.join("\n\n");
}

/** Wrap serialized draft sections in stable markers for toggle inject/remove. */
export function wrapImportedDraftBlock(sourceMode: WorkflowMode, body: string): string {
  const markers = IMPORT_MARKERS[sourceMode];
  return `${markers.start}\n${body.trim()}\n${markers.end}`;
}

/** Remove a previously injected opposite-workflow draft block from pasted text. */
export function stripImportedDraftBlock(
  pastedText: string,
  sourceMode: WorkflowMode,
): string {
  const markers = IMPORT_MARKERS[sourceMode];
  const startIdx = pastedText.indexOf(markers.start);
  if (startIdx === -1) {
    return pastedText;
  }
  const endIdx = pastedText.indexOf(markers.end, startIdx);
  if (endIdx === -1) {
    return pastedText;
  }
  const before = pastedText.slice(0, startIdx);
  const after = pastedText.slice(endIdx + markers.end.length);
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Read the opposite workflow's active localStorage snapshot and return a summary
 * suitable for seeding the current Input page as pasted source text.
 */
export function getOtherWorkflowDraftSummary(
  currentMode: WorkflowMode,
): OtherWorkflowDraftSummary | null {
  if (currentMode === "patent") {
    const grant = readActiveGrantWorkflow();
    if (!hasGrantDraftSections(grant.sections)) {
      return null;
    }
    const sectionPreviews = buildSectionPreviews(
      grant.sections,
      GRANT_SECTION_IDS,
      GRANT_SECTION_LABELS,
    );
    if (sectionPreviews.length === 0) {
      return null;
    }
    const title =
      grant.grantDetails?.project_title?.trim() || "Untitled grant application";
    const body = serializeSectionsBlock(
      grant.sections,
      GRANT_SECTION_IDS,
      GRANT_SECTION_LABELS,
    );
    return {
      sourceMode: "grant",
      title,
      displayLabel: `${IMPORT_MARKERS.grant.kindLabel} — ${title}`,
      sections: sectionPreviews,
      serializedText: wrapImportedDraftBlock("grant", body),
    };
  }

  const patent = readActiveWorkflow();
  if (patent.workflowMode === "grant" || !hasDraftSections(patent.sections)) {
    return null;
  }
  const sectionPreviews = buildSectionPreviews(
    patent.sections,
    PATENT_SECTION_IDS,
    SECTION_LABELS,
  );
  if (sectionPreviews.length === 0) {
    return null;
  }
  const title =
    patent.invention?.invention_title?.trim() || "Untitled patent draft";
  const body = serializeSectionsBlock(
    patent.sections,
    PATENT_SECTION_IDS,
    SECTION_LABELS,
  );
  return {
    sourceMode: "patent",
    title,
    displayLabel: `${IMPORT_MARKERS.patent.kindLabel} — ${title}`,
    sections: sectionPreviews,
    serializedText: wrapImportedDraftBlock("patent", body),
  };
}

/** Whether pasted text already contains an injected block for the given source mode. */
export function pastedTextHasImportedDraft(
  pastedText: string,
  sourceMode: WorkflowMode,
): boolean {
  const markers = IMPORT_MARKERS[sourceMode];
  return (
    pastedText.includes(markers.start) && pastedText.includes(markers.end)
  );
}

/** Append (or replace existing) imported draft block into pasted text. */
export function injectImportedDraftBlock(
  pastedText: string,
  sourceMode: WorkflowMode,
  serializedText: string,
): string {
  const without = stripImportedDraftBlock(pastedText, sourceMode);
  if (!without.trim()) {
    return serializedText;
  }
  return `${without.trim()}\n\n${serializedText}`;
}
