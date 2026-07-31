import { createContext, useContext } from "react";
import type { ADADetails, SectionCitation } from "../types/patent";
import type { CachedRemoteSources, GatheredSourceText, GatherSourceTextOptions } from "../utils/gatherSourceText";
import type { AdaWorkflowSnapshot, AdaWorkflowStep, SavedAdaDraftRecord } from "../utils/adaStorage";
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

export interface AdaWorkflowContextValue {
  adaDetails: ADADetails | null;
  sections: Record<string, string>;
  sectionCitations: Record<string, SectionCitation[]>;
  fieldCitations: Record<string, SectionCitation[]>;
  sectionSettings: SectionSettingsMap;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources: CachedRemoteSources;
  completedSteps: AdaWorkflowStep[];
  extractionSourceKey: string | null;
  autoDraftPending: boolean;
  workflowResetting: boolean;
  setAdaDetails: (details: ADADetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
  setSectionCitations: (citations: Record<string, SectionCitation[]>) => void;
  setFieldCitations: (citations: Record<string, SectionCitation[]>) => void;
  setSectionSettings: (settings: SectionSettingsMap) => void;
  setUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFilesAndPersist: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
  gatherSourceText: (options?: GatherSourceTextOptions) => Promise<GatheredSourceText>;
  getWorkflowSnapshot: () => AdaWorkflowSnapshot;
  importWorkflow: (workflow: AdaWorkflowSnapshot) => void;
  getSavedDrafts: () => SavedAdaDraftRecord[];
  saveNamedDraft: (name: string) => SavedAdaDraftRecord;
  removeSavedDraft: (id: string) => void;
  exportDraftFile: (name: string) => void;
  importDraftFile: (file: File) => Promise<AdaWorkflowSnapshot>;
  saveToStorage: () => void;
  clearWorkflow: () => void;
  markStepComplete: (step: AdaWorkflowStep) => void;
  setExtractionSourceKey: (key: string | null) => void;
  requestAutoDraft: () => void;
  clearAutoDraftPending: () => void;
}

export const AdaWorkflowContext = createContext<AdaWorkflowContextValue | null>(null);

export function useAdaWorkflow(): AdaWorkflowContextValue {
  const ctx = useContext(AdaWorkflowContext);
  if (!ctx) {
    throw new Error("useAdaWorkflow must be used within AdaWorkflowProvider");
  }
  return ctx;
}
