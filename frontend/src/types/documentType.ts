export interface SectionConfig {
  id: string;
  name: string;
  description: string;
  order: number;
  required: boolean;
  promptTemplateId: string;
}

export type SourceType =
  | "file_upload"
  | "pasted_text"
  | "website_url"
  | "prior_draft"
  | "confluence";

export interface DocumentTypeConfig {
  id: string;
  label: string;
  description: string;
  sections: SectionConfig[];
  sourceTypes: SourceType[];
  titleGenerationEnabled: boolean;
  citationsEnabled: boolean;
}
