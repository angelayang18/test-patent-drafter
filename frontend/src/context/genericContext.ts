import { createContext, useContext } from "react";
import type { SectionCitation } from "../types/patent";
import type { DocumentTypeTemplate } from "../utils/documentTypeTemplates";
import type {
  CachedRemoteSources,
  GatheredSourceText,
  GatherSourceTextOptions,
} from "../utils/gatherSourceText";
import type {
  GenericDocumentDetails,
  GenericWorkflowSnapshot,
  GenericWorkflowStep,
  SavedGenericDraftRecord,
} from "../utils/genericStorage";
import type { SectionSettingsMap } from "../utils/sectionSettings";

export interface UploadedSourceFile {
  id: string;
  filename: string;
  sizeBytes: number;
  content: string;
}

export interface InputSources {
  relevantContentNotes: string;
  irrelevantContentNotes: string;
  confluenceUrl: string;
  confluenceSpaceKey: string;
  confluenceToken: string;
  websiteUrls: string[];
  pastedText: string;
}

export interface GenericWorkflowContextValue {
  templateId: string;
  template: DocumentTypeTemplate;
  details: GenericDocumentDetails | null;
  sections: Record<string, string>;
  sectionCitations: Record<string, SectionCitation[]>;
  /** Citations for the Review-page document title (per-template storage). */
  titleCitations: SectionCitation[];
  reviewerFeedback: Record<string, string>;
  sectionSettings: SectionSettingsMap;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources: CachedRemoteSources;
  completedSteps: GenericWorkflowStep[];
  extractionSourceKey: string | null;
  autoDraftPending: boolean;
  workflowResetting: boolean;
  setDetails: (details: GenericDocumentDetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
  setSectionCitations: (citations: Record<string, SectionCitation[]>) => void;
  setTitleCitations: (citations: SectionCitation[]) => void;
  setReviewerFeedback: (sectionId: string, comment: string) => void;
  setSectionSettings: (settings: SectionSettingsMap) => void;
  setUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFilesAndPersist: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
  gatherSourceText: (options?: GatherSourceTextOptions) => Promise<GatheredSourceText>;
  getWorkflowSnapshot: () => GenericWorkflowSnapshot;
  importWorkflow: (workflow: GenericWorkflowSnapshot) => void;
  getSavedDrafts: () => SavedGenericDraftRecord[];
  saveNamedDraft: (name: string) => SavedGenericDraftRecord;
  removeSavedDraft: (id: string) => void;
  exportDraftFile: (name: string) => void;
  importDraftFile: (file: File) => Promise<GenericWorkflowSnapshot>;
  saveToStorage: () => void;
  clearWorkflow: () => void;
  markStepComplete: (step: GenericWorkflowStep) => void;
  setExtractionSourceKey: (key: string | null) => void;
  requestAutoDraft: () => void;
  clearAutoDraftPending: () => void;
}

export const GenericWorkflowContext = createContext<GenericWorkflowContextValue | null>(
  null,
);

export function useGenericWorkflow(): GenericWorkflowContextValue {
  const ctx = useContext(GenericWorkflowContext);
  if (!ctx) {
    throw new Error("useGenericWorkflow must be used within GenericWorkflowProvider");
  }
  return ctx;
}
