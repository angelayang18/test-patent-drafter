import { ADA_DETAIL_FIELD_LABELS } from "../constants/adaFields";
import { GRANT_DETAIL_FIELD_LABELS } from "../constants/grantFields";
import { PATENT_DETAIL_FIELD_LABELS } from "../constants/patentFields";
import { SOW_DETAIL_FIELD_LABELS } from "../constants/sowFields";
import type {
  FilingInfo,
  PatentFigure,
  PatentSectionId,
  SectionCitation,
  WorkflowMode,
} from "../types/patent";
import {
  EMPTY_FILING_INFO,
  defaultGrantDetails,
  defaultInvention,
  emptyApprovedExemplars,
  emptyAttorneyFeedback,
  ADA_SECTION_IDS,
  ADA_SECTION_LABELS,
  GRANT_SECTION_IDS,
  GRANT_SECTION_LABELS,
  PATENT_SECTION_IDS,
  SECTION_LABELS,
  SOW_SECTION_IDS,
  SOW_SECTION_LABELS,
} from "../types/patent";
import type { InputSources, UploadedSourceFile } from "../context/PatentWorkflowContext";
import type { CachedRemoteSources } from "./gatherSourceText";
import type { GrantDetails, InventionDetails } from "../types/patent";
import {
  listSavedAdaDrafts,
  type SavedAdaDraftRecord,
} from "./adaStorage";
import type { DocumentTypeTemplate } from "./documentTypeTemplates";
import { listDocumentTypeTemplates } from "./documentTypeTemplates";
import {
  listSavedGrantDrafts,
  type SavedGrantDraftRecord,
} from "./grantStorage";
import {
  hasGenericDraftSections,
  listSavedGenericDrafts,
  type SavedGenericDraftRecord,
} from "./genericStorage";
import { notifyDraftsChanged } from "./draftLibraryEvents";
import { sanitizePatentProse } from "./documentPreview";
import {
  defaultSectionSettings,
  effectiveSectionIds,
  resolveSectionLabel,
  resolveSectionOrder,
  type SectionSettingsMap,
} from "./sectionSettings";
import {
  listSavedSowDrafts,
  type SavedSowDraftRecord,
} from "./sowStorage";
import { getStorageKey } from "./userScopedStorage";

export { DRAFTS_CHANGED_EVENT, notifyDraftsChanged } from "./draftLibraryEvents";

export type WorkflowStep = "input" | "review" | "draft" | "figures" | "export";

export const WORKFLOW_STEP_ORDER: WorkflowStep[] = [
  "input",
  "review",
  "draft",
  "figures",
  "export",
];

export const WORKFLOW_STEP_PATHS: Record<WorkflowStep, string> = {
  input: "/patent",
  review: "/patent/review",
  draft: "/patent/draft",
  figures: "/patent/figures",
  export: "/patent/export",
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
  sectionCitations?: Record<string, SectionCitation[]>;
  /** Citations keyed by extracted Review field id (not draft section id). */
  fieldCitations?: Record<string, SectionCitation[]>;
  sectionSettings?: SectionSettingsMap;
  approvedExemplars?: Record<PatentSectionId, boolean>;
  aiInitialSections?: Record<string, string>;
  includeInLearningCorpus?: boolean;
  /** Steps explicitly finished via footer navigation (merged with inferred progress). */
  completedSteps?: WorkflowStep[];
  /** Fingerprint of sources used for the last successful extraction. */
  extractionSourceKey?: string | null;
  /** Set when leaving Review via "Next: Draft"; consumed once on the Draft page. */
  autoDraftPending?: boolean;
  /**
   * Library draft id this active session was opened from (Drafts modal).
   * Session-only metadata — stripped when saving into the draft library.
   */
  loadedFromDraftId?: string;
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
    invention: raw?.invention
      ? { ...defaultInvention, ...raw.invention }
      : null,
    grantDetails: raw?.grantDetails
      ? { ...defaultGrantDetails, ...raw.grantDetails }
      : null,
    sections: sanitizeSections(raw?.sections),
    figures: raw?.figures ?? [],
    brief_description_of_drawings: raw?.brief_description_of_drawings ?? "",
    filingInfo: { ...EMPTY_FILING_INFO, ...raw?.filingInfo },
    uploadedFiles: raw?.uploadedFiles ?? [],
    inputSources: normalizeInputSources(raw?.inputSources as LegacyInputSources | undefined),
    cachedRemoteSources: normalizeCachedRemoteSources(raw?.cachedRemoteSources),
    attorneyFeedback: { ...emptyAttorneyFeedback(), ...raw?.attorneyFeedback },
    attorneyFeedbackGlobal: raw?.attorneyFeedbackGlobal ?? "",
    sectionCitations: raw?.sectionCitations ?? {},
    fieldCitations: raw?.fieldCitations ?? {},
    sectionSettings: raw?.sectionSettings,
    approvedExemplars: { ...emptyApprovedExemplars(), ...raw?.approvedExemplars },
    aiInitialSections: raw?.aiInitialSections ?? {},
    includeInLearningCorpus: raw?.includeInLearningCorpus ?? true,
    completedSteps: raw?.completedSteps ?? [],
    extractionSourceKey: raw?.extractionSourceKey ?? null,
    autoDraftPending: raw?.autoDraftPending ?? false,
    loadedFromDraftId:
      typeof raw?.loadedFromDraftId === "string" && raw.loadedFromDraftId.trim()
        ? raw.loadedFromDraftId.trim()
        : undefined,
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
    const raw = localStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(getStorageKey(key), JSON.stringify(value));
  } catch {
    // quota exceeded — caller may surface an error
    throw new Error("Could not save draft. Browser storage may be full.");
  }
}

/** Migrate sessionStorage workflow from older builds, then read active workflow. */
export function readActiveWorkflow(): WorkflowSnapshot {
  try {
    const legacy = sessionStorage.getItem(LEGACY_SESSION_KEY);
    if (legacy && !localStorage.getItem(getStorageKey(ACTIVE_WORKFLOW_KEY))) {
      localStorage.setItem(getStorageKey(ACTIVE_WORKFLOW_KEY), legacy);
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
    localStorage.removeItem(getStorageKey(ACTIVE_WORKFLOW_KEY));
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
  const { loadedFromDraftId: _omit, ...rest } = workflow;
  const record: SavedDraftRecord = {
    id: crypto.randomUUID(),
    name: trimmedName,
    savedAt: new Date().toISOString(),
    workflow: normalizeWorkflow(rest),
  };

  const existing = listSavedDrafts();
  const next = [record, ...existing].slice(0, MAX_SAVED_DRAFTS);
  writeJson(DRAFT_LIBRARY_KEY, next);
  notifyDraftsChanged();
  return record;
}

export function deleteSavedDraft(id: string): void {
  const next = listSavedDrafts().filter((draft) => draft.id !== id);
  writeJson(DRAFT_LIBRARY_KEY, next);
  notifyDraftsChanged();
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
  if (inputSourcesHaveProgress(workflow.inputSources)) return true;
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
    return "/patent/figures";
  }
  if (Object.values(workflow.sections).some((section) => section?.trim())) {
    return "/patent/draft";
  }
  if (workflow.invention) {
    return "/patent/review";
  }
  return "/patent";
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

/** Kind used for the import-as-source pool (broader than WorkflowMode). */
export type ImportableDraftKind = "patent" | "grant" | "sow" | "ada" | "generic";

const KIND_LABELS: Record<ImportableDraftKind, string> = {
  grant: "Grant Application Draft",
  patent: "Patent Draft",
  sow: "SOW Draft",
  ada: "ADA Draft",
  generic: "Custom Document",
};

export interface OtherWorkflowDraftSectionPreview {
  id: string;
  label: string;
  preview: string;
}

export type ImportSummaryContentSource = "sections" | "details";

export interface SavedDraftImportSummary {
  id: string;
  title: string;
  displayLabel: string;
  kind: ImportableDraftKind;
  savedAt: string;
  sections: OtherWorkflowDraftSectionPreview[];
  serializedText: string;
  /** Whether the summary was built from drafted sections or extracted Review details. */
  contentSource: ImportSummaryContentSource;
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

/** Normalize draft titles for use inside ``--- … ---`` chunk headers. */
export function sanitizeImportedDraftTitle(title: string): string {
  const normalized = title.replace(/\s+/g, " ").replace(/---/g, "—").trim();
  return normalized || "Untitled draft";
}

/**
 * Stable per-draft markers so multiple drafts can coexist in pastedText.
 * The header label (text between ``---``) becomes the citation source label.
 */
export function importedDraftMarkers(
  draftId: string,
  title: string,
): { start: string; end: string } {
  const safeTitle = sanitizeImportedDraftTitle(title);
  return {
    start: `--- Imported Draft: ${safeTitle} [id=${draftId}] ---`,
    end: `--- End Imported Draft: ${safeTitle} [id=${draftId}] ---`,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate start/end marker lines for a draft id when the title is unknown
 * (inject/strip/detect only receive the draft id).
 */
function findImportedDraftMarkersById(
  pastedText: string,
  draftId: string,
): { start: string; end: string; startIdx: number; endIdx: number } | null {
  const idPattern = escapeRegExp(draftId);
  const startRe = new RegExp(
    `--- Imported Draft: .+? \\[id=${idPattern}\\] ---`,
  );
  const endRe = new RegExp(
    `--- End Imported Draft: .+? \\[id=${idPattern}\\] ---`,
  );
  const startMatch = startRe.exec(pastedText);
  if (!startMatch) return null;
  const startIdx = startMatch.index;
  const endMatch = endRe.exec(pastedText.slice(startIdx));
  if (!endMatch) return null;
  return {
    start: startMatch[0],
    end: endMatch[0],
    startIdx,
    endIdx: startIdx + endMatch.index,
  };
}

/**
 * Build an importable summary from kind + sections (shared by all draft libraries).
 */
function buildImportSummaryFromSections(params: {
  id: string;
  savedAt: string;
  kind: ImportableDraftKind;
  title: string;
  sections: Record<string, string>;
  orderedIds: readonly string[];
  labels: Record<string, string>;
}): SavedDraftImportSummary | null {
  const sectionPreviews = buildSectionPreviews(
    params.sections,
    params.orderedIds,
    params.labels,
  );
  if (sectionPreviews.length === 0) {
    return null;
  }
  const kindLabel = KIND_LABELS[params.kind];
  const body = serializeSectionsBlock(
    params.sections,
    params.orderedIds,
    params.labels,
  );
  return {
    id: params.id,
    title: params.title,
    displayLabel: `${kindLabel} — ${params.title}`,
    kind: params.kind,
    savedAt: params.savedAt,
    sections: sectionPreviews,
    serializedText: wrapImportedDraftBlock(params.id, body, params.title),
    contentSource: "sections",
  };
}

/**
 * Fallback import summary built from extracted Review-step details when no
 * drafted section text has been saved yet.
 */
function buildImportSummaryFromDetails(params: {
  id: string;
  savedAt: string;
  kind: ImportableDraftKind;
  title: string;
  details: Record<string, unknown>;
  fieldLabels: Record<string, string>;
}): SavedDraftImportSummary | null {
  const parts: string[] = [];
  const previews: OtherWorkflowDraftSectionPreview[] = [];
  for (const [key, label] of Object.entries(params.fieldLabels)) {
    const value = params.details[key];
    const text = Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean).join(", ")
      : String(value ?? "").trim();
    if (!text) continue;
    parts.push(`## ${label}\n\n${text}`);
    previews.push({ id: key, label, preview: truncatePreview(text) });
  }
  if (parts.length === 0) return null;
  const kindLabel = KIND_LABELS[params.kind];
  return {
    id: params.id,
    title: params.title,
    displayLabel: `${kindLabel} — ${params.title} (details only, not yet drafted)`,
    kind: params.kind,
    savedAt: params.savedAt,
    sections: previews,
    serializedText: wrapImportedDraftBlock(params.id, parts.join("\n\n"), params.title),
    contentSource: "details",
  };
}

/** Wrap serialized draft sections in per-draft markers for toggle inject/remove. */
export function wrapImportedDraftBlock(
  draftId: string,
  body: string,
  title: string,
): string {
  const markers = importedDraftMarkers(draftId, title);
  return `${markers.start}\n${body.trim()}\n${markers.end}`;
}

/** Remove a previously injected draft block (keyed by draft id) from pasted text. */
export function stripImportedDraftBlock(
  pastedText: string,
  draftId: string,
): string {
  const found = findImportedDraftMarkersById(pastedText, draftId);
  if (!found) {
    return pastedText;
  }
  const before = pastedText.slice(0, found.startIdx);
  const after = pastedText.slice(found.endIdx + found.end.length);
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Build an importable summary for a patent-library SavedDraftRecord.
 * Prefers drafted sections; falls back to extracted invention/grant details.
 * Returns null only when both are empty.
 */
export function getSavedDraftImportSummary(
  record: SavedDraftRecord,
): SavedDraftImportSummary | null {
  const mode = record.workflow.workflowMode === "grant" ? "grant" : "patent";
  if (mode === "grant") {
    const title =
      record.workflow.grantDetails?.project_title?.trim() ||
      record.name.trim() ||
      "Untitled grant application";
    const fromSections = buildImportSummaryFromSections({
      id: record.id,
      savedAt: record.savedAt,
      kind: "grant",
      title,
      sections: record.workflow.sections,
      orderedIds: GRANT_SECTION_IDS,
      labels: GRANT_SECTION_LABELS,
    });
    if (fromSections) return fromSections;
    if (!record.workflow.grantDetails) return null;
    return buildImportSummaryFromDetails({
      id: record.id,
      savedAt: record.savedAt,
      kind: "grant",
      title,
      details: record.workflow.grantDetails as unknown as Record<string, unknown>,
      fieldLabels: GRANT_DETAIL_FIELD_LABELS,
    });
  }

  const title =
    record.workflow.invention?.invention_title?.trim() ||
    record.name.trim() ||
    "Untitled patent draft";
  const fromSections = buildImportSummaryFromSections({
    id: record.id,
    savedAt: record.savedAt,
    kind: "patent",
    title,
    sections: record.workflow.sections,
    orderedIds: PATENT_SECTION_IDS,
    labels: SECTION_LABELS,
  });
  if (fromSections) return fromSections;
  if (!record.workflow.invention) return null;
  return buildImportSummaryFromDetails({
    id: record.id,
    savedAt: record.savedAt,
    kind: "patent",
    title,
    details: record.workflow.invention as unknown as Record<string, unknown>,
    fieldLabels: PATENT_DETAIL_FIELD_LABELS,
  });
}

/**
 * Build an importable summary for a grant-library SavedGrantDraftRecord.
 * Prefers drafted sections; falls back to extracted grant details.
 * Returns null only when both are empty.
 */
export function getSavedGrantDraftImportSummary(
  record: SavedGrantDraftRecord,
): SavedDraftImportSummary | null {
  const title =
    record.workflow.grantDetails?.project_title?.trim() ||
    record.name.trim() ||
    "Untitled grant application";
  const fromSections = buildImportSummaryFromSections({
    id: record.id,
    savedAt: record.savedAt,
    kind: "grant",
    title,
    sections: record.workflow.sections,
    orderedIds: GRANT_SECTION_IDS,
    labels: GRANT_SECTION_LABELS,
  });
  if (fromSections) return fromSections;
  if (!record.workflow.grantDetails) return null;
  return buildImportSummaryFromDetails({
    id: record.id,
    savedAt: record.savedAt,
    kind: "grant",
    title,
    details: record.workflow.grantDetails as unknown as Record<string, unknown>,
    fieldLabels: GRANT_DETAIL_FIELD_LABELS,
  });
}

/**
 * Build an importable summary for a SOW-library SavedSowDraftRecord.
 * Prefers drafted sections; falls back to extracted SOW details.
 * Returns null only when both are empty.
 */
export function getSavedSowDraftImportSummary(
  record: SavedSowDraftRecord,
): SavedDraftImportSummary | null {
  const title =
    record.workflow.sowDetails?.engagement_title?.trim() ||
    record.name.trim() ||
    "Untitled SOW";
  const fromSections = buildImportSummaryFromSections({
    id: record.id,
    savedAt: record.savedAt,
    kind: "sow",
    title,
    sections: record.workflow.sections,
    orderedIds: SOW_SECTION_IDS,
    labels: SOW_SECTION_LABELS,
  });
  if (fromSections) return fromSections;
  if (!record.workflow.sowDetails) return null;
  return buildImportSummaryFromDetails({
    id: record.id,
    savedAt: record.savedAt,
    kind: "sow",
    title,
    details: record.workflow.sowDetails as unknown as Record<string, unknown>,
    fieldLabels: SOW_DETAIL_FIELD_LABELS,
  });
}

/**
 * Build an importable summary for an ADA-library SavedAdaDraftRecord.
 * Prefers drafted sections; falls back to extracted ADA details.
 * Returns null only when both are empty.
 */
export function getSavedAdaDraftImportSummary(
  record: SavedAdaDraftRecord,
): SavedDraftImportSummary | null {
  const title =
    record.workflow.adaDetails?.study_title?.trim() ||
    record.name.trim() ||
    "Untitled ADA report";
  const fromSections = buildImportSummaryFromSections({
    id: record.id,
    savedAt: record.savedAt,
    kind: "ada",
    title,
    sections: record.workflow.sections,
    orderedIds: ADA_SECTION_IDS,
    labels: ADA_SECTION_LABELS,
  });
  if (fromSections) return fromSections;
  if (!record.workflow.adaDetails) return null;
  return buildImportSummaryFromDetails({
    id: record.id,
    savedAt: record.savedAt,
    kind: "ada",
    title,
    details: record.workflow.adaDetails as unknown as Record<string, unknown>,
    fieldLabels: ADA_DETAIL_FIELD_LABELS,
  });
}

/**
 * Build an importable summary for a generic-library SavedGenericDraftRecord.
 * Returns null when the record has no non-empty draft sections.
 */
export function getSavedGenericDraftImportSummary(
  record: SavedGenericDraftRecord,
  template: DocumentTypeTemplate,
): SavedDraftImportSummary | null {
  if (!hasGenericDraftSections(record.workflow.sections)) return null;
  const templateSectionIds = template.sections.map((s) => s.id);
  const settings = record.workflow.sectionSettings ?? defaultSectionSettings(templateSectionIds);
  const orderedIds = resolveSectionOrder(
    effectiveSectionIds(templateSectionIds, settings),
    settings,
  );
  const defaultLabels: Record<string, string> = {};
  for (const section of template.sections) defaultLabels[section.id] = section.name;
  const labels: Record<string, string> = {};
  for (const id of orderedIds) labels[id] = resolveSectionLabel(id, settings, defaultLabels[id] ?? id);
  const title = record.workflow.details?.title?.trim() || record.name.trim() || template.name;
  return buildImportSummaryFromSections({
    id: record.id,
    savedAt: record.savedAt,
    kind: "generic",
    title,
    sections: record.workflow.sections,
    orderedIds,
    labels,
  });
}

/**
 * All saved drafts (patent, grant, SOW, ADA, custom) that have content suitable for
 * seeding Input pastedText as imported sources.
 */
export function listImportableSavedDraftSummaries(): SavedDraftImportSummary[] {
  const patentSummaries = listSavedDrafts()
    .map(getSavedDraftImportSummary)
    .filter((s): s is SavedDraftImportSummary => s !== null);
  const grantSummaries = listSavedGrantDrafts()
    .map(getSavedGrantDraftImportSummary)
    .filter((s): s is SavedDraftImportSummary => s !== null);
  const sowSummaries = listSavedSowDrafts()
    .map(getSavedSowDraftImportSummary)
    .filter((s): s is SavedDraftImportSummary => s !== null);
  const adaSummaries = listSavedAdaDrafts()
    .map(getSavedAdaDraftImportSummary)
    .filter((s): s is SavedDraftImportSummary => s !== null);
  const genericSummaries = listDocumentTypeTemplates().flatMap((template) =>
    listSavedGenericDrafts(template.id)
      .map((record) => getSavedGenericDraftImportSummary(record, template))
      .filter((s): s is SavedDraftImportSummary => s !== null),
  );
  return [
    ...patentSummaries,
    ...grantSummaries,
    ...sowSummaries,
    ...adaSummaries,
    ...genericSummaries,
  ].sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

/** Whether pasted text already contains an injected block for the given draft id. */
export function pastedTextHasImportedDraft(
  pastedText: string,
  draftId: string,
): boolean {
  return findImportedDraftMarkersById(pastedText, draftId) !== null;
}

/** Append (or replace existing) imported draft block for a specific draft id. */
export function injectImportedDraftBlock(
  pastedText: string,
  draftId: string,
  serializedText: string,
): string {
  const without = stripImportedDraftBlock(pastedText, draftId);
  if (!without.trim()) {
    return serializedText;
  }
  return `${without.trim()}\n\n${serializedText}`;
}
