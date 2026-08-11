import { defaultAdaDetails, type ADADetails, type SectionCitation } from "../types/patent";
import type { InputSources, UploadedSourceFile } from "../context/adaContext";
import type { CachedRemoteSources } from "./gatherSourceText";
import { notifyDraftsChanged } from "./draftLibraryEvents";
import type { SectionSettingsMap } from "./sectionSettings";
import { getStorageKey } from "./userScopedStorage";

export type AdaWorkflowStep = "input" | "review" | "draft" | "export";

export const ADA_STEP_ORDER: AdaWorkflowStep[] = ["input", "review", "draft", "export"];

export const ADA_STEP_PATHS: Record<AdaWorkflowStep, string> = {
  input: "/ada/input",
  review: "/ada/review",
  draft: "/ada/draft",
  export: "/ada/export",
};

export const ACTIVE_ADA_WORKFLOW_KEY = "patent-drafter-ada-workflow";

export interface AdaWorkflowSnapshot {
  adaDetails: ADADetails | null;
  sections: Record<string, string>;
  sectionCitations?: Record<string, SectionCitation[]>;
  /** Per-section ADA reviewer notes (ADA-only; never shared with other doc types). */
  reviewerFeedback?: Record<string, string>;
  /** Citations keyed by extracted Review field id (not draft section id). */
  fieldCitations?: Record<string, SectionCitation[]>;
  sectionSettings?: SectionSettingsMap;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources?: CachedRemoteSources;
  completedSteps?: AdaWorkflowStep[];
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

export function normalizeAdaWorkflow(
  raw: Partial<AdaWorkflowSnapshot> | null | undefined,
): AdaWorkflowSnapshot {
  return {
    adaDetails: raw?.adaDetails
      ? { ...defaultAdaDetails, ...raw.adaDetails }
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

export function hasAdaDraftSections(sections: Record<string, string>): boolean {
  return Object.values(sections).some((section) => section?.trim());
}

export function getAdaCompletedSteps(workflow: AdaWorkflowSnapshot): Set<AdaWorkflowStep> {
  const completed = new Set<AdaWorkflowStep>(workflow.completedSteps ?? []);
  if (workflow.adaDetails) {
    completed.add("input");
  }
  if (hasAdaDraftSections(workflow.sections)) {
    completed.add("review");
  }
  return completed;
}

export function isAdaStepAccessible(
  step: AdaWorkflowStep,
  workflow: AdaWorkflowSnapshot,
): boolean {
  if (step === "input") {
    return true;
  }
  if (step === "export") {
    return (workflow.completedSteps ?? []).includes("draft");
  }
  const stepIndex = ADA_STEP_ORDER.indexOf(step);
  if (stepIndex <= 0) {
    return false;
  }
  return getAdaCompletedSteps(workflow).has(ADA_STEP_ORDER[stepIndex - 1]);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function readActiveAdaWorkflow(): AdaWorkflowSnapshot {
  const stored = readJson<Partial<AdaWorkflowSnapshot>>(ACTIVE_ADA_WORKFLOW_KEY);
  return normalizeAdaWorkflow(stored);
}

export function writeActiveAdaWorkflow(workflow: AdaWorkflowSnapshot): void {
  try {
    localStorage.setItem(
      getStorageKey(ACTIVE_ADA_WORKFLOW_KEY),
      JSON.stringify(normalizeAdaWorkflow(workflow)),
    );
  } catch {
    // quota exceeded — workflow still lives in memory
  }
}

export function createEmptyAdaWorkflowSnapshot(): AdaWorkflowSnapshot {
  return normalizeAdaWorkflow(null);
}

export function clearActiveAdaWorkflow(): void {
  try {
    localStorage.removeItem(getStorageKey(ACTIVE_ADA_WORKFLOW_KEY));
  } catch {
    // ignore
  }
}

export function adaWorkflowHasProgress(workflow: AdaWorkflowSnapshot): boolean {
  if (workflow.adaDetails) return true;
  if (workflow.uploadedFiles.length > 0) return true;
  if (inputSourcesHaveProgress(workflow.inputSources)) return true;
  if (Object.values(workflow.sections).some((section) => section?.trim())) return true;
  return false;
}

export function getAdaResumePath(workflow: AdaWorkflowSnapshot): string {
  if (Object.values(workflow.sections).some((section) => section?.trim())) {
    return ADA_STEP_PATHS.draft;
  }
  if (workflow.adaDetails) {
    return ADA_STEP_PATHS.review;
  }
  return ADA_STEP_PATHS.input;
}

export function defaultAdaDraftName(workflow: AdaWorkflowSnapshot): string {
  const title = workflow.adaDetails?.study_title?.trim();
  if (title) return title;
  return `ADA report ${new Date().toLocaleDateString()}`;
}

const ADA_DRAFT_LIBRARY_KEY = "patent-drafter-ada-draft-library";
const ADA_DRAFT_FILE_SUFFIX = ".ada-draft.json";
const MAX_SAVED_ADA_DRAFTS = 20;

export interface SavedAdaDraftRecord {
  id: string;
  name: string;
  savedAt: string;
  workflow: AdaWorkflowSnapshot;
}

export interface AdaDraftFileExport {
  format: "patent-drafter-ada-draft";
  version: number;
  savedAt: string;
  name: string;
  workflow: AdaWorkflowSnapshot;
}

const ADA_DRAFT_FILE_FORMAT = "patent-drafter-ada-draft";
const ADA_DRAFT_FILE_VERSION = 1;

function writeAdaJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch {
    throw new Error("Could not save draft. Browser storage may be full.");
  }
}

export function listSavedAdaDrafts(): SavedAdaDraftRecord[] {
  const records = readJson<SavedAdaDraftRecord[]>(ADA_DRAFT_LIBRARY_KEY) ?? [];
  return records.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function saveAdaDraftToLibrary(
  name: string,
  workflow: AdaWorkflowSnapshot,
): SavedAdaDraftRecord {
  const trimmedName = name.trim() || defaultAdaDraftName(workflow);
  const { loadedFromDraftId: _omit, ...rest } = workflow;
  const record: SavedAdaDraftRecord = {
    id: crypto.randomUUID(),
    name: trimmedName,
    savedAt: new Date().toISOString(),
    workflow: normalizeAdaWorkflow(rest),
  };

  const existing = listSavedAdaDrafts();
  const next = [record, ...existing].slice(0, MAX_SAVED_ADA_DRAFTS);
  writeAdaJson(ADA_DRAFT_LIBRARY_KEY, next);
  notifyDraftsChanged();
  return record;
}

export function deleteSavedAdaDraft(id: string): void {
  const next = listSavedAdaDrafts().filter((draft) => draft.id !== id);
  writeAdaJson(ADA_DRAFT_LIBRARY_KEY, next);
  notifyDraftsChanged();
}

export function buildAdaDraftFileExport(
  name: string,
  workflow: AdaWorkflowSnapshot,
): AdaDraftFileExport {
  return {
    format: ADA_DRAFT_FILE_FORMAT,
    version: ADA_DRAFT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    name: name.trim() || defaultAdaDraftName(workflow),
    workflow: normalizeAdaWorkflow(workflow),
  };
}

export function parseAdaDraftFile(raw: unknown): AdaDraftFileExport {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid draft file.");
  }

  const data = raw as Partial<AdaDraftFileExport>;
  if (data.format !== ADA_DRAFT_FILE_FORMAT) {
    throw new Error("Unrecognized ADA draft file format.");
  }
  if (!data.workflow || typeof data.workflow !== "object") {
    throw new Error("Draft file is missing workflow data.");
  }

  return {
    format: ADA_DRAFT_FILE_FORMAT,
    version: data.version ?? 1,
    savedAt: data.savedAt ?? new Date().toISOString(),
    name: data.name?.trim() || defaultAdaDraftName(normalizeAdaWorkflow(data.workflow)),
    workflow: normalizeAdaWorkflow(data.workflow),
  };
}

export async function readAdaDraftFile(file: File): Promise<AdaDraftFileExport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Draft file is not valid JSON.");
  }
  return parseAdaDraftFile(parsed);
}

export function downloadAdaDraftFile(name: string, workflow: AdaWorkflowSnapshot): void {
  const payload = buildAdaDraftFileExport(name, workflow);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = name.trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "ada-draft";
  anchor.href = url;
  anchor.download = `${safeName}${ADA_DRAFT_FILE_SUFFIX}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
