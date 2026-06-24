import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  FiguresResult,
  FilingInfo,
  InventionDetails,
  PatentFigure,
  PatentSectionId,
} from "../types/patent";
import { EMPTY_FILING_INFO, emptyApprovedExemplars, emptyAttorneyFeedback } from "../types/patent";
import {
  clearActiveWorkflow,
  defaultDraftName,
  deleteSavedDraft,
  downloadDraftFile,
  listSavedDrafts,
  normalizeWorkflow,
  readActiveWorkflow,
  readDraftFile,
  saveDraftToLibrary,
  writeActiveWorkflow,
  type SavedDraftRecord,
  type WorkflowSnapshot,
  type WorkflowStep,
} from "../utils/draftStorage";
import { gatherCombinedSourceText, type CachedRemoteSources, type GatheredSourceText, type GatherSourceTextOptions } from "../utils/gatherSourceText";

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

interface StoredWorkflow extends WorkflowSnapshot {}

interface PatentWorkflowContextValue {
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
  /** Append uploads and persist to localStorage without blocking the UI thread. */
  addUploadedFilesAndPersist: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
  /** Local files + paste, then remote sources (parallel, cached). */
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

const defaultInvention: InventionDetails = {
  invention_title: "",
  technical_field: "",
  problem_being_solved: "",
  core_technical_solution: "",
  novel_mechanism: "",
  alternative_embodiments: [],
  key_components: [],
};

const emptyInputSources: InputSources = {
  relevantContentNotes: "",
  irrelevantContentNotes: "",
  confluenceUrl: "",
  confluenceSpaceKey: "",
  confluenceToken: "",
  websiteUrl: "",
  pastedText: "",
};

const PatentWorkflowContext = createContext<PatentWorkflowContextValue | null>(null);

function readStorage(): StoredWorkflow {
  return readActiveWorkflow();
}

export function PatentWorkflowProvider({ children }: { children: ReactNode }) {
  const initial = readStorage();
  const [invention, setInventionState] = useState<InventionDetails | null>(
    initial.invention,
  );
  const [sections, setSectionsState] = useState<Record<string, string>>(
    initial.sections,
  );
  const [figures, setFigures] = useState<PatentFigure[]>(initial.figures);
  const [briefDescriptionOfDrawings, setBriefDescriptionOfDrawings] = useState(
    initial.brief_description_of_drawings,
  );
  const [filingInfo, setFilingInfoState] = useState<FilingInfo>(
    initial.filingInfo ?? EMPTY_FILING_INFO,
  );
  const [uploadedFiles, setUploadedFilesState] = useState<UploadedSourceFile[]>(
    initial.uploadedFiles,
  );
  const [inputSources, setInputSourcesState] = useState<InputSources>(
    initial.inputSources,
  );
  const [cachedRemoteSources, setCachedRemoteSourcesState] = useState<CachedRemoteSources>(
    initial.cachedRemoteSources ?? {},
  );
  const [attorneyFeedback, setAttorneyFeedbackState] = useState<
    Record<PatentSectionId, string>
  >(initial.attorneyFeedback ?? emptyAttorneyFeedback());
  const [attorneyFeedbackGlobal, setAttorneyFeedbackGlobalState] = useState(
    initial.attorneyFeedbackGlobal ?? "",
  );
  const [approvedExemplars, setApprovedExemplarsState] = useState<
    Record<PatentSectionId, boolean>
  >(initial.approvedExemplars ?? emptyApprovedExemplars());
  const [aiInitialSections, setAiInitialSectionsState] = useState<Record<string, string>>(
    initial.aiInitialSections ?? {},
  );
  const [includeInLearningCorpus, setIncludeInLearningCorpusState] = useState(
    initial.includeInLearningCorpus ?? true,
  );
  const [completedSteps, setCompletedStepsState] = useState<WorkflowStep[]>(
    initial.completedSteps ?? [],
  );
  const [extractionSourceKey, setExtractionSourceKeyState] = useState<string | null>(
    initial.extractionSourceKey ?? null,
  );
  const [autoDraftPending, setAutoDraftPendingState] = useState(
    initial.autoDraftPending ?? false,
  );

  const writeStoragePayload = useCallback((payload: StoredWorkflow) => {
    const write = () => {
      try {
        writeActiveWorkflow(payload);
      } catch {
        // localStorage quota — workflow still lives in memory
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(write, { timeout: 2000 });
    } else {
      window.setTimeout(write, 0);
    }
  }, []);

  const buildSnapshot = useCallback(
    (): WorkflowSnapshot => ({
      invention,
      sections,
      figures,
      brief_description_of_drawings: briefDescriptionOfDrawings,
      filingInfo,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      attorneyFeedback,
      attorneyFeedbackGlobal,
      approvedExemplars,
      aiInitialSections,
      includeInLearningCorpus,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
    }),
    [
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      filingInfo,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      attorneyFeedback,
      attorneyFeedbackGlobal,
      approvedExemplars,
      aiInitialSections,
      includeInLearningCorpus,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
    ],
  );

  const saveToStorage = useCallback(() => {
    writeStoragePayload(buildSnapshot());
  }, [buildSnapshot, writeStoragePayload]);

  const getWorkflowSnapshot = useCallback(() => buildSnapshot(), [buildSnapshot]);

  const importWorkflow = useCallback(
    (workflow: WorkflowSnapshot) => {
      const next = normalizeWorkflow(workflow);
      setInventionState(next.invention);
      setSectionsState(next.sections);
      setFigures(next.figures);
      setBriefDescriptionOfDrawings(next.brief_description_of_drawings);
      setFilingInfoState(next.filingInfo ?? EMPTY_FILING_INFO);
      setUploadedFilesState(next.uploadedFiles);
      setInputSourcesState(next.inputSources);
      setCachedRemoteSourcesState(next.cachedRemoteSources ?? {});
      setAttorneyFeedbackState(next.attorneyFeedback ?? emptyAttorneyFeedback());
      setAttorneyFeedbackGlobalState(next.attorneyFeedbackGlobal ?? "");
      setApprovedExemplarsState(next.approvedExemplars ?? emptyApprovedExemplars());
      setAiInitialSectionsState(next.aiInitialSections ?? {});
      setIncludeInLearningCorpusState(next.includeInLearningCorpus ?? true);
      setCompletedStepsState(next.completedSteps ?? []);
      setExtractionSourceKeyState(next.extractionSourceKey ?? null);
      setAutoDraftPendingState(next.autoDraftPending ?? false);
      writeStoragePayload(next);
    },
    [writeStoragePayload],
  );

  const getSavedDrafts = useCallback(() => listSavedDrafts(), []);

  const saveNamedDraft = useCallback(
    (name: string) => {
      const record = saveDraftToLibrary(name, buildSnapshot());
      writeStoragePayload(buildSnapshot());
      return record;
    },
    [buildSnapshot, writeStoragePayload],
  );

  const removeSavedDraft = useCallback((id: string) => {
    deleteSavedDraft(id);
  }, []);

  const exportDraftFile = useCallback(
    (name: string) => {
      downloadDraftFile(name || defaultDraftName(buildSnapshot()), buildSnapshot());
    },
    [buildSnapshot],
  );

  const importDraftFile = useCallback(async (file: File) => {
    const parsed = await readDraftFile(file);
    importWorkflow(parsed.workflow);
    return parsed.workflow;
  }, [importWorkflow]);

  const loadFromStorage = useCallback(() => {
    const stored = readStorage();
    setInventionState(stored.invention);
    setSectionsState(stored.sections);
    setFigures(stored.figures);
    setBriefDescriptionOfDrawings(stored.brief_description_of_drawings);
    setFilingInfoState(stored.filingInfo ?? EMPTY_FILING_INFO);
    setUploadedFilesState(stored.uploadedFiles);
    setInputSourcesState(stored.inputSources);
    setCachedRemoteSourcesState(stored.cachedRemoteSources ?? {});
    setAttorneyFeedbackState(stored.attorneyFeedback ?? emptyAttorneyFeedback());
    setAttorneyFeedbackGlobalState(stored.attorneyFeedbackGlobal ?? "");
    setApprovedExemplarsState(stored.approvedExemplars ?? emptyApprovedExemplars());
    setAiInitialSectionsState(stored.aiInitialSections ?? {});
    setIncludeInLearningCorpusState(stored.includeInLearningCorpus ?? true);
    setCompletedStepsState(stored.completedSteps ?? []);
    setExtractionSourceKeyState(stored.extractionSourceKey ?? null);
    setAutoDraftPendingState(stored.autoDraftPending ?? false);
  }, []);

  const setInvention = useCallback((details: InventionDetails) => {
    setInventionState(details);
  }, []);

  const setSection = useCallback((sectionId: string, content: string) => {
    setSectionsState((prev) => ({ ...prev, [sectionId]: content }));
  }, []);

  const setSections = useCallback((next: Record<string, string>) => {
    setSectionsState(next);
  }, []);

  const captureAiInitialSections = useCallback((drafted: Record<string, string>) => {
    setAiInitialSectionsState((prev) => {
      const merged = { ...prev };
      for (const [sectionId, content] of Object.entries(drafted)) {
        if (!merged[sectionId]?.trim() && content.trim()) {
          merged[sectionId] = content;
        }
      }
      return merged;
    });
  }, []);

  const setAttorneyFeedback = useCallback((sectionId: PatentSectionId, comment: string) => {
    setAttorneyFeedbackState((prev) => ({ ...prev, [sectionId]: comment }));
  }, []);

  const setAttorneyFeedbackGlobal = useCallback((comment: string) => {
    setAttorneyFeedbackGlobalState(comment);
  }, []);

  const setApprovedExemplar = useCallback((sectionId: PatentSectionId, approved: boolean) => {
    setApprovedExemplarsState((prev) => ({ ...prev, [sectionId]: approved }));
  }, []);

  const setIncludeInLearningCorpus = useCallback((include: boolean) => {
    setIncludeInLearningCorpusState(include);
  }, []);

  const setFiguresResult = useCallback((result: FiguresResult) => {
    setFigures(result.figures);
    setBriefDescriptionOfDrawings(result.brief_description_of_drawings);
    setSectionsState((prev) => ({
      ...prev,
      brief_description_of_drawings: result.brief_description_of_drawings,
    }));
  }, []);

  const updateFigure = useCallback((number: number, patch: Partial<PatentFigure>) => {
    setFigures((prev) =>
      prev.map((fig) => (fig.number === number ? { ...fig, ...patch } : fig)),
    );
  }, []);

  const setFilingInfo = useCallback(
    (patch: Partial<FilingInfo>) => {
      setFilingInfoState((prev) => {
        const next = { ...prev, ...patch };
        writeStoragePayload({
          invention,
          sections,
          figures,
          brief_description_of_drawings: briefDescriptionOfDrawings,
          filingInfo: next,
          uploadedFiles,
          inputSources,
          cachedRemoteSources,
          attorneyFeedback,
          attorneyFeedbackGlobal,
          approvedExemplars,
          aiInitialSections,
          includeInLearningCorpus,
        });
        return next;
      });
    },
    [
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      filingInfo,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      attorneyFeedback,
      attorneyFeedbackGlobal,
      approvedExemplars,
      aiInitialSections,
      includeInLearningCorpus,
      writeStoragePayload,
    ],
  );

  const updateBriefDescriptionOfDrawings = useCallback((text: string) => {
    setBriefDescriptionOfDrawings(text);
    setSectionsState((prev) => ({
      ...prev,
      brief_description_of_drawings: text,
    }));
  }, []);

  const setUploadedFiles = useCallback((files: UploadedSourceFile[]) => {
    setUploadedFilesState(files);
  }, []);

  const addUploadedFiles = useCallback((files: UploadedSourceFile[]) => {
    setUploadedFilesState((prev) => [...prev, ...files]);
  }, []);

  const addUploadedFilesAndPersist = useCallback(
    (files: UploadedSourceFile[]) => {
      setUploadedFilesState((prev) => {
        const next = [...prev, ...files];
        writeStoragePayload({
          invention,
          sections,
          figures,
          brief_description_of_drawings: briefDescriptionOfDrawings,
          filingInfo,
          uploadedFiles: next,
          inputSources,
          cachedRemoteSources,
          attorneyFeedback,
          attorneyFeedbackGlobal,
          approvedExemplars,
          aiInitialSections,
          includeInLearningCorpus,
        });
        return next;
      });
    },
    [
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      filingInfo,
      inputSources,
      cachedRemoteSources,
      attorneyFeedback,
      attorneyFeedbackGlobal,
      approvedExemplars,
      aiInitialSections,
      includeInLearningCorpus,
      writeStoragePayload,
    ],
  );

  const removeUploadedFile = useCallback((id: string) => {
    setUploadedFilesState((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const setInputSources = useCallback((patch: Partial<InputSources>) => {
    setInputSourcesState((prev) => ({ ...prev, ...patch }));
  }, []);

  const buildCombinedSourceText = useCallback(() => {
    const parts: string[] = [];
    for (const file of uploadedFiles) {
      if (file.content.trim()) {
        parts.push(`--- ${file.filename} ---\n${file.content}`);
      }
    }
    if (inputSources.pastedText.trim()) {
      parts.push(`--- Pasted text ---\n${inputSources.pastedText.trim()}`);
    }
    return parts.join("\n\n");
  }, [uploadedFiles, inputSources.pastedText]);

  const gatherSourceText = useCallback(async (options?: GatherSourceTextOptions) => {
    const result = await gatherCombinedSourceText({
      buildLocalText: buildCombinedSourceText,
      inputSources,
      cached: cachedRemoteSources,
      onProgress: options?.onProgress,
    });
    setCachedRemoteSourcesState(result.cache);
    writeStoragePayload({
      ...buildSnapshot(),
      cachedRemoteSources: result.cache,
    });
    return { combined: result.combined, cache: result.cache };
  }, [
    buildCombinedSourceText,
    inputSources,
    cachedRemoteSources,
    buildSnapshot,
    writeStoragePayload,
  ]);

  const markStepComplete = useCallback(
    (step: WorkflowStep) => {
      setCompletedStepsState((prev) => {
        if (prev.includes(step)) {
          return prev;
        }
        const next = [...prev, step];
        writeStoragePayload({
          ...buildSnapshot(),
          completedSteps: next,
        });
        return next;
      });
    },
    [buildSnapshot, writeStoragePayload],
  );

  const setExtractionSourceKey = useCallback(
    (key: string | null) => {
      setExtractionSourceKeyState(key);
      writeStoragePayload({
        ...buildSnapshot(),
        extractionSourceKey: key,
      });
    },
    [buildSnapshot, writeStoragePayload],
  );

  const requestAutoDraft = useCallback(() => {
    setAutoDraftPendingState(true);
    writeStoragePayload({
      ...buildSnapshot(),
      autoDraftPending: true,
    });
  }, [buildSnapshot, writeStoragePayload]);

  const clearAutoDraftPending = useCallback(() => {
    setAutoDraftPendingState(false);
    writeStoragePayload({
      ...buildSnapshot(),
      autoDraftPending: false,
    });
  }, [buildSnapshot, writeStoragePayload]);

  const clearWorkflow = useCallback(() => {
    clearActiveWorkflow();
    setInventionState(null);
    setSectionsState({});
    setFigures([]);
    setBriefDescriptionOfDrawings("");
    setFilingInfoState(EMPTY_FILING_INFO);
    setUploadedFilesState([]);
    setInputSourcesState(emptyInputSources);
    setCachedRemoteSourcesState({});
    setAttorneyFeedbackState(emptyAttorneyFeedback());
    setAttorneyFeedbackGlobalState("");
    setApprovedExemplarsState(emptyApprovedExemplars());
    setAiInitialSectionsState({});
    setIncludeInLearningCorpusState(true);
    setCompletedStepsState([]);
    setExtractionSourceKeyState(null);
    setAutoDraftPendingState(false);
  }, []);

  const value = useMemo(
    () => ({
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      filingInfo,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      attorneyFeedback,
      attorneyFeedbackGlobal,
      approvedExemplars,
      aiInitialSections,
      includeInLearningCorpus,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      setInvention,
      setSection,
      setSections,
      captureAiInitialSections,
      setAttorneyFeedback,
      setAttorneyFeedbackGlobal,
      setApprovedExemplar,
      setIncludeInLearningCorpus,
      setFiguresResult,
      updateFigure,
      setBriefDescriptionOfDrawings: updateBriefDescriptionOfDrawings,
      setFilingInfo,
      setUploadedFiles,
      addUploadedFiles,
      addUploadedFilesAndPersist,
      removeUploadedFile,
      setInputSources,
      buildCombinedSourceText,
      gatherSourceText,
      getWorkflowSnapshot,
      importWorkflow,
      getSavedDrafts,
      saveNamedDraft,
      removeSavedDraft,
      exportDraftFile,
      importDraftFile,
      loadFromStorage,
      saveToStorage,
      clearWorkflow,
      markStepComplete,
      setExtractionSourceKey,
      requestAutoDraft,
      clearAutoDraftPending,
    }),
    [
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      filingInfo,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      attorneyFeedback,
      attorneyFeedbackGlobal,
      approvedExemplars,
      aiInitialSections,
      includeInLearningCorpus,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      setInvention,
      setSection,
      setSections,
      captureAiInitialSections,
      setAttorneyFeedback,
      setAttorneyFeedbackGlobal,
      setApprovedExemplar,
      setIncludeInLearningCorpus,
      setFiguresResult,
      updateFigure,
      updateBriefDescriptionOfDrawings,
      setFilingInfo,
      setUploadedFiles,
      addUploadedFiles,
      addUploadedFilesAndPersist,
      removeUploadedFile,
      setInputSources,
      buildCombinedSourceText,
      gatherSourceText,
      getWorkflowSnapshot,
      importWorkflow,
      getSavedDrafts,
      saveNamedDraft,
      removeSavedDraft,
      exportDraftFile,
      importDraftFile,
      loadFromStorage,
      saveToStorage,
      clearWorkflow,
      markStepComplete,
      setExtractionSourceKey,
      requestAutoDraft,
      clearAutoDraftPending,
    ],
  );

  return (
    <PatentWorkflowContext.Provider value={value}>
      {children}
    </PatentWorkflowContext.Provider>
  );
}

export function usePatentWorkflow(): PatentWorkflowContextValue {
  const ctx = useContext(PatentWorkflowContext);
  if (!ctx) {
    throw new Error("usePatentWorkflow must be used within PatentWorkflowProvider");
  }
  return ctx;
}

export { defaultInvention };
