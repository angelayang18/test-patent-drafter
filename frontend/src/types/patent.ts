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

export interface FilingInfo {
  inventor_name: string;
  inventor_city: string;
  inventor_state: string;
  inventor_country: string;
  correspondence_name: string;
  correspondence_address: string;
  correspondence_email: string;
}

export const EMPTY_FILING_INFO: FilingInfo = {
  inventor_name: "",
  inventor_city: "",
  inventor_state: "",
  inventor_country: "",
  correspondence_name: "",
  correspondence_address: "",
  correspondence_email: "",
};

export interface PatentDraft {
  sections: Record<string, string>;
  figures: PatentFigure[];
  brief_description_of_drawings: string;
  invention_title?: string;
  filing_info?: FilingInfo | null;
  /** Base64 PNGs keyed by figure number — from /export/prerender-figures */
  figure_pngs?: Record<string, string>;
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
