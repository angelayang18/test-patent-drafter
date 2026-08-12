export interface GenericFigure {
  number: number;
  sectionId: string;
  title: string;
  brief_description: string;
  reference_numerals: Record<string, string>;
  mermaid: string;
}

export interface GenericFiguresResult {
  figures: GenericFigure[];
  warnings?: string[];
}

export interface RegenerateGenericFigureResult {
  figure: GenericFigure;
  warnings?: string[];
}

/** Normalize API (snake_case) or stored figure payloads into GenericFigure. */
export function normalizeGenericFigure(raw: unknown): GenericFigure | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const sectionId =
    typeof record.sectionId === "string"
      ? record.sectionId
      : typeof record.section_id === "string"
        ? record.section_id
        : "";
  if (!sectionId) return null;
  const number = Number(record.number);
  if (!Number.isFinite(number)) return null;
  return {
    number,
    sectionId,
    title: typeof record.title === "string" ? record.title : "",
    brief_description:
      typeof record.brief_description === "string" ? record.brief_description : "",
    reference_numerals:
      record.reference_numerals &&
      typeof record.reference_numerals === "object" &&
      !Array.isArray(record.reference_numerals)
        ? (record.reference_numerals as Record<string, string>)
        : {},
    mermaid: typeof record.mermaid === "string" ? record.mermaid : "",
  };
}

/** Serialize GenericFigure for backend JSON bodies (snake_case section_id). */
export function serializeGenericFigure(figure: GenericFigure): Record<string, unknown> {
  return {
    number: figure.number,
    section_id: figure.sectionId,
    title: figure.title,
    brief_description: figure.brief_description,
    reference_numerals: figure.reference_numerals,
    mermaid: figure.mermaid,
  };
}
