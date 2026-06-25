export type WorkflowMode = "patent" | "grant";

export interface InventionDetails {
  invention_title: string;
  technical_field: string;
  problem_being_solved: string;
  core_technical_solution: string;
  novel_mechanism: string;
  alternative_embodiments: string[];
  key_components: string[];
}

export interface GrantDetails {
  project_title: string;
  problem_statement: string;
  proposed_solution: string;
  innovation_and_impact: string;
  target_population: string;
  team_qualifications: string;
  budget_overview: string;
  evaluation_plan: string;
}

export const defaultGrantDetails: GrantDetails = {
  project_title: "",
  problem_statement: "",
  proposed_solution: "",
  innovation_and_impact: "",
  target_population: "",
  team_qualifications: "",
  budget_overview: "",
  evaluation_plan: "",
};

export const defaultInvention: InventionDetails = {
  invention_title: "",
  technical_field: "",
  problem_being_solved: "",
  core_technical_solution: "",
  novel_mechanism: "",
  alternative_embodiments: [],
  key_components: [],
};

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
  warnings?: string[];
}

export interface RegenerateFigureResult {
  figure: PatentFigure;
  warnings?: string[];
}

export interface FilingInfo {
  inventor_name: string;
  inventor_city: string;
  inventor_state: string;
  inventor_country: string;
  correspondence_name: string;
  correspondence_address: string;
  correspondence_email: string;
  /** Prior filing reference text; empty means "Not Applicable." in export */
  related_applications: string;
}

export const EMPTY_FILING_INFO: FilingInfo = {
  inventor_name: "",
  inventor_city: "",
  inventor_state: "",
  inventor_country: "",
  correspondence_name: "",
  correspondence_address: "",
  correspondence_email: "",
  related_applications: "",
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

export function emptyAttorneyFeedback(): Record<PatentSectionId, string> {
  return Object.fromEntries(PATENT_SECTION_IDS.map((id) => [id, ""])) as Record<
    PatentSectionId,
    string
  >;
}

export function emptyApprovedExemplars(): Record<PatentSectionId, boolean> {
  return Object.fromEntries(PATENT_SECTION_IDS.map((id) => [id, false])) as Record<
    PatentSectionId,
    boolean
  >;
}

export const GRANT_SECTION_IDS = [
  "executive_summary",
  "problem_statement",
  "project_description",
  "methodology",
  "evaluation",
  "budget_narrative",
  "organizational_capacity",
] as const;

export type GrantSectionId = (typeof GRANT_SECTION_IDS)[number];

export const GRANT_SECTION_LABELS: Record<GrantSectionId, string> = {
  executive_summary: "Executive Summary",
  problem_statement: "Problem Statement",
  project_description: "Project Description",
  methodology: "Methodology",
  evaluation: "Evaluation Plan",
  budget_narrative: "Budget Narrative",
  organizational_capacity: "Organizational Capacity",
};
