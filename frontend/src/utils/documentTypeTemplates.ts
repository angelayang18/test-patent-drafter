import { getStorageKey } from "./userScopedStorage";

export interface CustomSectionDef {
  id: string;
  name: string;
  description: string;
  order: number;
  /** When true, the Figures step generates a diagram for this section. */
  needsFigure?: boolean;
}

export interface DocumentTypeTemplate {
  id: string;
  name: string;
  description?: string;
  sections: CustomSectionDef[];
  createdAt: string;
  basedOn?: string;
  /** True when the type was configured with uploaded sample reports. */
  builtFromSamples?: boolean;
  /** Short note about sample provenance (filenames or summary). */
  sampleNote?: string;
  /**
   * Whether this template is shared with the team.
   * Defaults to true when absent (templates saved before this field existed).
   */
  shared?: boolean;
}

const TEMPLATES_KEY = "patent-drafter-custom-document-types";

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
    throw new Error("Could not save template. Browser storage may be full.");
  }
}

function normalizeSection(raw: Partial<CustomSectionDef>, index: number): CustomSectionDef | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    description: typeof raw.description === "string" ? raw.description : "",
    order: typeof raw.order === "number" ? raw.order : index,
    needsFigure: raw.needsFigure === true,
  };
}

function normalizeTemplate(raw: Partial<DocumentTypeTemplate> | null | undefined): DocumentTypeTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;
  const sections = Array.isArray(raw.sections)
    ? raw.sections
        .map((section, index) => normalizeSection(section as Partial<CustomSectionDef>, index))
        .filter((section): section is CustomSectionDef => section !== null)
    : [];
  return {
    id,
    name,
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description.trim()
        : undefined,
    sections,
    createdAt:
      typeof raw.createdAt === "string" && raw.createdAt.trim()
        ? raw.createdAt
        : new Date().toISOString(),
    basedOn:
      typeof raw.basedOn === "string" && raw.basedOn.trim() ? raw.basedOn.trim() : undefined,
    // Safe default for templates saved before this field existed.
    builtFromSamples: raw.builtFromSamples === true,
    sampleNote:
      typeof raw.sampleNote === "string" && raw.sampleNote.trim()
        ? raw.sampleNote.trim()
        : undefined,
    // Safe default for templates saved before this field existed.
    shared: raw.shared !== false,
  };
}

/** Generate a unique template id from a display name. */
export function generateDocumentTypeTemplateId(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "type";
  return `custom_${slug}_${Date.now()}`;
}

export function listDocumentTypeTemplates(): DocumentTypeTemplate[] {
  const raw = readJson<Partial<DocumentTypeTemplate>[]>(TEMPLATES_KEY) ?? [];
  return raw
    .map((entry) => normalizeTemplate(entry))
    .filter((entry): entry is DocumentTypeTemplate => entry !== null)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getDocumentTypeTemplate(id: string): DocumentTypeTemplate | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  return listDocumentTypeTemplates().find((template) => template.id === trimmed) ?? null;
}

export function saveDocumentTypeTemplate(template: DocumentTypeTemplate): void {
  const normalized = normalizeTemplate(template);
  if (!normalized) {
    throw new Error("Invalid document type template.");
  }
  const existing = listDocumentTypeTemplates().filter((entry) => entry.id !== normalized.id);
  writeJson(TEMPLATES_KEY, [normalized, ...existing]);
}

export function deleteDocumentTypeTemplate(id: string): void {
  const next = listDocumentTypeTemplates().filter((template) => template.id !== id);
  writeJson(TEMPLATES_KEY, next);
}
