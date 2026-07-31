import { createContext, useContext } from "react";
import type { SOWDetails, SectionCitation } from "../types/patent";
import type { CachedRemoteSources, GatheredSourceText, GatherSourceTextOptions } from "../utils/gatherSourceText";
import type { SowWorkflowSnapshot, SowWorkflowStep, SavedSowDraftRecord } from "../utils/sowStorage";
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

export interface SowWorkflowContextValue {
  sowDetails: SOWDetails | null;
  sections: Record<string, string>;
  sectionCitations: Record<string, SectionCitation[]>;
  reviewerFeedback: Record<string, string>;
  fieldCitations: Record<string, SectionCitation[]>;
  sectionSettings: SectionSettingsMap;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources: CachedRemoteSources;
  completedSteps: SowWorkflowStep[];
  extractionSourceKey: string | null;
  autoDraftPending: boolean;
  workflowResetting: boolean;
  setSowDetails: (details: SOWDetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
  setSectionCitations: (citations: Record<string, SectionCitation[]>) => void;
  setReviewerFeedback: (sectionId: string, comment: string) => void;
  setFieldCitations: (citations: Record<string, SectionCitation[]>) => void;
  setSectionSettings: (settings: SectionSettingsMap) => void;
  setUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFilesAndPersist: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
  gatherSourceText: (options?: GatherSourceTextOptions) => Promise<GatheredSourceText>;
  getWorkflowSnapshot: () => SowWorkflowSnapshot;
  importWorkflow: (workflow: SowWorkflowSnapshot) => void;
  getSavedDrafts: () => SavedSowDraftRecord[];
  saveNamedDraft: (name: string) => SavedSowDraftRecord;
  removeSavedDraft: (id: string) => void;
  exportDraftFile: (name: string) => void;
  importDraftFile: (file: File) => Promise<SowWorkflowSnapshot>;
  saveToStorage: () => void;
  clearWorkflow: () => void;
  markStepComplete: (step: SowWorkflowStep) => void;
  setExtractionSourceKey: (key: string | null) => void;
  requestAutoDraft: () => void;
  clearAutoDraftPending: () => void;
}

export const SowWorkflowContext = createContext<SowWorkflowContextValue | null>(null);

export function useSowWorkflow(): SowWorkflowContextValue {
  const ctx = useContext(SowWorkflowContext);
  if (!ctx) {
    throw new Error("useSowWorkflow must be used within SowWorkflowProvider");
  }
  return ctx;
}
