import {
  useCallback,
  useMemo,
  useRef,
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
  createEmptyWorkflowSnapshot,
  defaultDraftName,
  deleteSavedDraft,
  downloadDraftFile,
  listSavedDrafts,
  normalizeWorkflow,
  readActiveWorkflow,
  readDraftFile,
  saveDraftToLibrary,
  workflowHasProgress,
  writeActiveWorkflow,
  type WorkflowSnapshot,
  type WorkflowStep,
} from "../utils/draftStorage";
import { gatherCombinedSourceText, type CachedRemoteSources, type GatherSourceTextOptions } from "../utils/gatherSourceText";
import {
  PatentWorkflowContext,
  type InputSources,
  type UploadedSourceFile,
} from "./workflowContext";

interface StoredWorkflow extends WorkflowSnapshot {}

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
  const [workflowResetting, setWorkflowResetting] = useState(false);

  const storageWriteGenerationRef = useRef(0);
  const pendingStorageWriteRef = useRef<number | null>(null);
  const buildSnapshotRef = useRef<() => WorkflowSnapshot>(() => createEmptyWorkflowSnapshot());

  const cancelPendingStorageWrite = useCallback(() => {
    const pending = pendingStorageWriteRef.current;
    if (pending === null) {
      return;
    }
    pendingStorageWriteRef.current = null;
    if (typeof cancelIdleCallback !== "undefined") {
      cancelIdleCallback(pending);
    } else {
      window.clearTimeout(pending);
    }
  }, []);

  const writeStoragePayload = useCallback((patch?: Partial<WorkflowSnapshot>) => {
    if (workflowResetting) {
      return;
    }
    const generation = storageWriteGenerationRef.current;
    const write = () => {
      pendingStorageWriteRef.current = null;
      if (generation !== storageWriteGenerationRef.current) {
        return;
      }
      const payload = normalizeWorkflow({
        ...buildSnapshotRef.current(),
        ...patch,
      });
      if (!workflowHasProgress(payload)) {
        clearActiveWorkflow();
        return;
      }
      try {
        writeActiveWorkflow(payload);
      } catch {
        // localStorage quota — workflow still lives in memory
      }
    };
    if (typeof requestIdleCallback !== "undefined") {
      pendingStorageWriteRef.current = requestIdleCallback(write, { timeout: 2000 });
    } else {
      pendingStorageWriteRef.current = window.setTimeout(write, 0);
    }
  }, [workflowResetting]);

  const persistWorkflowSnapshot = useCallback((workflow: WorkflowSnapshot) => {
    const payload = normalizeWorkflow(workflow);
    if (!workflowHasProgress(payload)) {
      clearActiveWorkflow();
      return;
    }
    try {
      writeActiveWorkflow(payload);
    } catch {
      // localStorage quota — workflow still lives in memory
    }
  }, []);

  const applyWorkflowSnapshot = useCallback(
    (next: WorkflowSnapshot) => {
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
    },
    [],
  );

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

  buildSnapshotRef.current = buildSnapshot;

  const saveToStorage = useCallback(() => {
    if (workflowResetting) {
      return;
    }
    const snapshot = buildSnapshot();
    if (!workflowHasProgress(snapshot)) {
      clearActiveWorkflow();
      return;
    }
    writeStoragePayload();
  }, [buildSnapshot, writeStoragePayload, workflowResetting]);

  const getWorkflowSnapshot = useCallback(() => buildSnapshot(), [buildSnapshot]);

  const importWorkflow = useCallback(
    (workflow: WorkflowSnapshot) => {
      const next = normalizeWorkflow(workflow);
      applyWorkflowSnapshot(next);
      persistWorkflowSnapshot(next);
    },
    [applyWorkflowSnapshot, persistWorkflowSnapshot],
  );

  const getSavedDrafts = useCallback(() => listSavedDrafts(), []);

  const saveNamedDraft = useCallback(
    (name: string) => {
      const record = saveDraftToLibrary(name, buildSnapshot());
      writeStoragePayload();
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
    applyWorkflowSnapshot(readStorage());
  }, [applyWorkflowSnapshot]);

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
        writeStoragePayload({ filingInfo: next });
        return next;
      });
    },
    [writeStoragePayload],
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
        writeStoragePayload({ uploadedFiles: next });
        return next;
      });
    },
    [writeStoragePayload],
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
    writeStoragePayload({ cachedRemoteSources: result.cache });
    return { combined: result.combined, cache: result.cache };
  }, [
    buildCombinedSourceText,
    inputSources,
    cachedRemoteSources,
    writeStoragePayload,
  ]);

  const markStepComplete = useCallback(
    (step: WorkflowStep) => {
      setCompletedStepsState((prev) => {
        if (prev.includes(step)) {
          return prev;
        }
        const next = [...prev, step];
        writeStoragePayload({ completedSteps: next });
        return next;
      });
    },
    [writeStoragePayload],
  );

  const setExtractionSourceKey = useCallback(
    (key: string | null) => {
      setExtractionSourceKeyState(key);
      writeStoragePayload({ extractionSourceKey: key });
    },
    [writeStoragePayload],
  );

  const requestAutoDraft = useCallback(() => {
    setAutoDraftPendingState(true);
    writeStoragePayload({ autoDraftPending: true });
  }, [writeStoragePayload]);

  const clearAutoDraftPending = useCallback(() => {
    setAutoDraftPendingState(false);
    writeStoragePayload({ autoDraftPending: false });
  }, [writeStoragePayload]);

  const clearWorkflow = useCallback(() => {
    storageWriteGenerationRef.current += 1;
    cancelPendingStorageWrite();
    clearActiveWorkflow();
    setWorkflowResetting(true);
    applyWorkflowSnapshot(createEmptyWorkflowSnapshot());
    window.setTimeout(() => setWorkflowResetting(false), 0);
  }, [cancelPendingStorageWrite, applyWorkflowSnapshot]);

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
      workflowResetting,
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
      workflowResetting,
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
