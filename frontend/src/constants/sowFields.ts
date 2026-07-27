import type { ExtractableSowField } from "../services/api";

export const SOW_REVIEW_FIELDS: {
  key: ExtractableSowField;
  label: string;
  hint: string;
}[] = [
  {
    key: "engagement_title",
    label: "Engagement Title",
    hint: "Short working title for the SOW.",
  },
  {
    key: "client_name",
    label: "Client Name",
    hint: "The customer/client organization.",
  },
  {
    key: "vendor_name",
    label: "Vendor Name",
    hint: "The service provider organization.",
  },
  {
    key: "purpose_and_background",
    label: "Purpose & Background",
    hint: "Why the engagement is happening and the problem it solves.",
  },
  {
    key: "objectives",
    label: "Objectives",
    hint: "Specific, quantifiable goals of the engagement.",
  },
  {
    key: "scope_of_work",
    label: "Scope of Work",
    hint: "Tasks/workstreams covered and the technical approach.",
  },
  {
    key: "deliverables",
    label: "Deliverables",
    hint: "What will be delivered, mapped to scope.",
  },
  {
    key: "timeline_and_effort",
    label: "Timeline & Effort",
    hint: "Phases, estimated hours, and schedule if available.",
  },
  {
    key: "responsibilities_and_inputs",
    label: "Responsibilities & Required Inputs",
    hint: "Vendor vs. customer ownership and required inputs.",
  },
  {
    key: "commercial_terms",
    label: "Commercial Terms",
    hint: "Fees, payment schedule, and separately billed items if present.",
  },
];

export const SOW_CORE_FIELD_KEYS: ExtractableSowField[] = [
  "engagement_title",
  "purpose_and_background",
  "scope_of_work",
  "deliverables",
];
