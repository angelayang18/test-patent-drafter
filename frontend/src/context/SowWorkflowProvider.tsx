import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SOWDetails, SectionCitation } from "../types/patent";
import { SOW_SECTION_IDS } from "../types/patent";
import {
  clearActiveSowWorkflow,
  createEmptySowWorkflowSnapshot,
  defaultSowDraftName,
  deleteSavedSowDraft,
  downloadSowDraftFile,
  sowWorkflowHasProgress,
  listSavedSowDrafts,
  normalizeSowWorkflow,
  readActiveSowWorkflow,
  readSowDraftFile,
  saveSowDraftToLibrary,
  writeActiveSowWorkflow,
  type SowWorkflowSnapshot,
  type SowWorkflowStep,
} from "../utils/sowStorage";
import {
  gatherCombinedSourceText,
  type CachedRemoteSources,
  type GatherSourceTextOptions,
} from "../utils/gatherSourceText";
import {
  defaultSectionSettings,
  type SectionSettingsMap,
} from "../utils/sectionSettings";
import {
  SowWorkflowContext,
  type InputSources,
  type UploadedSourceFile,
} from "./sowContext";

function readStorage(): SowWorkflowSnapshot {
  return readActiveSowWorkflow();
}

export function SowWorkflowProvider({ children }: { children: ReactNode }) {
  const initial = readStorage();
  const [sowDetails, setSowDetailsState] = useState<SOWDetails | null>(
    initial.sowDetails,
  );
  const [sections, setSectionsState] = useState<Record<string, string>>(initial.sections);
  const [sectionCitations, setSectionCitationsState] = useState<
    Record<string, SectionCitation[]>
  >(initial.sectionCitations ?? {});
  const [fieldCitations, setFieldCitationsState] = useState<
    Record<string, SectionCitation[]>
  >(initial.fieldCitations ?? {});
  const [sectionSettings, setSectionSettingsState] = useState<SectionSettingsMap>(
    initial.sectionSettings ?? defaultSectionSettings(SOW_SECTION_IDS),
  );
  const [uploadedFiles, setUploadedFilesState] = useState<UploadedSourceFile[]>(
    initial.uploadedFiles,
  );
  const [inputSources, setInputSourcesState] = useState<InputSources>(initial.inputSources);
  const [cachedRemoteSources, setCachedRemoteSourcesState] = useState<CachedRemoteSources>(
    initial.cachedRemoteSources ?? {},
  );
  const [completedSteps, setCompletedStepsState] = useState<SowWorkflowStep[]>(
    initial.completedSteps ?? [],
  );
  const [extractionSourceKey, setExtractionSourceKeyState] = useState<string | null>(
    initial.extractionSourceKey ?? null,
  );
  const [autoDraftPending, setAutoDraftPendingState] = useState(
    initial.autoDraftPending ?? false,
  );
  const [loadedFromDraftId, setLoadedFromDraftIdState] = useState<string | undefined>(
    initial.loadedFromDraftId,
  );
  const [workflowResetting, setWorkflowResetting] = useState(false);

  const storageWriteGenerationRef = useRef(0);
  const pendingStorageWriteRef = useRef<number | null>(null);
  const buildSnapshotRef = useRef<() => SowWorkflowSnapshot>(() =>
    createEmptySowWorkflowSnapshot(),
  );
  const extractionSourceKeyRef = useRef(extractionSourceKey);
  extractionSourceKeyRef.current = extractionSourceKey;

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
    (patch?: Partial<SowWorkflowSnapshot>) => {
      if (workflowResetting) {
        return;
      }
      const generation = storageWriteGenerationRef.current;
      const write = () => {
        pendingStorageWriteRef.current = null;
        if (generation !== storageWriteGenerationRef.current) {
          return;
        }
        const payload = normalizeSowWorkflow({
          ...buildSnapshotRef.current(),
          ...patch,
        });
        if (!sowWorkflowHasProgress(payload)) {
          clearActiveSowWorkflow();
          return;
        }
        try {
          writeActiveSowWorkflow(payload);
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

  const persistWorkflowSnapshot = useCallback((workflow: SowWorkflowSnapshot) => {
    const payload = normalizeSowWorkflow(workflow);
    if (!sowWorkflowHasProgress(payload)) {
      clearActiveSowWorkflow();
      return;
    }
    try {
      writeActiveSowWorkflow(payload);
    } catch {
      // localStorage quota — workflow still lives in memory
    }
  }, []);

  const applyWorkflowSnapshot = useCallback((next: SowWorkflowSnapshot) => {
    setSowDetailsState(next.sowDetails);
    setSectionsState(next.sections);
    setSectionCitationsState(next.sectionCitations ?? {});
    setFieldCitationsState(next.fieldCitations ?? {});
    setSectionSettingsState(
      next.sectionSettings ?? defaultSectionSettings(SOW_SECTION_IDS),
    );
    setUploadedFilesState(next.uploadedFiles);
    setInputSourcesState(next.inputSources);
    setCachedRemoteSourcesState(next.cachedRemoteSources ?? {});
    setCompletedStepsState(next.completedSteps ?? []);
    setExtractionSourceKeyState(next.extractionSourceKey ?? null);
    setAutoDraftPendingState(next.autoDraftPending ?? false);
    setLoadedFromDraftIdState(next.loadedFromDraftId);
  }, []);

  const buildSnapshot = useCallback(
    (): SowWorkflowSnapshot => ({
      sowDetails,
      sections,
      sectionCitations,
      fieldCitations,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      loadedFromDraftId,
    }),
    [
      sowDetails,
      sections,
      sectionCitations,
      fieldCitations,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      loadedFromDraftId,
    ],
  );

  buildSnapshotRef.current = buildSnapshot;

  useEffect(() => {
    if (workflowResetting) {
      return;
    }
    writeStoragePayload();
  }, [
    sowDetails,
    sections,
    sectionCitations,
    sectionSettings,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    completedSteps,
    extractionSourceKey,
    autoDraftPending,
    loadedFromDraftId,
    workflowResetting,
    writeStoragePayload,
  ]);

  const saveToStorage = useCallback(() => {
    if (workflowResetting) {
      return;
    }
    const snapshot = buildSnapshot();
    if (!sowWorkflowHasProgress(snapshot)) {
      clearActiveSowWorkflow();
      return;
    }
    writeStoragePayload();
  }, [buildSnapshot, writeStoragePayload, workflowResetting]);

  const getWorkflowSnapshot = useCallback(() => buildSnapshot(), [buildSnapshot]);

  const importWorkflow = useCallback(
    (workflow: SowWorkflowSnapshot) => {
      const next = normalizeSowWorkflow(workflow);
      applyWorkflowSnapshot(next);
      persistWorkflowSnapshot(next);
    },
    [applyWorkflowSnapshot, persistWorkflowSnapshot],
  );

  const getSavedDrafts = useCallback(() => listSavedSowDrafts(), []);

  const saveNamedDraft = useCallback(
    (name: string) => {
      const record = saveSowDraftToLibrary(name, buildSnapshot());
      // Retarget identity to the newly saved library entry.
      setLoadedFromDraftIdState(record.id);
      writeStoragePayload({ loadedFromDraftId: record.id });
      return record;
    },
    [buildSnapshot, writeStoragePayload],
  );

  const removeSavedDraft = useCallback((id: string) => {
    deleteSavedSowDraft(id);
  }, []);

  const exportDraftFile = useCallback(
    (name: string) => {
      downloadSowDraftFile(name || defaultSowDraftName(buildSnapshot()), buildSnapshot());
    },
    [buildSnapshot],
  );

  const importDraftFile = useCallback(
    async (file: File) => {
      const parsed = await readSowDraftFile(file);
      importWorkflow(parsed.workflow);
      return parsed.workflow;
    },
    [importWorkflow],
  );

  const setSowDetails = useCallback((details: SOWDetails) => {
    setSowDetailsState(details);
  }, []);

  const setSection = useCallback((sectionId: string, content: string) => {
    setSectionsState((prev) => ({ ...prev, [sectionId]: content }));
  }, []);

  const setSections = useCallback((next: Record<string, string>) => {
    setSectionsState(next);
  }, []);

  const setSectionCitations = useCallback((citations: Record<string, SectionCitation[]>) => {
    setSectionCitationsState((prev) => ({ ...prev, ...citations }));
  }, []);

  const setFieldCitations = useCallback((citations: Record<string, SectionCitation[]>) => {
    setFieldCitationsState((prev) => ({ ...prev, ...citations }));
  }, []);

  const setSectionSettings = useCallback((settings: SectionSettingsMap) => {
    setSectionSettingsState(settings);
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
    (step: SowWorkflowStep) => {
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
      const diverged = extractionSourceKeyRef.current !== key;
      setExtractionSourceKeyState(key);
      if (diverged) {
        // Re-extracting from different sources means this session has diverged
        // from the library draft it was opened from.
        setLoadedFromDraftIdState(undefined);
        writeStoragePayload({
          extractionSourceKey: key,
          loadedFromDraftId: undefined,
        });
        return;
      }
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
    clearActiveSowWorkflow();
    setWorkflowResetting(true);
    applyWorkflowSnapshot(createEmptySowWorkflowSnapshot());
    window.setTimeout(() => setWorkflowResetting(false), 0);
  }, [cancelPendingStorageWrite, applyWorkflowSnapshot]);

  const value = useMemo(
    () => ({
      sowDetails,
      sections,
      sectionCitations,
      fieldCitations,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      workflowResetting,
      setSowDetails,
      setSection,
      setSections,
      setSectionCitations,
      setFieldCitations,
      setSectionSettings,
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
      sowDetails,
      sections,
      sectionCitations,
      fieldCitations,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      workflowResetting,
      setSowDetails,
      setSection,
      setSections,
      setSectionCitations,
      setFieldCitations,
      setSectionSettings,
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
    <SowWorkflowContext.Provider value={value}>{children}</SowWorkflowContext.Provider>
  );
}
