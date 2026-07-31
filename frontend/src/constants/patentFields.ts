import type { ExtractableInventionField } from "../services/api";

export const PATENT_REVIEW_FIELDS: {
  key: ExtractableInventionField;
  label: string;
  hint: string;
}[] = [
  {
    key: "invention_title",
    label: "Invention Title",
    hint: "Short, specific title for the patent cover sheet (maximum 15 words; no marketing language).",
  },
  {
    key: "problem_being_solved",
    label: "Technical Problem Being Solved",
    hint: "The gap or limitation in existing technology that your invention addresses.",
  },
  {
    key: "core_technical_solution",
    label: "Technical Solution / Core Mechanism",
    hint: "How the invention works—the main components and steps that solve the problem.",
  },
  {
    key: "novel_mechanism",
    label: "What Makes It Novel",
    hint: "The distinguishing feature compared to prior art—not merely an improvement.",
  },
  {
    key: "alternative_embodiments",
    label: "Alternative Embodiments",
    hint: "Other ways the invention could be built or deployed (one per line).",
  },
];

/** key → label map for import fallbacks from extracted invention details. */
export const PATENT_DETAIL_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  PATENT_REVIEW_FIELDS.map((field) => [field.key, field.label]),
);

export const PATENT_CORE_FIELD_KEYS: ExtractableInventionField[] = [
  "invention_title",
  "problem_being_solved",
  "core_technical_solution",
  "novel_mechanism",
];
