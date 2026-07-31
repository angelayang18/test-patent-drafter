import type { SectionCitation } from "../types/patent";
import type { InputSources, UploadedSourceFile } from "../context/genericContext";
import type { CachedRemoteSources } from "./gatherSourceText";
import { notifyDraftsChanged } from "./draftLibraryEvents";
import type { SectionSettingsMap } from "./sectionSettings";

export type GenericWorkflowStep = "input" | "review" | "draft" | "export";

export const GENERIC_STEP_ORDER: GenericWorkflowStep[] = [
  "input",
  "review",
  "draft",
  "export",
];

export interface GenericDocumentDetails {
  title: string;
}

export const activeGenericWorkflowKey = (templateId: string) =>
  `patent-drafter-generic-workflow-${templateId}`;

export const genericDraftLibraryKey = (templateId: string) =>
  `patent-drafter-generic-draft-library-${templateId}`;

export const GENERIC_STEP_PATHS = (
  templateId: string,
): Record<GenericWorkflowStep, string> => ({
  input: `/custom/${templateId}/input`,
  review: `/custom/${templateId}/review`,
  draft: `/custom/${templateId}/draft`,
  export: `/custom/${templateId}/export`,
});

export interface GenericWorkflowSnapshot {
  details: GenericDocumentDetails | null;
  sections: Record<string, string>;
  sectionCitations?: Record<string, SectionCitation[]>;
  /** Citations for the Review-page document title (scoped to this template's storage key). */
  titleCitations?: SectionCitation[];
  /** Per-section reviewer notes (scoped to this template's storage key only). */
  reviewerFeedback?: Record<string, string>;
  sectionSettings?: SectionSettingsMap;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources?: CachedRemoteSources;
  completedSteps?: GenericWorkflowStep[];
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

function normalizeDetails(
  raw: Partial<GenericDocumentDetails> | null | undefined,
): GenericDocumentDetails | null {
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title : "";
  return { title };
}

export function normalizeGenericWorkflow(
  raw: Partial<GenericWorkflowSnapshot> | null | undefined,
): GenericWorkflowSnapshot {
  return {
    details: normalizeDetails(raw?.details),
    sections: raw?.sections ?? {},
    sectionCitations: raw?.sectionCitations ?? {},
    titleCitations: Array.isArray(raw?.titleCitations) ? raw.titleCitations : [],
    reviewerFeedback: raw?.reviewerFeedback ?? {},
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

export function hasGenericDraftSections(sections: Record<string, string>): boolean {
  return Object.values(sections).some((section) => section?.trim());
}

export function getGenericCompletedSteps(
  workflow: GenericWorkflowSnapshot,
): Set<GenericWorkflowStep> {
  const completed = new Set<GenericWorkflowStep>(workflow.completedSteps ?? []);
  if (workflow.details?.title?.trim()) {
    completed.add("input");
  }
  if (hasGenericDraftSections(workflow.sections)) {
    completed.add("review");
  }
  return completed;
}

export function isGenericStepAccessible(
  step: GenericWorkflowStep,
  workflow: GenericWorkflowSnapshot,
): boolean {
  if (step === "input") {
    return true;
  }
  if (step === "export") {
    return (workflow.completedSteps ?? []).includes("draft");
  }
  const stepIndex = GENERIC_STEP_ORDER.indexOf(step);
  if (stepIndex <= 0) {
    return false;
  }
  return getGenericCompletedSteps(workflow).has(GENERIC_STEP_ORDER[stepIndex - 1]);
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

export function readActiveGenericWorkflow(templateId: string): GenericWorkflowSnapshot {
  const stored = readJson<Partial<GenericWorkflowSnapshot>>(
    activeGenericWorkflowKey(templateId),
  );
  return normalizeGenericWorkflow(stored);
}

export function writeActiveGenericWorkflow(
  templateId: string,
  workflow: GenericWorkflowSnapshot,
): void {
  try {
    localStorage.setItem(
      activeGenericWorkflowKey(templateId),
      JSON.stringify(normalizeGenericWorkflow(workflow)),
    );
  } catch {
    // quota exceeded — workflow still lives in memory
  }
}

export function createEmptyGenericWorkflowSnapshot(): GenericWorkflowSnapshot {
  return normalizeGenericWorkflow(null);
}

export function clearActiveGenericWorkflow(templateId: string): void {
  try {
    localStorage.removeItem(activeGenericWorkflowKey(templateId));
  } catch {
    // ignore
  }
}

export function genericWorkflowHasProgress(workflow: GenericWorkflowSnapshot): boolean {
  if (workflow.details?.title?.trim()) return true;
  if (workflow.uploadedFiles.length > 0) return true;
  if (inputSourcesHaveProgress(workflow.inputSources)) return true;
  if (Object.values(workflow.sections).some((section) => section?.trim())) return true;
  return false;
}

export function getGenericResumePath(
  templateId: string,
  workflow: GenericWorkflowSnapshot,
): string {
  const paths = GENERIC_STEP_PATHS(templateId);
  if (Object.values(workflow.sections).some((section) => section?.trim())) {
    return paths.draft;
  }
  if (workflow.details?.title?.trim()) {
    return paths.review;
  }
  return paths.input;
}

export function defaultGenericDraftName(workflow: GenericWorkflowSnapshot): string {
  const title = workflow.details?.title?.trim();
  if (title) return title;
  return `Custom document ${new Date().toLocaleDateString()}`;
}

const GENERIC_DRAFT_FILE_SUFFIX = ".generic-draft.json";
const MAX_SAVED_GENERIC_DRAFTS = 20;

export interface SavedGenericDraftRecord {
  id: string;
  name: string;
  savedAt: string;
  workflow: GenericWorkflowSnapshot;
}

export interface GenericDraftFileExport {
  format: "patent-drafter-generic-draft";
  version: number;
  savedAt: string;
  name: string;
  workflow: GenericWorkflowSnapshot;
}

const GENERIC_DRAFT_FILE_FORMAT = "patent-drafter-generic-draft";
const GENERIC_DRAFT_FILE_VERSION = 1;

function writeGenericJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error("Could not save draft. Browser storage may be full.");
  }
}

export function listSavedGenericDrafts(templateId: string): SavedGenericDraftRecord[] {
  const records =
    readJson<SavedGenericDraftRecord[]>(genericDraftLibraryKey(templateId)) ?? [];
  return records.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

export function saveGenericDraftToLibrary(
  templateId: string,
  name: string,
  workflow: GenericWorkflowSnapshot,
): SavedGenericDraftRecord {
  const trimmedName = name.trim() || defaultGenericDraftName(workflow);
  const { loadedFromDraftId: _omit, ...rest } = workflow;
  const record: SavedGenericDraftRecord = {
    id: crypto.randomUUID(),
    name: trimmedName,
    savedAt: new Date().toISOString(),
    workflow: normalizeGenericWorkflow(rest),
  };

  const existing = listSavedGenericDrafts(templateId);
  const next = [record, ...existing].slice(0, MAX_SAVED_GENERIC_DRAFTS);
  writeGenericJson(genericDraftLibraryKey(templateId), next);
  notifyDraftsChanged();
  return record;
}

export function deleteSavedGenericDraft(templateId: string, id: string): void {
  const next = listSavedGenericDrafts(templateId).filter((draft) => draft.id !== id);
  writeGenericJson(genericDraftLibraryKey(templateId), next);
  notifyDraftsChanged();
}

export function buildGenericDraftFileExport(
  name: string,
  workflow: GenericWorkflowSnapshot,
): GenericDraftFileExport {
  return {
    format: GENERIC_DRAFT_FILE_FORMAT,
    version: GENERIC_DRAFT_FILE_VERSION,
    savedAt: new Date().toISOString(),
    name: name.trim() || defaultGenericDraftName(workflow),
    workflow: normalizeGenericWorkflow(workflow),
  };
}

export function parseGenericDraftFile(raw: unknown): GenericDraftFileExport {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid draft file.");
  }

  const data = raw as Partial<GenericDraftFileExport>;
  if (data.format !== GENERIC_DRAFT_FILE_FORMAT) {
    throw new Error("Unrecognized generic draft file format.");
  }
  if (!data.workflow || typeof data.workflow !== "object") {
    throw new Error("Draft file is missing workflow data.");
  }

  return {
    format: GENERIC_DRAFT_FILE_FORMAT,
    version: data.version ?? 1,
    savedAt: data.savedAt ?? new Date().toISOString(),
    name:
      data.name?.trim() ||
      defaultGenericDraftName(normalizeGenericWorkflow(data.workflow)),
    workflow: normalizeGenericWorkflow(data.workflow),
  };
}

export async function readGenericDraftFile(file: File): Promise<GenericDraftFileExport> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Draft file is not valid JSON.");
  }
  return parseGenericDraftFile(parsed);
}

export function downloadGenericDraftFile(
  name: string,
  workflow: GenericWorkflowSnapshot,
): void {
  const payload = buildGenericDraftFileExport(name, workflow);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName =
    name.trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-") || "generic-draft";
  anchor.href = url;
  anchor.download = `${safeName}${GENERIC_DRAFT_FILE_SUFFIX}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
