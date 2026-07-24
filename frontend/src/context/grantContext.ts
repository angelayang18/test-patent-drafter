import { createContext, useContext } from "react";
import type { GrantDetails } from "../types/patent";
import type { CachedRemoteSources, GatheredSourceText, GatherSourceTextOptions } from "../utils/gatherSourceText";
import type { GrantWorkflowSnapshot, GrantWorkflowStep, SavedGrantDraftRecord } from "../utils/grantStorage";

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

export interface GrantWorkflowContextValue {
  grantDetails: GrantDetails | null;
  sections: Record<string, string>;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources: CachedRemoteSources;
  completedSteps: GrantWorkflowStep[];
  extractionSourceKey: string | null;
  autoDraftPending: boolean;
  workflowResetting: boolean;
  setGrantDetails: (details: GrantDetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
  setUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFilesAndPersist: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
  gatherSourceText: (options?: GatherSourceTextOptions) => Promise<GatheredSourceText>;
  getWorkflowSnapshot: () => GrantWorkflowSnapshot;
  importWorkflow: (workflow: GrantWorkflowSnapshot) => void;
  getSavedDrafts: () => SavedGrantDraftRecord[];
  saveNamedDraft: (name: string) => SavedGrantDraftRecord;
  removeSavedDraft: (id: string) => void;
  exportDraftFile: (name: string) => void;
  importDraftFile: (file: File) => Promise<GrantWorkflowSnapshot>;
  saveToStorage: () => void;
  clearWorkflow: () => void;
  markStepComplete: (step: GrantWorkflowStep) => void;
  setExtractionSourceKey: (key: string | null) => void;
  requestAutoDraft: () => void;
  clearAutoDraftPending: () => void;
}

export const GrantWorkflowContext = createContext<GrantWorkflowContextValue | null>(null);

export function useGrantWorkflow(): GrantWorkflowContextValue {
  const ctx = useContext(GrantWorkflowContext);
  if (!ctx) {
    throw new Error("useGrantWorkflow must be used within GrantWorkflowProvider");
  }
  return ctx;
}
