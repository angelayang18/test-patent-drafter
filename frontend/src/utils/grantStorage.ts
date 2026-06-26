import type { GrantDetails } from "../types/patent";
import type { InputSources, UploadedSourceFile } from "../context/grantContext";
import type { CachedRemoteSources } from "./gatherSourceText";

export type GrantWorkflowStep = "input" | "review" | "draft" | "export";

export const GRANT_STEP_ORDER: GrantWorkflowStep[] = ["input", "review", "draft", "export"];

export const GRANT_STEP_PATHS: Record<GrantWorkflowStep, string> = {
  input: "/grant/input",
  review: "/grant/review",
  draft: "/grant/draft",
  export: "/grant/export",
};

export const ACTIVE_GRANT_WORKFLOW_KEY = "patent-drafter-grant-workflow";

export interface GrantWorkflowSnapshot {
  grantDetails: GrantDetails | null;
  sections: Record<string, string>;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources?: CachedRemoteSources;
  completedSteps?: GrantWorkflowStep[];
  extractionSourceKey?: string | null;
  autoDraftPending?: boolean;
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

export function normalizeGrantWorkflow(
  raw: Partial<GrantWorkflowSnapshot> | null | undefined,
): GrantWorkflowSnapshot {
  return {
    grantDetails: raw?.grantDetails ?? null,
    sections: raw?.sections ?? {},
    uploadedFiles: raw?.uploadedFiles ?? [],
    inputSources: { ...emptyInputSources, ...raw?.inputSources },
    cachedRemoteSources: raw?.cachedRemoteSources ?? {},
    completedSteps: raw?.completedSteps ?? [],
    extractionSourceKey: raw?.extractionSourceKey ?? null,
    autoDraftPending: raw?.autoDraftPending ?? false,
  };
}

export function hasGrantDraftSections(sections: Record<string, string>): boolean {
  return Object.values(sections).some((section) => section?.trim());
}

export function getGrantCompletedSteps(workflow: GrantWorkflowSnapshot): Set<GrantWorkflowStep> {
  const completed = new Set<GrantWorkflowStep>(workflow.completedSteps ?? []);
  if (workflow.grantDetails) {
    completed.add("input");
  }
  if (hasGrantDraftSections(workflow.sections)) {
    completed.add("review");
  }
  return completed;
}

export function isGrantStepAccessible(
  step: GrantWorkflowStep,
  workflow: GrantWorkflowSnapshot,
): boolean {
  if (step === "input") {
    return true;
  }
  if (step === "export") {
    return (workflow.completedSteps ?? []).includes("draft");
  }
  const stepIndex = GRANT_STEP_ORDER.indexOf(step);
  if (stepIndex <= 0) {
    return false;
  }
  return getGrantCompletedSteps(workflow).has(GRANT_STEP_ORDER[stepIndex - 1]);
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

export function readActiveGrantWorkflow(): GrantWorkflowSnapshot {
  const stored = readJson<Partial<GrantWorkflowSnapshot>>(ACTIVE_GRANT_WORKFLOW_KEY);
  return normalizeGrantWorkflow(stored);
}

export function writeActiveGrantWorkflow(workflow: GrantWorkflowSnapshot): void {
  try {
    localStorage.setItem(ACTIVE_GRANT_WORKFLOW_KEY, JSON.stringify(normalizeGrantWorkflow(workflow)));
  } catch {
    // quota exceeded — workflow still lives in memory
  }
}

export function createEmptyGrantWorkflowSnapshot(): GrantWorkflowSnapshot {
  return normalizeGrantWorkflow(null);
}

export function clearActiveGrantWorkflow(): void {
  try {
    localStorage.removeItem(ACTIVE_GRANT_WORKFLOW_KEY);
  } catch {
    // ignore
  }
}

export function grantWorkflowHasProgress(workflow: GrantWorkflowSnapshot): boolean {
  if (workflow.grantDetails) return true;
  if (workflow.uploadedFiles.length > 0) return true;
  if (Object.values(workflow.inputSources).some((value) => value.trim())) return true;
  if (Object.values(workflow.sections).some((section) => section?.trim())) return true;
  return false;
}

export function getGrantResumePath(workflow: GrantWorkflowSnapshot): string {
  if (Object.values(workflow.sections).some((section) => section?.trim())) {
    return GRANT_STEP_PATHS.draft;
  }
  if (workflow.grantDetails) {
    return GRANT_STEP_PATHS.review;
  }
  return GRANT_STEP_PATHS.input;
}

export function defaultGrantDraftName(workflow: GrantWorkflowSnapshot): string {
  const title = workflow.grantDetails?.project_title?.trim();
  if (title) return title;
  return `Grant application ${new Date().toLocaleDateString()}`;
}

const GRANT_DRAFT_LIBRARY_KEY = "patent-drafter-grant-draft-library";
const GRANT_DRAFT_FILE_SUFFIX = ".grant-draft.json";
const MAX_SAVED_GRANT_DRAFTS = 20;

export interface SavedGrantDraftRecord {
  id: string;
  name: string;
  savedAt: string;
  workflow: GrantWorkflowSnapshot;
}

export interface GrantDraftFileExport {
  format: "patent-drafter-grant-draft";
  version: number;
  savedAt: string;
  name: string;
  workflow: GrantWorkflowSnapshot;
}

const GRANT_DRAFT_FILE_FORMAT = "patent-drafter-grant-draft";
const GRANT_DRAFT_FILE_VERSION = 1;

function writeGrantJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("Could not save draft. Browser storage may be full.");
  }
}

export function listSavedGrantDrafts(): SavedGrantDraftRecord[] {
  const records = readJson<SavedGrantDraftRecord[]>(GRANT_DRAFT_LIBRARY_KEY) ?? [];
  return records.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function saveGrantDraftToLibrary(
  name: string,
  workflow: GrantWorkflowSnapshot,
): SavedGrantDraftRecord {
  const trimmedName = name.trim() || defaultGrantDraftName(workflow);
  const record: SavedGrantDraftRecord = {
    id: crypto.randomUUID(),
    name: trimmedName,
    savedAt: new Date().toISOString(),
    workflow: normalizeGrantWorkflow(workflow),
  };

  const existing = listSavedGrantDrafts();
  const next = [record, ...existing].slice(0, MAX_SAVED_GRANT_DRAFTS);
  writeGrantJson(GRANT_DRAFT_LIBRARY_KEY, next);
  return record;
}

export function deleteSavedGrantDraft(id: string): void {
  const next = listSavedGrantDrafts().filter((draft) => draft.id !== id);
  writeGrantJson(GRANT_DRAFT_LIBRARY_KEY, next);
}

export function buildGrantDraftFileExport(
  name: string,
  workflow: GrantWorkflowSnapshot,
): GrantDraftFileExport {
  return {
    format: GRANT_DRAFT_FILE_FORMAT,
    version: GRANT_DRAFT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    name: name.trim() || defaultGrantDraftName(workflow),
    workflow: normalizeGrantWorkflow(workflow),
  };
}

export function parseGrantDraftFile(raw: unknown): GrantDraftFileExport {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid draft file.");
  }

  const data = raw as Partial<GrantDraftFileExport>;
  if (data.format !== GRANT_DRAFT_FILE_FORMAT) {
    throw new Error("Unrecognized grant draft file format.");
  }
  if (!data.workflow || typeof data.workflow !== "object") {
    throw new Error("Draft file is missing workflow data.");
  }

  return {
    format: GRANT_DRAFT_FILE_FORMAT,
    version: data.version ?? 1,
    savedAt: data.savedAt ?? new Date().toISOString(),
    name: data.name?.trim() || defaultGrantDraftName(normalizeGrantWorkflow(data.workflow)),
    workflow: normalizeGrantWorkflow(data.workflow),
  };
}

export async function readGrantDraftFile(file: File): Promise<GrantDraftFileExport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Draft file is not valid JSON.");
  }
  return parseGrantDraftFile(parsed);
}

export function downloadGrantDraftFile(name: string, workflow: GrantWorkflowSnapshot): void {
  const payload = buildGrantDraftFileExport(name, workflow);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = name.trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "grant-draft";
  anchor.href = url;
  anchor.download = `${safeName}${GRANT_DRAFT_FILE_SUFFIX}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
