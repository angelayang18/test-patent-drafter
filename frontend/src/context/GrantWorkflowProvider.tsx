import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GrantDetails } from "../types/patent";
import {
  clearActiveGrantWorkflow,
  createEmptyGrantWorkflowSnapshot,
  defaultGrantDraftName,
  deleteSavedGrantDraft,
  downloadGrantDraftFile,
  grantWorkflowHasProgress,
  listSavedGrantDrafts,
  normalizeGrantWorkflow,
  readActiveGrantWorkflow,
  readGrantDraftFile,
  saveGrantDraftToLibrary,
  writeActiveGrantWorkflow,
  type GrantWorkflowSnapshot,
  type GrantWorkflowStep,
} from "../utils/grantStorage";
import {
  gatherCombinedSourceText,
  type CachedRemoteSources,
  type GatherSourceTextOptions,
} from "../utils/gatherSourceText";
import {
  GrantWorkflowContext,
  type InputSources,
  type UploadedSourceFile,
} from "./grantContext";

function readStorage(): GrantWorkflowSnapshot {
  return readActiveGrantWorkflow();
}

export function GrantWorkflowProvider({ children }: { children: ReactNode }) {
  const initial = readStorage();
  const [grantDetails, setGrantDetailsState] = useState<GrantDetails | null>(
    initial.grantDetails,
  );
  const [sections, setSectionsState] = useState<Record<string, string>>(initial.sections);
  const [uploadedFiles, setUploadedFilesState] = useState<UploadedSourceFile[]>(
    initial.uploadedFiles,
  );
  const [inputSources, setInputSourcesState] = useState<InputSources>(initial.inputSources);
  const [cachedRemoteSources, setCachedRemoteSourcesState] = useState<CachedRemoteSources>(
    initial.cachedRemoteSources ?? {},
  );
  const [completedSteps, setCompletedStepsState] = useState<GrantWorkflowStep[]>(
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
  const buildSnapshotRef = useRef<() => GrantWorkflowSnapshot>(() =>
    createEmptyGrantWorkflowSnapshot(),
  );

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

  const writeStoragePayload = useCallback(
    (patch?: Partial<GrantWorkflowSnapshot>) => {
      if (workflowResetting) {
        return;
      }
      const generation = storageWriteGenerationRef.current;
      const write = () => {
        pendingStorageWriteRef.current = null;
        if (generation !== storageWriteGenerationRef.current) {
          return;
        }
        const payload = normalizeGrantWorkflow({
          ...buildSnapshotRef.current(),
          ...patch,
        });
        if (!grantWorkflowHasProgress(payload)) {
          clearActiveGrantWorkflow();
          return;
        }
        try {
          writeActiveGrantWorkflow(payload);
        } catch {
          // localStorage quota — workflow still lives in memory
        }
      };
      if (typeof requestIdleCallback !== "undefined") {
        pendingStorageWriteRef.current = requestIdleCallback(write, { timeout: 2000 });
      } else {
        pendingStorageWriteRef.current = window.setTimeout(write, 0);
      }
    },
    [workflowResetting],
  );

  const persistWorkflowSnapshot = useCallback((workflow: GrantWorkflowSnapshot) => {
    const payload = normalizeGrantWorkflow(workflow);
    if (!grantWorkflowHasProgress(payload)) {
      clearActiveGrantWorkflow();
      return;
    }
    try {
      writeActiveGrantWorkflow(payload);
    } catch {
      // localStorage quota — workflow still lives in memory
    }
  }, []);

  const applyWorkflowSnapshot = useCallback((next: GrantWorkflowSnapshot) => {
    setGrantDetailsState(next.grantDetails);
    setSectionsState(next.sections);
    setUploadedFilesState(next.uploadedFiles);
    setInputSourcesState(next.inputSources);
    setCachedRemoteSourcesState(next.cachedRemoteSources ?? {});
    setCompletedStepsState(next.completedSteps ?? []);
    setExtractionSourceKeyState(next.extractionSourceKey ?? null);
    setAutoDraftPendingState(next.autoDraftPending ?? false);
  }, []);

  const buildSnapshot = useCallback(
    (): GrantWorkflowSnapshot => ({
      grantDetails,
      sections,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
    }),
    [
      grantDetails,
      sections,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
    ],
  );

  buildSnapshotRef.current = buildSnapshot;

  useEffect(() => {
    if (workflowResetting) {
      return;
    }
    writeStoragePayload();
  }, [
    grantDetails,
    sections,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    completedSteps,
    extractionSourceKey,
    autoDraftPending,
    workflowResetting,
    writeStoragePayload,
  ]);

  const saveToStorage = useCallback(() => {
    if (workflowResetting) {
      return;
    }
    const snapshot = buildSnapshot();
    if (!grantWorkflowHasProgress(snapshot)) {
      clearActiveGrantWorkflow();
      return;
    }
    writeStoragePayload();
  }, [buildSnapshot, writeStoragePayload, workflowResetting]);

  const getWorkflowSnapshot = useCallback(() => buildSnapshot(), [buildSnapshot]);

  const importWorkflow = useCallback(
    (workflow: GrantWorkflowSnapshot) => {
      const next = normalizeGrantWorkflow(workflow);
      applyWorkflowSnapshot(next);
      persistWorkflowSnapshot(next);
    },
    [applyWorkflowSnapshot, persistWorkflowSnapshot],
  );

  const getSavedDrafts = useCallback(() => listSavedGrantDrafts(), []);

  const saveNamedDraft = useCallback(
    (name: string) => {
      const record = saveGrantDraftToLibrary(name, buildSnapshot());
      writeStoragePayload();
      return record;
    },
    [buildSnapshot, writeStoragePayload],
  );

  const removeSavedDraft = useCallback((id: string) => {
    deleteSavedGrantDraft(id);
  }, []);

  const exportDraftFile = useCallback(
    (name: string) => {
      downloadGrantDraftFile(name || defaultGrantDraftName(buildSnapshot()), buildSnapshot());
    },
    [buildSnapshot],
  );

  const importDraftFile = useCallback(
    async (file: File) => {
      const parsed = await readGrantDraftFile(file);
      importWorkflow(parsed.workflow);
      return parsed.workflow;
    },
    [importWorkflow],
  );

  const setGrantDetails = useCallback((details: GrantDetails) => {
    setGrantDetailsState(details);
  }, []);

  const setSection = useCallback((sectionId: string, content: string) => {
    setSectionsState((prev) => ({ ...prev, [sectionId]: content }));
  }, []);

  const setSections = useCallback((next: Record<string, string>) => {
    setSectionsState(next);
  }, []);

  const setUploadedFiles = useCallback((files: UploadedSourceFile[]) => {
    setUploadedFilesState(files);
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

  const gatherSourceText = useCallback(
    async (options?: GatherSourceTextOptions) => {
      const result = await gatherCombinedSourceText({
        buildLocalText: buildCombinedSourceText,
        inputSources,
        cached: cachedRemoteSources,
        onProgress: options?.onProgress,
      });
      setCachedRemoteSourcesState(result.cache);
      writeStoragePayload({ cachedRemoteSources: result.cache });
      return { combined: result.combined, cache: result.cache };
    },
    [buildCombinedSourceText, inputSources, cachedRemoteSources, writeStoragePayload],
  );

  const markStepComplete = useCallback(
    (step: GrantWorkflowStep) => {
      setCompletedStepsState((prev) => {
        if (prev.includes(step)) return prev;
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
    clearActiveGrantWorkflow();
    setWorkflowResetting(true);
    applyWorkflowSnapshot(createEmptyGrantWorkflowSnapshot());
    window.setTimeout(() => setWorkflowResetting(false), 0);
  }, [cancelPendingStorageWrite, applyWorkflowSnapshot]);

  const value = useMemo(
    () => ({
      grantDetails,
      sections,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      workflowResetting,
      setGrantDetails,
      setSection,
      setSections,
      setUploadedFiles,
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
      saveToStorage,
      clearWorkflow,
      markStepComplete,
      setExtractionSourceKey,
      requestAutoDraft,
      clearAutoDraftPending,
    }),
    [
      grantDetails,
      sections,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      workflowResetting,
      setGrantDetails,
      setSection,
      setSections,
      setUploadedFiles,
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
      saveToStorage,
      clearWorkflow,
      markStepComplete,
      setExtractionSourceKey,
      requestAutoDraft,
      clearAutoDraftPending,
    ],
  );

  return (
    <GrantWorkflowContext.Provider value={value}>{children}</GrantWorkflowContext.Provider>
  );
}
