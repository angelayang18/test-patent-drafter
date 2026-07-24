import type { DocumentTypeConfig, SectionConfig, SourceType } from "../types/documentType";
import {
  GRANT_SECTION_IDS,
  GRANT_SECTION_LABELS,
  PATENT_SECTION_IDS,
  SECTION_LABELS,
  type GrantSectionId,
  type PatentSectionId,
} from "../types/patent";

const ALL_SOURCE_TYPES: SourceType[] = [
  "file_upload",
  "pasted_text",
  "website_url",
  "prior_draft",
  "confluence",
];

const PATENT_SECTION_DESCRIPTIONS: Record<PatentSectionId, string> = {
  field: "Names the technical domain only, 2-3 sentences, no description of the invention itself",
  background: "The problem and prior-art limitations, never the solution",
  summary: "Brief introduction of the invention and its key technical advantages",
  description:
    "Full technical description: system overview, components, method steps, data flow, alternative embodiments",
  claims: "8-10 informal claims establishing intended scope of protection",
  abstract: "One paragraph, max 150 words, technical field + problem + solution + benefit",
};

const GRANT_SECTION_DESCRIPTIONS: Record<GrantSectionId, string> = {
  executive_summary:
    "Introduces the project, problem, solution, innovation, impact, and organizational capacity",
  problem_statement:
    "The need being addressed, supporting evidence, and why this project is the right response now",
  project_description:
    "Project goals, activities, timeline, and deliverables, and how the solution addresses the problem",
  methodology: "The approach, methods, tools, and implementation steps, including sequencing and staffing",
  evaluation:
    "Measurable outcomes, indicators, data collection methods, and how results inform improvement",
  budget_narrative:
    "Major cost categories, personnel, equipment, and other direct costs aligned to the budget overview",
  organizational_capacity:
    "Team qualifications, relevant experience, partnerships, and infrastructure supporting delivery",
};

function patentSections(): SectionConfig[] {
  return PATENT_SECTION_IDS.map((id, index) => ({
    id,
    name: SECTION_LABELS[id],
    description: PATENT_SECTION_DESCRIPTIONS[id],
    order: index + 1,
    required: true,
    promptTemplateId: id,
  }));
}

function grantSections(): SectionConfig[] {
  return GRANT_SECTION_IDS.map((id, index) => ({
    id,
    name: GRANT_SECTION_LABELS[id],
    description: GRANT_SECTION_DESCRIPTIONS[id],
    order: index + 1,
    required: true,
    promptTemplateId: id,
  }));
}

const SOW_SECTIONS: Omit<SectionConfig, "order">[] = [
  {
    id: "purpose",
    name: "Purpose / Introduction & Background",
    description: "Why the engagement is happening and what problem it solves",
    required: true,
    promptTemplateId: "sow_purpose",
  },
  {
    id: "objectives",
    name: "Objectives",
    description: "The specific, quantifiable goals of the engagement",
    required: true,
    promptTemplateId: "sow_objectives",
  },
  {
    id: "scope_of_work",
    name: "Scope of Work",
    description: "The tasks and workstreams covered, broken out by development area",
    required: true,
    promptTemplateId: "sow_scope_of_work",
  },
  {
    id: "deliverables",
    name: "Deliverables",
    description: "What will be delivered, mapped to each scope item",
    required: true,
    promptTemplateId: "sow_deliverables",
  },
  {
    id: "development_areas_effort_schedule",
    name: "Development Areas, Effort & Schedule",
    description: "Estimated hours and timing per development area",
    required: true,
    promptTemplateId: "sow_development_areas_effort_schedule",
  },
  {
    id: "responsibilities_required_inputs",
    name: "Responsibilities & Required Inputs",
    description:
      "What the service provider and customer each own, including required inputs from the customer",
    required: true,
    promptTemplateId: "sow_responsibilities_required_inputs",
  },
  {
    id: "technical_integration_approach",
    name: "Technical / Integration Approach",
    description:
      "How the solution integrates with customer systems, data exchange method, and where AI assists vs. deterministic rules",
    required: true,
    promptTemplateId: "sow_technical_integration_approach",
  },
  {
    id: "acceptance_criteria",
    name: "Acceptance Criteria",
    description: "Measurable criteria that define when the engagement is accepted",
    required: true,
    promptTemplateId: "sow_acceptance_criteria",
  },
  {
    id: "assumptions_dependencies",
    name: "Assumptions & Dependencies",
    description: "What must be true for the schedule and scope to hold",
    required: true,
    promptTemplateId: "sow_assumptions_dependencies",
  },
  {
    id: "out_of_scope",
    name: "Out of Scope",
    description: "What is explicitly excluded, to prevent scope creep",
    required: true,
    promptTemplateId: "sow_out_of_scope",
  },
  {
    id: "governance_change_control",
    name: "Governance & Change Control",
    description: "Meeting cadence and how scope changes are requested and approved",
    required: true,
    promptTemplateId: "sow_governance_change_control",
  },
  {
    id: "commercial_terms",
    name: "Commercial Terms",
    description: "Fees, payment schedule, and what's billed separately",
    required: true,
    promptTemplateId: "sow_commercial_terms",
  },
  {
    id: "data_protection_confidentiality",
    name: "Data Protection & Confidentiality",
    description: "How each party's data is handled, retained, and protected",
    required: true,
    promptTemplateId: "sow_data_protection_confidentiality",
  },
  {
    id: "completion",
    name: "Completion",
    description: "The conditions that mark the engagement as complete",
    required: true,
    promptTemplateId: "sow_completion",
  },
];

const ADA_SECTIONS: Omit<SectionConfig, "order">[] = [
  {
    id: "study_overview",
    name: "Study Overview / Objective",
    description: "What is being validated or reported and why",
    required: true,
    promptTemplateId: "ada_study_overview",
  },
  {
    id: "method_summary",
    name: "Method Summary",
    description: "Assay platform, critical reagents, and equipment used",
    required: true,
    promptTemplateId: "ada_method_summary",
  },
  {
    id: "study_samples",
    name: "Study Samples",
    description: "Sample source, matrix, and handling",
    required: true,
    promptTemplateId: "ada_study_samples",
  },
  {
    id: "cut_point_determination",
    name: "Cut Point Determination",
    description: "Pre-study and in-study cut point methodology and results",
    required: true,
    promptTemplateId: "ada_cut_point_determination",
  },
  {
    id: "sensitivity",
    name: "Sensitivity",
    description: "Lowest ADA concentration consistently detected above the cut point",
    required: true,
    promptTemplateId: "ada_sensitivity",
  },
  {
    id: "specificity_selectivity",
    name: "Specificity & Selectivity",
    description: "Drug tolerance, target tolerance, and matrix interference",
    required: true,
    promptTemplateId: "ada_specificity_selectivity",
  },
  {
    id: "precision_reproducibility_robustness",
    name: "Precision, Reproducibility & Robustness",
    description: "Inter/intra-assay precision and robustness data",
    required: true,
    promptTemplateId: "ada_precision_reproducibility_robustness",
  },
  {
    id: "stability",
    name: "Stability",
    description: "Sample stability under storage and handling conditions",
    required: true,
    promptTemplateId: "ada_stability",
  },
  {
    id: "sample_analysis_results",
    name: "Sample Analysis Results & Titer Reporting",
    description: "Screening, confirmatory, and titer results per the tiered testing approach",
    required: true,
    promptTemplateId: "ada_sample_analysis_results",
  },
  {
    id: "data_analysis_conclusion",
    name: "Data Analysis & Conclusion",
    description: "Interpretation of results against acceptance criteria",
    required: true,
    promptTemplateId: "ada_data_analysis_conclusion",
  },
];

function withOrder(sections: Omit<SectionConfig, "order">[]): SectionConfig[] {
  return sections.map((section, index) => ({
    ...section,
    order: index + 1,
  }));
}

export const DOCUMENT_TYPES: DocumentTypeConfig[] = [
  {
    id: "PATENT_PROVISIONAL",
    label: "Patent Provisional",
    description:
      "US provisional patent application draft with field, background, summary, description, claims, and abstract.",
    sections: patentSections(),
    sourceTypes: ALL_SOURCE_TYPES,
    titleGenerationEnabled: true,
    citationsEnabled: true,
  },
  {
    id: "GRANT_APPLICATION",
    label: "Grant Application",
    description:
      "Grant proposal draft covering executive summary through organizational capacity.",
    sections: grantSections(),
    sourceTypes: ALL_SOURCE_TYPES,
    titleGenerationEnabled: true,
    citationsEnabled: true,
  },
  {
    id: "SOW_CONTRACT",
    label: "SOW Contract",
    description:
      "Statement of Work contract covering purpose, scope, deliverables, schedule, and commercial terms.",
    sections: withOrder(SOW_SECTIONS),
    sourceTypes: ALL_SOURCE_TYPES,
    titleGenerationEnabled: true,
    citationsEnabled: true,
  },
  {
    id: "ADA_BIOANALYTICAL_REPORT",
    label: "ADA Bioanalytical Report",
    description:
      "Anti-drug antibody bioanalytical report covering method validation, cut points, and sample analysis.",
    sections: withOrder(ADA_SECTIONS),
    sourceTypes: ALL_SOURCE_TYPES,
    titleGenerationEnabled: true,
    citationsEnabled: true,
  },
];

const DOCUMENT_TYPE_BY_ID: Record<string, DocumentTypeConfig> = Object.fromEntries(
  DOCUMENT_TYPES.map((config) => [config.id, config]),
);

/**
 * Return the document type config for the given id.
 * @throws if the id is not a known document type
 */
export function getDocumentTypeConfig(id: string): DocumentTypeConfig {
  const config = DOCUMENT_TYPE_BY_ID[id];
  if (!config) {
    throw new Error(
      `Unknown document type '${id}'. Must be one of: ${DOCUMENT_TYPES.map((c) => c.id).join(", ")}`,
    );
  }
  return config;
}
