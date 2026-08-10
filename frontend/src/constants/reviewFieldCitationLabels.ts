/**
 * Field-key → bare citation labels matching backend
 * ``review_field_sources`` chunk headers (the text after ``Your reviewed ``).
 *
 * UI field labels may differ slightly (e.g. "&" vs "and"); citation previews
 * must key off these backend-aligned strings.
 */

export const PATENT_CITATION_FIELD_LABELS: Record<string, string> = {
  invention_title: "Invention Title",
  technical_field: "Technical Field",
  problem_being_solved: "Technical Problem Being Solved",
  core_technical_solution: "Technical Solution / Core Mechanism",
  novel_mechanism: "What Makes It Novel",
  alternative_embodiments: "Alternative Embodiments",
  key_components: "Key Components",
};

export const GRANT_CITATION_FIELD_LABELS: Record<string, string> = {
  project_title: "Project Title",
  problem_statement: "Problem Statement",
  proposed_solution: "Proposed Solution",
  innovation_and_impact: "Innovation and Impact",
  target_population: "Target Population",
  team_qualifications: "Team Qualifications",
  budget_overview: "Budget Overview",
  evaluation_plan: "Evaluation Plan",
};

export const SOW_CITATION_FIELD_LABELS: Record<string, string> = {
  engagement_title: "Engagement Title",
  client_name: "Client Name",
  vendor_name: "Vendor Name",
  purpose_and_background: "Purpose and Background",
  objectives: "Objectives",
  scope_of_work: "Scope of Work",
  deliverables: "Deliverables",
  timeline_and_effort: "Timeline and Effort",
  responsibilities_and_inputs: "Responsibilities and Inputs",
  commercial_terms: "Commercial Terms",
};

export const ADA_CITATION_FIELD_LABELS: Record<string, string> = {
  study_title: "Study Title",
  study_objective: "Study Objective",
  assay_platform: "Assay Platform",
  sample_matrix: "Sample Matrix",
  cut_point_methodology: "Cut Point Methodology",
  sensitivity_data: "Sensitivity Data",
  specificity_data: "Specificity Data",
  precision_data: "Precision Data",
  stability_data: "Stability Data",
  results_summary: "Results Summary",
};
