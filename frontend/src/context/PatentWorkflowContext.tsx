import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FiguresResult, InventionDetails, PatentFigure } from "../types/patent";

const STORAGE_KEY = "patent-drafter-workflow";

export interface UploadedSourceFile {
  id: string;
  filename: string;
  sizeBytes: number;
  content: string;
}

export interface InputSources {
  confluenceUrl: string;
  confluenceSpaceKey: string;
  confluenceToken: string;
  websiteUrl: string;
  pastedText: string;
}

interface StoredWorkflow {
  invention: InventionDetails | null;
  sections: Record<string, string>;
  figures: PatentFigure[];
  brief_description_of_drawings: string;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
}

interface PatentWorkflowContextValue {
  invention: InventionDetails | null;
  sections: Record<string, string>;
  figures: PatentFigure[];
  briefDescriptionOfDrawings: string;
  uploadedFiles: UploadedSourceFile[];
  inputSources: InputSources;
  setInvention: (details: InventionDetails) => void;
  setSection: (sectionId: string, content: string) => void;
  setSections: (sections: Record<string, string>) => void;
  setFiguresResult: (result: FiguresResult) => void;
  updateFigure: (number: number, patch: Partial<PatentFigure>) => void;
  setBriefDescriptionOfDrawings: (text: string) => void;
  setUploadedFiles: (files: UploadedSourceFile[]) => void;
  addUploadedFiles: (files: UploadedSourceFile[]) => void;
  removeUploadedFile: (id: string) => void;
  setInputSources: (patch: Partial<InputSources>) => void;
  buildCombinedSourceText: () => string;
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
  confluenceUrl: "",
  confluenceSpaceKey: "",
  confluenceToken: "",
  websiteUrl: "",
  pastedText: "",
};

const PatentWorkflowContext = createContext<PatentWorkflowContextValue | null>(null);

function readStorage(): StoredWorkflow {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        invention: null,
        sections: {},
        figures: [],
        brief_description_of_drawings: "",
        uploadedFiles: [],
        inputSources: emptyInputSources,
      };
    }
    const parsed = JSON.parse(raw) as StoredWorkflow;
    return {
      invention: parsed.invention ?? null,
      sections: parsed.sections ?? {},
      figures: parsed.figures ?? [],
      brief_description_of_drawings: parsed.brief_description_of_drawings ?? "",
      uploadedFiles: parsed.uploadedFiles ?? [],
      inputSources: { ...emptyInputSources, ...parsed.inputSources },
    };
  } catch {
    return {
      invention: null,
      sections: {},
      figures: [],
      brief_description_of_drawings: "",
      uploadedFiles: [],
      inputSources: emptyInputSources,
    };
  }
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
  const [uploadedFiles, setUploadedFilesState] = useState<UploadedSourceFile[]>(
    initial.uploadedFiles,
  );
  const [inputSources, setInputSourcesState] = useState<InputSources>(
    initial.inputSources,
  );

  const saveToStorage = useCallback(() => {
    const payload: StoredWorkflow = {
      invention,
      sections,
      figures,
      brief_description_of_drawings: briefDescriptionOfDrawings,
      uploadedFiles,
      inputSources,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [invention, sections, figures, briefDescriptionOfDrawings, uploadedFiles, inputSources]);

  const loadFromStorage = useCallback(() => {
    const stored = readStorage();
    setInventionState(stored.invention);
    setSectionsState(stored.sections);
    setFigures(stored.figures);
    setBriefDescriptionOfDrawings(stored.brief_description_of_drawings);
    setUploadedFilesState(stored.uploadedFiles);
    setInputSourcesState(stored.inputSources);
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

  const clearWorkflow = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setInventionState(null);
    setSectionsState({});
    setFigures([]);
    setBriefDescriptionOfDrawings("");
    setUploadedFilesState([]);
    setInputSourcesState(emptyInputSources);
  }, []);

  const value = useMemo(
    () => ({
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      uploadedFiles,
      inputSources,
      setInvention,
      setSection,
      setSections,
      setFiguresResult,
      updateFigure,
      setBriefDescriptionOfDrawings: updateBriefDescriptionOfDrawings,
      setUploadedFiles,
      addUploadedFiles,
      removeUploadedFile,
      setInputSources,
      buildCombinedSourceText,
      loadFromStorage,
      saveToStorage,
      clearWorkflow,
    }),
    [
      invention,
      sections,
      figures,
      briefDescriptionOfDrawings,
      uploadedFiles,
      inputSources,
      setInvention,
      setSection,
      setSections,
      setFiguresResult,
      updateFigure,
      updateBriefDescriptionOfDrawings,
      setUploadedFiles,
      addUploadedFiles,
      removeUploadedFile,
      setInputSources,
      buildCombinedSourceText,
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
