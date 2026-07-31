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
  /** Display headings for export (renames + custom sections). */
  section_labels?: Record<string, string>;
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

export interface SectionCitation {
  label: string;
  /** Document location such as "Page 3", "Slide 4", or "Paragraph 12". */
  location: string;
  excerpt: string;
}

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

export interface SOWDetails {
  engagement_title: string;
  client_name: string;
  vendor_name: string;
  purpose_and_background: string;
  objectives: string;
  scope_of_work: string;
  deliverables: string;
  timeline_and_effort: string;
  responsibilities_and_inputs: string;
  commercial_terms: string;
}

export const defaultSowDetails: SOWDetails = {
  engagement_title: "",
  client_name: "",
  vendor_name: "",
  purpose_and_background: "",
  objectives: "",
  scope_of_work: "",
  deliverables: "",
  timeline_and_effort: "",
  responsibilities_and_inputs: "",
  commercial_terms: "",
};

export const SOW_SECTION_IDS = [
  "purpose",
  "objectives",
  "scope_of_work",
  "deliverables",
  "development_areas_effort_schedule",
  "responsibilities_required_inputs",
  "technical_integration_approach",
  "acceptance_criteria",
  "assumptions_dependencies",
  "out_of_scope",
  "governance_change_control",
  "commercial_terms",
  "data_protection_confidentiality",
  "completion",
] as const;

export type SowSectionId = (typeof SOW_SECTION_IDS)[number];

export const SOW_SECTION_LABELS: Record<SowSectionId, string> = {
  purpose: "Purpose / Introduction & Background",
  objectives: "Objectives",
  scope_of_work: "Scope of Work",
  deliverables: "Deliverables",
  development_areas_effort_schedule: "Development Areas, Effort & Schedule",
  responsibilities_required_inputs: "Responsibilities & Required Inputs",
  technical_integration_approach: "Technical / Integration Approach",
  acceptance_criteria: "Acceptance Criteria",
  assumptions_dependencies: "Assumptions & Dependencies",
  out_of_scope: "Out of Scope",
  governance_change_control: "Governance & Change Control",
  commercial_terms: "Commercial Terms",
  data_protection_confidentiality: "Data Protection & Confidentiality",
  completion: "Completion",
};

export interface ADADetails {
  study_title: string;
  study_objective: string;
  assay_platform: string;
  sample_matrix: string;
  cut_point_methodology: string;
  sensitivity_data: string;
  specificity_data: string;
  precision_data: string;
  stability_data: string;
  results_summary: string;
}

export const defaultAdaDetails: ADADetails = {
  study_title: "",
  study_objective: "",
  assay_platform: "",
  sample_matrix: "",
  cut_point_methodology: "",
  sensitivity_data: "",
  specificity_data: "",
  precision_data: "",
  stability_data: "",
  results_summary: "",
};

export const ADA_SECTION_IDS = [
  "study_overview",
  "method_summary",
  "study_samples",
  "cut_point_determination",
  "sensitivity",
  "specificity_selectivity",
  "precision_reproducibility_robustness",
  "stability",
  "sample_analysis_results",
  "data_analysis_conclusion",
] as const;

export type AdaSectionId = (typeof ADA_SECTION_IDS)[number];

export const ADA_SECTION_LABELS: Record<AdaSectionId, string> = {
  study_overview: "Study Overview / Objective",
  method_summary: "Method Summary",
  study_samples: "Study Samples",
  cut_point_determination: "Cut Point Determination",
  sensitivity: "Sensitivity",
  specificity_selectivity: "Specificity & Selectivity",
  precision_reproducibility_robustness: "Precision, Reproducibility & Robustness",
  stability: "Stability",
  sample_analysis_results: "Sample Analysis Results & Titer Reporting",
  data_analysis_conclusion: "Data Analysis & Conclusion",
};
