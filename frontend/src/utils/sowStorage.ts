import { defaultSowDetails, type SOWDetails, type SectionCitation } from "../types/patent";
import type { InputSources, UploadedSourceFile } from "../context/sowContext";
import type { CachedRemoteSources } from "./gatherSourceText";
import { notifyDraftsChanged } from "./draftLibraryEvents";
import type { SectionSettingsMap } from "./sectionSettings";

export type SowWorkflowStep = "input" | "review" | "draft" | "export";

export const SOW_STEP_ORDER: SowWorkflowStep[] = ["input", "review", "draft", "export"];

export const SOW_STEP_PATHS: Record<SowWorkflowStep, string> = {
  input: "/sow/input",
  review: "/sow/review",
  draft: "/sow/draft",
  export: "/sow/export",
};

export const ACTIVE_SOW_WORKFLOW_KEY = "patent-drafter-sow-workflow";

export interface SowWorkflowSnapshot {
  sowDetails: SOWDetails | null;
  sections: Record<string, string>;
  sectionCitations?: Record<string, SectionCitation[]>;
  /** Per-section SOW reviewer notes (SOW-only; never shared with other doc types). */
  reviewerFeedback?: Record<string, string>;
  /** Citations keyed by extracted Review field id (not draft section id). */
  fieldCitations?: Record<string, SectionCitation[]>;
  sectionSettings?: SectionSettingsMap;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources?: CachedRemoteSources;
  completedSteps?: SowWorkflowStep[];
  extractionSourceKey?: string | null;
  autoDraftPending?: boolean;
  /**
   * Library draft id this active session was opened from (Drafts modal).
   * Session-only metadata — stripped when saving into the draft library.
   */
  loadedFromDraftId?: string;
}

const emptyInputSources: InputSources = {
  relevantContentNotes: "",
  irrelevantContentNotes: "",
  confluenceUrl: "",
  confluenceSpaceKey: "",
  confluenceToken: "",
  websiteUrls: [""],
  pastedText: "",
};

type LegacyInputSources = Partial<InputSources> & { websiteUrl?: string };

function normalizeInputSources(raw: LegacyInputSources | undefined): InputSources {
  const { websiteUrl, websiteUrls, ...rest } = raw ?? {};
  let urls = Array.isArray(websiteUrls) ? websiteUrls.map(String) : undefined;
  if (!urls) {
    const legacy = typeof websiteUrl === "string" ? websiteUrl.trim() : "";
    urls = legacy ? [legacy] : [""];
  }
  if (urls.length === 0) {
    urls = [""];
  }
  return { ...emptyInputSources, ...rest, websiteUrls: urls };
}

function normalizeCachedRemoteSources(
  raw: CachedRemoteSources | Record<string, unknown> | null | undefined,
): CachedRemoteSources {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const result: CachedRemoteSources = {};
  const website = (raw as CachedRemoteSources).website as
    | { url: string; content: string }
    | { url: string; content: string }[]
    | undefined;
  if (Array.isArray(website)) {
    result.website = website.filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.url === "string" &&
        typeof entry.content === "string",
    );
  } else if (
    website &&
    typeof website === "object" &&
    typeof website.url === "string" &&
    typeof website.content === "string"
  ) {
    result.website = [website];
  }
  const confluence = (raw as CachedRemoteSources).confluence;
  if (
    confluence &&
    typeof confluence === "object" &&
    typeof confluence.url === "string" &&
    typeof confluence.spaceKey === "string" &&
    typeof confluence.content === "string"
  ) {
    result.confluence = confluence;
  }
  return result;
}

function inputSourcesHaveProgress(inputSources: InputSources): boolean {
  return Object.values(inputSources).some((value) => {
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (Array.isArray(value)) {
      return value.some((item) => typeof item === "string" && item.trim().length > 0);
    }
    return false;
  });
}

export function normalizeSowWorkflow(
  raw: Partial<SowWorkflowSnapshot> | null | undefined,
): SowWorkflowSnapshot {
  return {
    sowDetails: raw?.sowDetails
      ? { ...defaultSowDetails, ...raw.sowDetails }
      : null,
    sections: raw?.sections ?? {},
    sectionCitations: raw?.sectionCitations ?? {},
    reviewerFeedback: raw?.reviewerFeedback ?? {},
    fieldCitations: raw?.fieldCitations ?? {},
    sectionSettings: raw?.sectionSettings,
    uploadedFiles: raw?.uploadedFiles ?? [],
    inputSources: normalizeInputSources(raw?.inputSources as LegacyInputSources | undefined),
    cachedRemoteSources: normalizeCachedRemoteSources(raw?.cachedRemoteSources),
    completedSteps: raw?.completedSteps ?? [],
    extractionSourceKey: raw?.extractionSourceKey ?? null,
    autoDraftPending: raw?.autoDraftPending ?? false,
    loadedFromDraftId:
      typeof raw?.loadedFromDraftId === "string" && raw.loadedFromDraftId.trim()
        ? raw.loadedFromDraftId.trim()
        : undefined,
  };
}

export function hasSowDraftSections(sections: Record<string, string>): boolean {
  return Object.values(sections).some((section) => section?.trim());
}

export function getSowCompletedSteps(workflow: SowWorkflowSnapshot): Set<SowWorkflowStep> {
  const completed = new Set<SowWorkflowStep>(workflow.completedSteps ?? []);
  if (workflow.sowDetails) {
    completed.add("input");
  }
  if (hasSowDraftSections(workflow.sections)) {
    completed.add("review");
  }
  return completed;
}

export function isSowStepAccessible(
  step: SowWorkflowStep,
  workflow: SowWorkflowSnapshot,
): boolean {
  if (step === "input") {
    return true;
  }
  if (step === "export") {
    return (workflow.completedSteps ?? []).includes("draft");
  }
  const stepIndex = SOW_STEP_ORDER.indexOf(step);
  if (stepIndex <= 0) {
    return false;
  }
  return getSowCompletedSteps(workflow).has(SOW_STEP_ORDER[stepIndex - 1]);
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

export function readActiveSowWorkflow(): SowWorkflowSnapshot {
  const stored = readJson<Partial<SowWorkflowSnapshot>>(ACTIVE_SOW_WORKFLOW_KEY);
  return normalizeSowWorkflow(stored);
}

export function writeActiveSowWorkflow(workflow: SowWorkflowSnapshot): void {
  try {
    localStorage.setItem(ACTIVE_SOW_WORKFLOW_KEY, JSON.stringify(normalizeSowWorkflow(workflow)));
  } catch {
    // quota exceeded — workflow still lives in memory
  }
}

export function createEmptySowWorkflowSnapshot(): SowWorkflowSnapshot {
  return normalizeSowWorkflow(null);
}

export function clearActiveSowWorkflow(): void {
  try {
    localStorage.removeItem(ACTIVE_SOW_WORKFLOW_KEY);
  } catch {
    // ignore
  }
}

export function sowWorkflowHasProgress(workflow: SowWorkflowSnapshot): boolean {
  if (workflow.sowDetails) return true;
  if (workflow.uploadedFiles.length > 0) return true;
  if (inputSourcesHaveProgress(workflow.inputSources)) return true;
  if (Object.values(workflow.sections).some((section) => section?.trim())) return true;
  return false;
}

export function getSowResumePath(workflow: SowWorkflowSnapshot): string {
  if (Object.values(workflow.sections).some((section) => section?.trim())) {
    return SOW_STEP_PATHS.draft;
  }
  if (workflow.sowDetails) {
    return SOW_STEP_PATHS.review;
  }
  return SOW_STEP_PATHS.input;
}

export function defaultSowDraftName(workflow: SowWorkflowSnapshot): string {
  const title = workflow.sowDetails?.engagement_title?.trim();
  if (title) return title;
  return `SOW contract ${new Date().toLocaleDateString()}`;
}

const SOW_DRAFT_LIBRARY_KEY = "patent-drafter-sow-draft-library";
const SOW_DRAFT_FILE_SUFFIX = ".sow-draft.json";
const MAX_SAVED_SOW_DRAFTS = 20;

export interface SavedSowDraftRecord {
  id: string;
  name: string;
  savedAt: string;
  workflow: SowWorkflowSnapshot;
}

export interface SowDraftFileExport {
  format: "patent-drafter-sow-draft";
  version: number;
  savedAt: string;
  name: string;
  workflow: SowWorkflowSnapshot;
}

const SOW_DRAFT_FILE_FORMAT = "patent-drafter-sow-draft";
const SOW_DRAFT_FILE_VERSION = 1;

function writeSowJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("Could not save draft. Browser storage may be full.");
  }
}

export function listSavedSowDrafts(): SavedSowDraftRecord[] {
  const records = readJson<SavedSowDraftRecord[]>(SOW_DRAFT_LIBRARY_KEY) ?? [];
  return records.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function saveSowDraftToLibrary(
  name: string,
  workflow: SowWorkflowSnapshot,
): SavedSowDraftRecord {
  const trimmedName = name.trim() || defaultSowDraftName(workflow);
  const { loadedFromDraftId: _omit, ...rest } = workflow;
  const record: SavedSowDraftRecord = {
    id: crypto.randomUUID(),
    name: trimmedName,
    savedAt: new Date().toISOString(),
    workflow: normalizeSowWorkflow(rest),
  };

  const existing = listSavedSowDrafts();
  const next = [record, ...existing].slice(0, MAX_SAVED_SOW_DRAFTS);
  writeSowJson(SOW_DRAFT_LIBRARY_KEY, next);
  notifyDraftsChanged();
  return record;
}

export function deleteSavedSowDraft(id: string): void {
  const next = listSavedSowDrafts().filter((draft) => draft.id !== id);
  writeSowJson(SOW_DRAFT_LIBRARY_KEY, next);
  notifyDraftsChanged();
}

export function buildSowDraftFileExport(
  name: string,
  workflow: SowWorkflowSnapshot,
): SowDraftFileExport {
  return {
    format: SOW_DRAFT_FILE_FORMAT,
    version: SOW_DRAFT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    name: name.trim() || defaultSowDraftName(workflow),
    workflow: normalizeSowWorkflow(workflow),
  };
}

export function parseSowDraftFile(raw: unknown): SowDraftFileExport {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid draft file.");
  }

  const data = raw as Partial<SowDraftFileExport>;
  if (data.format !== SOW_DRAFT_FILE_FORMAT) {
    throw new Error("Unrecognized SOW draft file format.");
  }
  if (!data.workflow || typeof data.workflow !== "object") {
    throw new Error("Draft file is missing workflow data.");
  }

  return {
    format: SOW_DRAFT_FILE_FORMAT,
    version: data.version ?? 1,
    savedAt: data.savedAt ?? new Date().toISOString(),
    name: data.name?.trim() || defaultSowDraftName(normalizeSowWorkflow(data.workflow)),
    workflow: normalizeSowWorkflow(data.workflow),
  };
}

export async function readSowDraftFile(file: File): Promise<SowDraftFileExport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Draft file is not valid JSON.");
  }
  return parseSowDraftFile(parsed);
}

export function downloadSowDraftFile(name: string, workflow: SowWorkflowSnapshot): void {
  const payload = buildSowDraftFileExport(name, workflow);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = name.trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "sow-draft";
  anchor.href = url;
  anchor.download = `${safeName}${SOW_DRAFT_FILE_SUFFIX}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
