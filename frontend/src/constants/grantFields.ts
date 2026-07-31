import type { ExtractableGrantField } from "../services/api";

export const GRANT_REVIEW_FIELDS: {
  key: ExtractableGrantField;
  label: string;
  hint: string;
}[] = [
  {
    key: "project_title",
    label: "Project Title",
    hint: "Concise working title for the grant proposal.",
  },
  {
    key: "problem_statement",
    label: "Problem Statement",
    hint: "The need or gap the project addresses.",
  },
  {
    key: "proposed_solution",
    label: "Proposed Solution",
    hint: "What the project will do and how it addresses the problem.",
  },
  {
    key: "innovation_and_impact",
    label: "Innovation & Impact",
    hint: "What is novel and the expected outcomes or impact.",
  },
  {
    key: "target_population",
    label: "Target Population",
    hint: "Who benefits and at what scale.",
  },
  {
    key: "team_qualifications",
    label: "Team Qualifications",
    hint: "Relevant expertise and organizational capacity.",
  },
  {
    key: "budget_overview",
    label: "Budget Overview",
    hint: "High-level budget categories and rationale if available.",
  },
  {
    key: "evaluation_plan",
    label: "Evaluation Plan",
    hint: "How success will be measured.",
  },
];

/** key → label map for import fallbacks from extracted grant details. */
export const GRANT_DETAIL_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  GRANT_REVIEW_FIELDS.map((field) => [field.key, field.label]),
);

export const GRANT_CORE_FIELD_KEYS: ExtractableGrantField[] = [
  "project_title",
  "problem_statement",
  "proposed_solution",
  "innovation_and_impact",
];
