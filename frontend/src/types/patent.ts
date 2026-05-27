export interface InventionDetails {
  invention_title: string;
  technical_field: string;
  problem_being_solved: string;
  core_technical_solution: string;
  novel_mechanism: string;
  alternative_embodiments: string[];
  key_components: string[];
}

export interface PatentFigure {
  number: number;
  title: string;
  brief_description: string;
  reference_numerals: Record<string, string>;
  mermaid: string;
}

export interface FiguresResult {
  brief_description_of_drawings: string;
  figures: PatentFigure[];
}

export interface PatentDraft {
  sections: Record<string, string>;
  figures: PatentFigure[];
  brief_description_of_drawings: string;
}

export const PATENT_SECTION_IDS = [
  "field",
  "background",
  "summary",
  "description",
  "claims",
  "abstract",
] as const;

export type PatentSectionId = (typeof PATENT_SECTION_IDS)[number];

export const SECTION_LABELS: Record<PatentSectionId, string> = {
  field: "Field of the Invention",
  background: "Background",
  summary: "Summary",
  description: "Detailed Description",
  claims: "Claims",
  abstract: "Abstract",
};
