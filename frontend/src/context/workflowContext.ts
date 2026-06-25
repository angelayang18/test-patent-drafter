import { createContext, useContext } from "react";
import type {
  FiguresResult,
  FilingInfo,
  InventionDetails,
  PatentFigure,
  PatentSectionId,
} from "../types/patent";
import type { CachedRemoteSources, GatheredSourceText, GatherSourceTextOptions } from "../utils/gatherSourceText";
import type { SavedDraftRecord, WorkflowSnapshot, WorkflowStep } from "../utils/draftStorage";

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
  websiteUrl: string;
  pastedText: string;
}

export interface PatentWorkflowContextValue {
  invention: InventionDetails | null;
  sections: Record<string, string>;
  figures: PatentFigure[];
  briefDescriptionOfDrawings: string;
  filingInfo: FilingInfo;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  cachedRemoteSources: CachedRemoteSources;
  attorneyFeedback: Record<PatentSectionId, string>;
  attorneyFeedbackGlobal: string;
  approvedExemplars: Record<PatentSectionId, boolean>;
  aiInitialSections: Record<string, string>;
  includeInLearningCorpus: boolean;
  completedSteps: WorkflowStep[];
  extractionSourceKey: string | null;
  autoDraftPending: boolean;
  /** True while a full workflow reset is in progress (suppresses auto-save and step redirects). */
  workflowResetting: boolean;
  setInvention: (details: InventionDetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
  captureAiInitialSections: (drafted: Record<string, string>) => void;
  setAttorneyFeedback: (sectionId: PatentSectionId, comment: string) => void;
  setAttorneyFeedbackGlobal: (comment: string) => void;
  setApprovedExemplar: (sectionId: PatentSectionId, approved: boolean) => void;
  setIncludeInLearningCorpus: (include: boolean) => void;
  setFiguresResult: (result: FiguresResult) => void;
  updateFigure: (number: number, patch: Partial<PatentFigure>) => void;
  setBriefDescriptionOfDrawings: (text: string) => void;
  setFilingInfo: (patch: Partial<FilingInfo>) => void;
  setUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFilesAndPersist: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
  gatherSourceText: (options?: GatherSourceTextOptions) => Promise<GatheredSourceText>;
  getWorkflowSnapshot: () => WorkflowSnapshot;
  importWorkflow: (workflow: WorkflowSnapshot) => void;
  getSavedDrafts: () => SavedDraftRecord[];
  saveNamedDraft: (name: string) => SavedDraftRecord;
  removeSavedDraft: (id: string) => void;
  exportDraftFile: (name: string) => void;
  importDraftFile: (file: File) => Promise<WorkflowSnapshot>;
  loadFromStorage: () => void;
  saveToStorage: () => void;
  clearWorkflow: () => void;
  markStepComplete: (step: WorkflowStep) => void;
  setExtractionSourceKey: (key: string | null) => void;
  requestAutoDraft: () => void;
  clearAutoDraftPending: () => void;
}

export const PatentWorkflowContext = createContext<PatentWorkflowContextValue | null>(null);

export function usePatentWorkflow(): PatentWorkflowContextValue {
  const ctx = useContext(PatentWorkflowContext);
  if (!ctx) {
    throw new Error("usePatentWorkflow must be used within PatentWorkflowProvider");
  }
  return ctx;
}
