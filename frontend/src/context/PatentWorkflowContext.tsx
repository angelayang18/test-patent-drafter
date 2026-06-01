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
} from "../types/patent";
import { EMPTY_FILING_INFO } from "../types/patent";
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
} from "../utils/draftStorage";
import { gatherCombinedSourceText, type CachedRemoteSources } from "../utils/gatherSourceText";

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
  setInvention: (details: InventionDetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
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
  gatherSourceText: () => Promise<string>;
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

  const gatherSourceText = useCallback(async () => {
    const result = await gatherCombinedSourceText({
      buildLocalText: buildCombinedSourceText,
      inputSources,
      cached: cachedRemoteSources,
    });
    setCachedRemoteSourcesState(result.cache);
    writeStoragePayload({
      ...buildSnapshot(),
      cachedRemoteSources: result.cache,
    });
    return result.combined;
  }, [
    buildCombinedSourceText,
    inputSources,
    cachedRemoteSources,
    buildSnapshot,
    writeStoragePayload,
  ]);

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
      setInvention,
      setSection,
      setSections,
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
      setInvention,
      setSection,
      setSections,
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
