import type { ExtractableAdaField } from "../services/api";

export const ADA_REVIEW_FIELDS: {
  key: ExtractableAdaField;
  label: string;
  hint: string;
}[] = [
  {
    key: "study_title",
    label: "Study Title",
    hint: "Short working title for the ADA study or report.",
  },
  {
    key: "study_objective",
    label: "Study Objective",
    hint: "What is being validated or reported, and why.",
  },
  {
    key: "assay_platform",
    label: "Assay Platform",
    hint: "Assay format/platform, critical reagents, and equipment.",
  },
  {
    key: "sample_matrix",
    label: "Sample Matrix",
    hint: "Sample source, matrix, species, and handling.",
  },
  {
    key: "cut_point_methodology",
    label: "Cut Point Methodology",
    hint: "Pre-study and in-study screening/confirmatory cut point approach.",
  },
  {
    key: "sensitivity_data",
    label: "Sensitivity Data",
    hint: "Lowest ADA concentration consistently detected above the cut point.",
  },
  {
    key: "specificity_data",
    label: "Specificity Data",
    hint: "Drug tolerance, target tolerance, and matrix interference/selectivity.",
  },
  {
    key: "precision_data",
    label: "Precision Data",
    hint: "Inter/intra-assay precision and robustness findings.",
  },
  {
    key: "stability_data",
    label: "Stability Data",
    hint: "Freeze-thaw, bench-top, and long-term storage stability.",
  },
  {
    key: "results_summary",
    label: "Results Summary",
    hint: "Screening/confirmatory/titer results and overall findings.",
  },
];

/** key → label map for import fallbacks from extracted ADA details. */
export const ADA_DETAIL_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  ADA_REVIEW_FIELDS.map((field) => [field.key, field.label]),
);

export const ADA_CORE_FIELD_KEYS: ExtractableAdaField[] = [
  "study_title",
  "study_objective",
  "assay_platform",
  "sample_matrix",
];
