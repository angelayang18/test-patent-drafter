import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Navigate, useParams } from "react-router-dom";
import type { SectionCitation } from "../types/patent";
import type { GenericFigure } from "../types/genericFigures";
import { getDocumentTypeTemplate } from "../utils/documentTypeTemplates";
import {
  clearActiveGenericWorkflow,
  createEmptyGenericWorkflowSnapshot,
  defaultGenericDraftName,
  deleteSavedGenericDraft,
  downloadGenericDraftFile,
  genericWorkflowHasProgress,
  listSavedGenericDrafts,
  normalizeGenericWorkflow,
  readActiveGenericWorkflow,
  readGenericDraftFile,
  saveGenericDraftToLibrary,
  writeActiveGenericWorkflow,
  type GenericDocumentDetails,
  type GenericWorkflowSnapshot,
  type GenericWorkflowStep,
} from "../utils/genericStorage";
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
  GenericWorkflowContext,
  type InputSources,
  type UploadedSourceFile,
} from "./genericContext";

export function GenericWorkflowProvider({ children }: { children: ReactNode }) {
  const { templateId = "" } = useParams<{ templateId: string }>();
  const template = useMemo(
    () => getDocumentTypeTemplate(templateId),
    [templateId],
  );

  if (!template) {
    return <Navigate to="/" replace />;
  }

  return (
    <GenericWorkflowProviderInner
      key={templateId}
      templateId={templateId}
      template={template}
    >
      {children}
    </GenericWorkflowProviderInner>
  );
}

function GenericWorkflowProviderInner({
  children,
  templateId,
  template,
}: {
  children: ReactNode;
  templateId: string;
  template: NonNullable<ReturnType<typeof getDocumentTypeTemplate>>;
}) {
  const templateSectionIds = useMemo(
    () => template.sections.map((section) => section.id),
    [template.sections],
  );

  const initial = readActiveGenericWorkflow(templateId);
  const [details, setDetailsState] = useState<GenericDocumentDetails | null>(
    initial.details,
  );
  const [sections, setSectionsState] = useState<Record<string, string>>(initial.sections);
  const [sectionCitations, setSectionCitationsState] = useState<
    Record<string, SectionCitation[]>
  >(initial.sectionCitations ?? {});
  const [titleCitations, setTitleCitationsState] = useState<SectionCitation[]>(
    initial.titleCitations ?? [],
  );
  const [reviewerFeedback, setReviewerFeedbackState] = useState<Record<string, string>>(
    initial.reviewerFeedback ?? {},
  );
  const [sectionSettings, setSectionSettingsState] = useState<SectionSettingsMap>(
    initial.sectionSettings ?? defaultSectionSettings(templateSectionIds),
  );
  const [uploadedFiles, setUploadedFilesState] = useState<UploadedSourceFile[]>(
    initial.uploadedFiles,
  );
  const [inputSources, setInputSourcesState] = useState<InputSources>(initial.inputSources);
  const [cachedRemoteSources, setCachedRemoteSourcesState] = useState<CachedRemoteSources>(
    initial.cachedRemoteSources ?? {},
  );
  const [figures, setFiguresState] = useState<GenericFigure[]>(initial.figures ?? []);
  const [completedSteps, setCompletedStepsState] = useState<GenericWorkflowStep[]>(
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
  const buildSnapshotRef = useRef<() => GenericWorkflowSnapshot>(() =>
    createEmptyGenericWorkflowSnapshot(),
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
    (patch?: Partial<GenericWorkflowSnapshot>) => {
      if (workflowResetting) {
        return;
      }
      const generation = storageWriteGenerationRef.current;
      const write = () => {
        pendingStorageWriteRef.current = null;
        if (generation !== storageWriteGenerationRef.current) {
          return;
        }
        const payload = normalizeGenericWorkflow({
          ...buildSnapshotRef.current(),
          ...patch,
        });
        if (!genericWorkflowHasProgress(payload)) {
          clearActiveGenericWorkflow(templateId);
          return;
        }
        try {
          writeActiveGenericWorkflow(templateId, payload);
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
    [workflowResetting, templateId],
  );

  const persistWorkflowSnapshot = useCallback(
    (workflow: GenericWorkflowSnapshot) => {
      const payload = normalizeGenericWorkflow(workflow);
      if (!genericWorkflowHasProgress(payload)) {
        clearActiveGenericWorkflow(templateId);
        return;
      }
      try {
        writeActiveGenericWorkflow(templateId, payload);
      } catch {
        // localStorage quota — workflow still lives in memory
      }
    },
    [templateId],
  );

  const applyWorkflowSnapshot = useCallback(
    (next: GenericWorkflowSnapshot) => {
      setDetailsState(next.details);
      setSectionsState(next.sections);
      setSectionCitationsState(next.sectionCitations ?? {});
      setTitleCitationsState(next.titleCitations ?? []);
      setReviewerFeedbackState(next.reviewerFeedback ?? {});
      setSectionSettingsState(
        next.sectionSettings ?? defaultSectionSettings(templateSectionIds),
      );
      setUploadedFilesState(next.uploadedFiles);
      setInputSourcesState(next.inputSources);
      setCachedRemoteSourcesState(next.cachedRemoteSources ?? {});
      setFiguresState(next.figures ?? []);
      setCompletedStepsState(next.completedSteps ?? []);
      setExtractionSourceKeyState(next.extractionSourceKey ?? null);
      setAutoDraftPendingState(next.autoDraftPending ?? false);
      setLoadedFromDraftIdState(next.loadedFromDraftId);
    },
    [templateSectionIds],
  );

  const buildSnapshot = useCallback(
    (): GenericWorkflowSnapshot => ({
      details,
      sections,
      sectionCitations,
      titleCitations,
      reviewerFeedback,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      figures,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      loadedFromDraftId,
    }),
    [
      details,
      sections,
      sectionCitations,
      titleCitations,
      reviewerFeedback,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      figures,
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
    details,
    sections,
    sectionCitations,
    titleCitations,
    reviewerFeedback,
    sectionSettings,
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
    figures,
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
    if (!genericWorkflowHasProgress(snapshot)) {
      clearActiveGenericWorkflow(templateId);
      return;
    }
    writeStoragePayload();
  }, [buildSnapshot, writeStoragePayload, workflowResetting, templateId]);

  const getWorkflowSnapshot = useCallback(() => buildSnapshot(), [buildSnapshot]);

  const importWorkflow = useCallback(
    (workflow: GenericWorkflowSnapshot) => {
      const next = normalizeGenericWorkflow(workflow);
      applyWorkflowSnapshot(next);
      persistWorkflowSnapshot(next);
    },
    [applyWorkflowSnapshot, persistWorkflowSnapshot],
  );

  const getSavedDrafts = useCallback(
    () => listSavedGenericDrafts(templateId),
    [templateId],
  );

  const saveNamedDraft = useCallback(
    (name: string) => {
      const record = saveGenericDraftToLibrary(templateId, name, buildSnapshot());
      setLoadedFromDraftIdState(record.id);
      writeStoragePayload({ loadedFromDraftId: record.id });
      return record;
    },
    [buildSnapshot, writeStoragePayload, templateId],
  );

  const removeSavedDraft = useCallback(
    (id: string) => {
      deleteSavedGenericDraft(templateId, id);
    },
    [templateId],
  );

  const exportDraftFile = useCallback(
    (name: string) => {
      downloadGenericDraftFile(
        name || defaultGenericDraftName(buildSnapshot()),
        buildSnapshot(),
      );
    },
    [buildSnapshot],
  );

  const importDraftFile = useCallback(
    async (file: File) => {
      const parsed = await readGenericDraftFile(file);
      importWorkflow(parsed.workflow);
      return parsed.workflow;
    },
    [importWorkflow],
  );

  const setDetails = useCallback((next: GenericDocumentDetails) => {
    setDetailsState(next);
  }, []);

  const setFigures = useCallback((next: GenericFigure[]) => {
    setFiguresState(next);
  }, []);

  const updateFigure = useCallback((number: number, patch: Partial<GenericFigure>) => {
    setFiguresState((prev) =>
      prev.map((fig) => (fig.number === number ? { ...fig, ...patch } : fig)),
    );
  }, []);

  const setSection = useCallback((sectionId: string, content: string) => {
    setSectionsState((prev) => ({ ...prev, [sectionId]: content }));
  }, []);

  const setSections = useCallback((next: Record<string, string>) => {
    setSectionsState(next);
  }, []);

  const setSectionCitations = useCallback(
    (citations: Record<string, SectionCitation[]>) => {
      setSectionCitationsState((prev) => ({ ...prev, ...citations }));
    },
    [],
  );

  const setTitleCitations = useCallback((citations: SectionCitation[]) => {
    setTitleCitationsState(citations);
  }, []);

  const setReviewerFeedback = useCallback((sectionId: string, comment: string) => {
    setReviewerFeedbackState((prev) => ({ ...prev, [sectionId]: comment }));
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
    (step: GenericWorkflowStep) => {
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
    clearActiveGenericWorkflow(templateId);
    setWorkflowResetting(true);
    applyWorkflowSnapshot(createEmptyGenericWorkflowSnapshot());
    setSectionSettingsState(defaultSectionSettings(templateSectionIds));
    window.setTimeout(() => setWorkflowResetting(false), 0);
  }, [
    cancelPendingStorageWrite,
    applyWorkflowSnapshot,
    templateId,
    templateSectionIds,
  ]);

  const value = useMemo(
    () => ({
      templateId,
      template,
      details,
      sections,
      sectionCitations,
      titleCitations,
      reviewerFeedback,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      figures,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      workflowResetting,
      setDetails,
      setFigures,
      updateFigure,
      setSection,
      setSections,
      setSectionCitations,
      setTitleCitations,
      setReviewerFeedback,
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
      templateId,
      template,
      details,
      sections,
      sectionCitations,
      titleCitations,
      reviewerFeedback,
      sectionSettings,
      uploadedFiles,
      inputSources,
      cachedRemoteSources,
      figures,
      completedSteps,
      extractionSourceKey,
      autoDraftPending,
      workflowResetting,
      setDetails,
      setFigures,
      updateFigure,
      setSection,
      setSections,
      setSectionCitations,
      setTitleCitations,
      setReviewerFeedback,
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
    <GenericWorkflowContext.Provider value={value}>
      {children}
    </GenericWorkflowContext.Provider>
  );
}
