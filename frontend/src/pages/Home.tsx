import { useAuth, useUser } from "@clerk/clerk-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { SectionListEditor } from "../components/SectionListEditor";
import { UploadProgressPanel } from "../components/UploadProgressPanel";
import { getDocumentTypeConfig } from "../constants/documentTypes";
import { useAdaWorkflow } from "../context/AdaWorkflowContext";
import type { UploadedSourceFile } from "../context/grantContext";
import { useGrantWorkflow } from "../context/GrantWorkflowContext";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useSowWorkflow } from "../context/SowWorkflowContext";
import { useFileUpload } from "../hooks/useFileUpload";
import {
  ApiError,
  listCommunityDocumentTypeTemplates,
  publishDocumentTypeTemplate,
  suggestDocumentTypeSections,
  type CommunityDocumentTypeTemplate,
  type SuggestedDocumentSection,
} from "../services/api";
import {
  ADA_SECTION_IDS,
  ADA_SECTION_LABELS,
  GRANT_SECTION_IDS,
  GRANT_SECTION_LABELS,
  PATENT_SECTION_IDS,
  SECTION_LABELS,
  SOW_SECTION_IDS,
  SOW_SECTION_LABELS,
} from "../types/patent";
import { getAdaResumePath, adaWorkflowHasProgress, ADA_STEP_PATHS } from "../utils/adaStorage";
import { type CreateDocumentTypeSeed } from "../utils/communityDocumentTypes";
import { getResumePath, workflowHasProgress } from "../utils/draftStorage";
import {
  type CustomSectionDef,
  type DocumentTypeTemplate,
  deleteDocumentTypeTemplate,
  generateDocumentTypeTemplateId,
  listDocumentTypeTemplates,
  saveDocumentTypeTemplate,
} from "../utils/documentTypeTemplates";
import { fileIcon, formatFileSize } from "../utils/format";
import {
  clearActiveGenericWorkflow,
  GENERIC_STEP_PATHS,
  getGenericResumePath,
  genericWorkflowHasProgress,
  normalizeGenericWorkflow,
  readActiveGenericWorkflow,
  saveGenericDraftToLibrary,
  writeActiveGenericWorkflow,
} from "../utils/genericStorage";
import { getGrantResumePath, grantWorkflowHasProgress, GRANT_STEP_PATHS } from "../utils/grantStorage";
import {
  commitSectionSettings,
  defaultSectionSettings,
  effectiveSectionIds,
  generateCustomSectionId,
  orderAllSectionIds,
  resolveSectionDescription,
  resolveSectionLabel,
  seedSectionSettings,
  type SectionSetting,
  type SectionSettingsMap,
} from "../utils/sectionSettings";
import { getSowResumePath, sowWorkflowHasProgress, SOW_STEP_PATHS } from "../utils/sowStorage";
import "../styles/patent-drafter.css";

interface PendingSuggestedSection extends SuggestedDocumentSection {
  localId: string;
}

type BuiltinDocumentTypeId =
  | "PATENT_PROVISIONAL"
  | "GRANT_APPLICATION"
  | "SOW_CONTRACT"
  | "ADA_BIOANALYTICAL_REPORT";

type SelectedType =
  | { kind: "builtin"; id: BuiltinDocumentTypeId }
  | { kind: "custom"; templateId: string }
  | { kind: "creating" };

const DOCUMENT_TYPES: {
  id: BuiltinDocumentTypeId;
  title: string;
  steps: string;
}[] = [
  {
    id: "PATENT_PROVISIONAL",
    title: "Patent Draft",
    steps: "5 steps: Input → Review → Draft → Figures → Export",
  },
  {
    id: "GRANT_APPLICATION",
    title: "Grant Application",
    steps: "4 steps: Input → Review → Draft → Export",
  },
  {
    id: "SOW_CONTRACT",
    title: "SOW Contract",
    steps: "4 steps: Input → Review → Draft → Export",
  },
  {
    id: "ADA_BIOANALYTICAL_REPORT",
    title: "ADA Bioanalytical Report",
    steps: "4 steps: Input → Review → Draft → Export",
  },
];

const PATENT_WARN_ON_REMOVE = new Set(["claims"]);
const EMPTY_WARN_ON_REMOVE = new Set<string>();

const BUILTIN_CLONE_LABELS: Record<BuiltinDocumentTypeId, string> = {
  PATENT_PROVISIONAL: "Patent Draft",
  GRANT_APPLICATION: "Grant Application",
  SOW_CONTRACT: "SOW Contract",
  ADA_BIOANALYTICAL_REPORT: "ADA Bioanalytical Report",
};

function patchSetting(
  prev: SectionSettingsMap,
  id: string,
  patch: Partial<SectionSetting>,
): SectionSettingsMap {
  const current = prev[id] ?? { order: 0, included: true };
  return { ...prev, [id]: { ...current, ...patch } };
}

function sectionsFromBuiltin(typeId: BuiltinDocumentTypeId): CustomSectionDef[] {
  return getDocumentTypeConfig(typeId).sections.map((section, index) => ({
    id: section.id,
    name: section.name,
    description: section.description,
    order: index,
  }));
}

function sectionsToEditorState(sections: CustomSectionDef[]): {
  fixedIds: string[];
  defaultLabels: Record<string, string>;
  defaultDescriptions: Record<string, string>;
  localSettings: SectionSettingsMap;
  rowOrder: string[];
} {
  const fixedIds = sections.map((section) => section.id);
  const defaultLabels: Record<string, string> = {};
  const defaultDescriptions: Record<string, string> = {};
  for (const section of sections) {
    defaultLabels[section.id] = section.name;
    defaultDescriptions[section.id] = section.description;
  }
  const localSettings = defaultSectionSettings(fixedIds);
  return {
    fixedIds,
    defaultLabels,
    defaultDescriptions,
    localSettings,
    rowOrder: orderAllSectionIds(fixedIds, localSettings),
  };
}

function commitSectionsFromEditor(
  rowOrder: string[],
  localSettings: SectionSettingsMap,
  defaultLabels: Record<string, string>,
  defaultDescriptions: Record<string, string>,
): CustomSectionDef[] {
  const committed = commitSectionSettings(rowOrder, localSettings);
  return rowOrder
    .filter((id) => committed[id]?.included !== false)
    .map((id, index) => ({
      id,
      name: resolveSectionLabel(id, committed, defaultLabels[id] ?? id),
      description: resolveSectionDescription(
        id,
        committed,
        defaultDescriptions[id] ?? "",
      ),
      order: index,
    }));
}

interface TypeSectionsPanelProps {
  typeId: BuiltinDocumentTypeId;
  typeTitle: string;
  fixedIds: readonly string[];
  defaultLabels: Record<string, string>;
  warnOnRemoveIds: Set<string>;
  sectionSettings: SectionSettingsMap;
  setSectionSettings: (next: SectionSettingsMap) => void;
  hasProgress: boolean;
  resumePath: string;
  entryPath: string;
  saveNamedDraft: (name: string) => unknown;
  clearWorkflow: () => void;
}

function TypeSectionsPanel({
  typeId,
  typeTitle,
  fixedIds,
  defaultLabels,
  warnOnRemoveIds,
  sectionSettings,
  setSectionSettings,
  hasProgress,
  resumePath,
  entryPath,
  saveNamedDraft,
  clearWorkflow,
}: TypeSectionsPanelProps) {
  const navigate = useNavigate();

  const defaultDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of getDocumentTypeConfig(typeId).sections) {
      map[section.id] = section.description;
    }
    return map;
  }, [typeId]);

  const [localSettings, setLocalSettings] = useState<SectionSettingsMap>(() =>
    seedSectionSettings(fixedIds, sectionSettings),
  );
  const [rowOrder, setRowOrder] = useState<string[]>(() =>
    orderAllSectionIds(
      effectiveSectionIds(fixedIds, sectionSettings),
      seedSectionSettings(fixedIds, sectionSettings),
    ),
  );

  const handleContinue = () => {
    const committed = commitSectionSettings(rowOrder, localSettings);
    if (hasProgress) {
      saveNamedDraft("");
      clearWorkflow();
      // clearWorkflow() resets state asynchronously (it flips an internal
      // "resetting" flag back off on a deferred tick, suppressing storage
      // writes until then). Apply the new section settings after that
      // settles so this update isn't silently dropped.
      window.setTimeout(() => {
        setSectionSettings(committed);
        navigate(entryPath);
      }, 0);
      return;
    }
    setSectionSettings(committed);
    navigate(entryPath);
  };

  return (
    <div className="space-y-6">
      {hasProgress && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 space-y-3">
          <p className="font-body-md text-body-md text-on-surface">
            You have a {typeTitle} draft in progress.
          </p>
          <Link
            to={resumePath}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
          >
            Continue draft
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </Link>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Or configure sections below to start a new {typeTitle} — your current progress will
            be saved to Drafts automatically.
          </p>
        </div>
      )}

      <p className="font-body-md text-body-md text-on-surface-variant">
        These are the default sections we&apos;ll draft. Reorder, rename, remove, or add sections —
        if you don&apos;t change anything, the defaults below are used.
      </p>

      <SectionListEditor
        fixedIds={fixedIds}
        rowOrder={rowOrder}
        localSettings={localSettings}
        warnOnRemoveIds={warnOnRemoveIds}
        defaultLabels={defaultLabels}
        defaultDescriptions={defaultDescriptions}
        onMove={(index, direction) => {
          const target = index + direction;
          if (target < 0 || target >= rowOrder.length) return;
          setRowOrder((prev) => {
            const next = [...prev];
            const [removed] = next.splice(index, 1);
            next.splice(target, 0, removed);
            return next;
          });
        }}
        onPatch={(id, patch) => setLocalSettings((prev) => patchSetting(prev, id, patch))}
        onToggleIncluded={(id, included) =>
          setLocalSettings((prev) => patchSetting(prev, id, { included }))
        }
        onDeleteCustom={(id) => {
          setRowOrder((prev) => prev.filter((rowId) => rowId !== id));
          setLocalSettings((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }}
        onAdd={(id, setting) => {
          setLocalSettings((prev) => ({ ...prev, [id]: setting }));
          setRowOrder((prev) => [...prev, id]);
        }}
      />

      <div className="flex justify-end pt-4 border-t border-outline-variant">
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
        >
          {hasProgress ? "Start new draft" : "Continue"}
          <span className="material-symbols-outlined text-[20px]">
            {hasProgress ? "add" : "arrow_forward"}
          </span>
        </button>
      </div>
    </div>
  );
}

interface CustomTypeSectionsPanelProps {
  template: DocumentTypeTemplate;
}

function CustomTypeSectionsPanel({ template }: CustomTypeSectionsPanelProps) {
  const navigate = useNavigate();
  const fixedIds = useMemo(
    () => template.sections.map((section) => section.id),
    [template.sections],
  );
  const defaultLabels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of template.sections) {
      map[section.id] = section.name;
    }
    return map;
  }, [template.sections]);
  const defaultDescriptions = useMemo(() => {
    const map: Record<string, string> = {};
    for (const section of template.sections) {
      map[section.id] = section.description;
    }
    return map;
  }, [template.sections]);

  const workflow = readActiveGenericWorkflow(template.id);
  const sectionSettings =
    workflow.sectionSettings ?? defaultSectionSettings(fixedIds);
  const hasProgress = genericWorkflowHasProgress(workflow);
  const resumePath = getGenericResumePath(template.id, workflow);
  const entryPath = GENERIC_STEP_PATHS(template.id).input;

  const [localSettings, setLocalSettings] = useState<SectionSettingsMap>(() =>
    seedSectionSettings(fixedIds, sectionSettings),
  );
  const [rowOrder, setRowOrder] = useState<string[]>(() =>
    orderAllSectionIds(
      effectiveSectionIds(fixedIds, sectionSettings),
      seedSectionSettings(fixedIds, sectionSettings),
    ),
  );

  const handleContinue = () => {
    const committed = commitSectionSettings(rowOrder, localSettings);
    if (hasProgress) {
      saveGenericDraftToLibrary(template.id, "", workflow);
      clearActiveGenericWorkflow(template.id);
      writeActiveGenericWorkflow(
        template.id,
        normalizeGenericWorkflow({ sectionSettings: committed }),
      );
    } else {
      const current = readActiveGenericWorkflow(template.id);
      writeActiveGenericWorkflow(
        template.id,
        normalizeGenericWorkflow({ ...current, sectionSettings: committed }),
      );
    }
    navigate(entryPath);
  };

  return (
    <div className="space-y-6">
      {hasProgress && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 space-y-3">
          <p className="font-body-md text-body-md text-on-surface">
            You have a {template.name} draft in progress.
          </p>
          <Link
            to={resumePath}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
          >
            Continue draft
            <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
          </Link>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Or configure sections below to start a new {template.name} — your current progress
            will be saved to Drafts automatically.
          </p>
        </div>
      )}

      {template.description && (
        <p className="font-body-md text-body-md text-on-surface-variant">{template.description}</p>
      )}
      {template.basedOn && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">{template.basedOn}</p>
      )}
      {(template.builtFromSamples || template.sampleNote) && (
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {template.sampleNote?.trim() || "Built from uploaded sample reports."}
        </p>
      )}
      <p className="font-body-md text-body-md text-on-surface-variant">
        These are the default sections we&apos;ll draft. Reorder, rename, remove, or add sections —
        if you don&apos;t change anything, the defaults below are used.
      </p>

      <SectionListEditor
        fixedIds={fixedIds}
        rowOrder={rowOrder}
        localSettings={localSettings}
        warnOnRemoveIds={EMPTY_WARN_ON_REMOVE}
        defaultLabels={defaultLabels}
        defaultDescriptions={defaultDescriptions}
        onMove={(index, direction) => {
          const target = index + direction;
          if (target < 0 || target >= rowOrder.length) return;
          setRowOrder((prev) => {
            const next = [...prev];
            const [removed] = next.splice(index, 1);
            next.splice(target, 0, removed);
            return next;
          });
        }}
        onPatch={(id, patch) => setLocalSettings((prev) => patchSetting(prev, id, patch))}
        onToggleIncluded={(id, included) =>
          setLocalSettings((prev) => patchSetting(prev, id, { included }))
        }
        onDeleteCustom={(id) => {
          setRowOrder((prev) => prev.filter((rowId) => rowId !== id));
          setLocalSettings((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }}
        onAdd={(id, setting) => {
          setLocalSettings((prev) => ({ ...prev, [id]: setting }));
          setRowOrder((prev) => [...prev, id]);
        }}
      />

      <div className="flex justify-end pt-4 border-t border-outline-variant">
        <button
          type="button"
          onClick={handleContinue}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
        >
          {hasProgress ? "Start new draft" : "Continue"}
          <span className="material-symbols-outlined text-[20px]">
            {hasProgress ? "add" : "arrow_forward"}
          </span>
        </button>
      </div>
    </div>
  );
}

type CreateMode = "blank" | "clone";

interface CreateDocumentTypePanelProps {
  templates: DocumentTypeTemplate[];
  initialSeed?: CreateDocumentTypeSeed | null;
  onSaved: (template: DocumentTypeTemplate) => void;
  onCancel: () => void;
}

function CreateDocumentTypePanel({
  templates,
  initialSeed = null,
  onSaved,
  onCancel,
}: CreateDocumentTypePanelProps) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [name, setName] = useState(initialSeed?.name ?? "");
  const [description, setDescription] = useState(initialSeed?.description ?? "");
  const [shareWithTeam, setShareWithTeam] = useState(true);
  const [mode, setMode] = useState<CreateMode>(initialSeed ? "clone" : "blank");
  const [cloneSource, setCloneSource] = useState<string>("builtin:SOW_CONTRACT");
  const [basedOn, setBasedOn] = useState<string | undefined>(initialSeed?.basedOn);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(Boolean(initialSeed));

  const initialEditor = initialSeed
    ? sectionsToEditorState(initialSeed.sections)
    : null;
  const [fixedIds, setFixedIds] = useState<string[]>(initialEditor?.fixedIds ?? []);
  const [defaultLabels, setDefaultLabels] = useState<Record<string, string>>(
    initialEditor?.defaultLabels ?? {},
  );
  const [defaultDescriptions, setDefaultDescriptions] = useState<Record<string, string>>(
    initialEditor?.defaultDescriptions ?? {},
  );
  const [localSettings, setLocalSettings] = useState<SectionSettingsMap>(
    initialEditor?.localSettings ?? {},
  );
  const [rowOrder, setRowOrder] = useState<string[]>(initialEditor?.rowOrder ?? []);

  const [sampleFiles, setSampleFiles] = useState<UploadedSourceFile[]>([]);
  const [pendingSuggestions, setPendingSuggestions] = useState<PendingSuggestedSection[]>([]);
  const [styleNote, setStyleNote] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [builtFromSamples, setBuiltFromSamples] = useState(false);
  const [sampleNote, setSampleNote] = useState<string | undefined>(undefined);

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef(name);
  const descriptionRef = useRef(description);
  nameRef.current = name;
  descriptionRef.current = description;

  const cloneOptions = useMemo(() => {
    const builtin = DOCUMENT_TYPES.map((doc) => ({
      value: `builtin:${doc.id}`,
      label: doc.title,
    }));
    const custom = templates.map((template) => ({
      value: `template:${template.id}`,
      label: template.name,
    }));
    return [...builtin, ...custom];
  }, [templates]);

  const requestSuggestions = useCallback(async (files: UploadedSourceFile[]) => {
    const trimmedName = nameRef.current.trim();
    if (!trimmedName) {
      setSuggestError("Enter a name for the document type before suggesting sections.");
      return;
    }
    const combinedText = files
      .map((file) => `--- ${file.filename} ---\n${file.content}`)
      .join("\n\n")
      .trim();
    if (!combinedText) {
      setSuggestError("Uploaded samples had no extractable text.");
      return;
    }

    setSuggesting(true);
    setSuggestError(null);
    try {
      const result = await suggestDocumentTypeSections(
        combinedText,
        trimmedName,
        descriptionRef.current,
      );
      setPendingSuggestions(
        result.sections.map((section, index) => ({
          localId: `suggestion-${Date.now()}-${index}`,
          name: section.name,
          description: section.description ?? "",
        })),
      );
      setStyleNote(result.styleNote);
    } catch (err) {
      setPendingSuggestions([]);
      setStyleNote(null);
      setSuggestError(
        err instanceof ApiError ? err.message : "Could not suggest sections from samples.",
      );
    } finally {
      setSuggesting(false);
    }
  }, []);

  const handleSamplesUploaded = useCallback(
    (files: UploadedSourceFile[]) => {
      setSampleFiles((prev) => {
        const next = [...prev, ...files];
        setBuiltFromSamples(true);
        const filenames = next.map((file) => file.filename).filter(Boolean);
        setSampleNote(
          filenames.length > 0
            ? `Built from sample report${filenames.length === 1 ? "" : "s"}: ${filenames.join(", ")}`
            : "Built from uploaded sample reports.",
        );
        void requestSuggestions(next);
        return next;
      });
    },
    [requestSuggestions],
  );

  const { processFiles, uploadQueue, error: uploadError, uploading } =
    useFileUpload(handleSamplesUploaded);

  useEffect(() => {
    const dropzone = dropzoneRef.current;
    if (!dropzone) return;

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.add("border-secondary", "bg-secondary/10");
    };
    const onDragLeave = () => {
      dropzone.classList.remove("border-secondary", "bg-secondary/10");
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.remove("border-secondary", "bg-secondary/10");
      if (e.dataTransfer?.files?.length) {
        void processFiles(e.dataTransfer.files);
      }
    };

    dropzone.addEventListener("dragover", onDragOver);
    dropzone.addEventListener("dragleave", onDragLeave);
    dropzone.addEventListener("drop", onDrop);
    return () => {
      dropzone.removeEventListener("dragover", onDragOver);
      dropzone.removeEventListener("dragleave", onDragLeave);
      dropzone.removeEventListener("drop", onDrop);
    };
  }, [processFiles, started]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const seedFromSections = (sections: CustomSectionDef[], provenance?: string) => {
    const editor = sectionsToEditorState(sections);
    setFixedIds(editor.fixedIds);
    setDefaultLabels(editor.defaultLabels);
    setDefaultDescriptions(editor.defaultDescriptions);
    setLocalSettings(editor.localSettings);
    setRowOrder(editor.rowOrder);
    setBasedOn(provenance);
    setStarted(true);
    setError(null);
  };

  const handleStartConfiguring = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a name for the new document type.");
      return;
    }

    if (mode === "blank") {
      seedFromSections([]);
      return;
    }

    if (cloneSource.startsWith("builtin:")) {
      const typeId = cloneSource.slice("builtin:".length) as BuiltinDocumentTypeId;
      seedFromSections(
        sectionsFromBuiltin(typeId),
        `Cloned from ${BUILTIN_CLONE_LABELS[typeId]}`,
      );
      return;
    }

    if (cloneSource.startsWith("template:")) {
      const templateId = cloneSource.slice("template:".length);
      const source = templates.find((template) => template.id === templateId);
      if (!source) {
        setError("Could not find the selected template to clone.");
        return;
      }
      seedFromSections(
        source.sections.map((section, index) => ({ ...section, order: index })),
        `Cloned from ${source.name}`,
      );
      return;
    }

    setError("Select a source to clone from.");
  };

  const appendSectionsToEditor = (
    sections: Array<{ name: string; description: string }>,
  ) => {
    const valid = sections
      .map((section) => ({
        name: section.name.trim(),
        description: section.description.trim(),
      }))
      .filter((section) => section.name);
    if (valid.length === 0) return;

    setRowOrder((prevOrder) => {
      const nextOrder = [...prevOrder];
      const additions: SectionSettingsMap = {};
      for (const section of valid) {
        const id = generateCustomSectionId(section.name, nextOrder);
        additions[id] = {
          order: nextOrder.length,
          included: true,
          name: section.name,
          ...(section.description ? { description: section.description } : {}),
        };
        nextOrder.push(id);
      }
      setLocalSettings((prevSettings) => ({ ...prevSettings, ...additions }));
      return nextOrder;
    });
  };

  const handleAcceptSuggestion = (localId: string) => {
    const suggestion = pendingSuggestions.find((item) => item.localId === localId);
    if (!suggestion) return;
    appendSectionsToEditor([suggestion]);
    setPendingSuggestions((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handleRejectSuggestion = (localId: string) => {
    setPendingSuggestions((prev) => prev.filter((item) => item.localId !== localId));
  };

  const handlePatchSuggestion = (
    localId: string,
    patch: Partial<Pick<PendingSuggestedSection, "name" | "description">>,
  ) => {
    setPendingSuggestions((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  };

  const handleAcceptAllSuggestions = () => {
    appendSectionsToEditor(pendingSuggestions);
    setPendingSuggestions([]);
  };

  const handleRejectAllSuggestions = () => {
    setPendingSuggestions([]);
    setStyleNote(null);
  };

  const handleRemoveSampleFile = (id: string) => {
    setSampleFiles((prev) => {
      const next = prev.filter((file) => file.id !== id);
      if (next.length === 0) {
        setBuiltFromSamples(false);
        setSampleNote(undefined);
        setPendingSuggestions([]);
        setStyleNote(null);
      } else {
        const filenames = next.map((file) => file.filename).filter(Boolean);
        setSampleNote(
          `Built from sample report${filenames.length === 1 ? "" : "s"}: ${filenames.join(", ")}`,
        );
      }
      return next;
    });
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a name for the new document type.");
      return;
    }
    const sections = commitSectionsFromEditor(
      rowOrder,
      localSettings,
      defaultLabels,
      defaultDescriptions,
    );
    if (sections.length === 0) {
      setError("Add at least one section before saving.");
      return;
    }

    const template: DocumentTypeTemplate = {
      id: generateDocumentTypeTemplateId(trimmedName),
      name: trimmedName,
      description: description.trim() || undefined,
      sections,
      createdAt: new Date().toISOString(),
      basedOn,
      builtFromSamples: builtFromSamples || undefined,
      sampleNote: builtFromSamples ? sampleNote : undefined,
      shared: shareWithTeam,
    };

    try {
      saveDocumentTypeTemplate(template);
      onSaved(template);
      if (shareWithTeam) {
        void (async () => {
          try {
            const token = await getToken();
            if (!token) {
              console.warn("Could not publish document type template: missing auth token");
              return;
            }
            const createdByName =
              user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "";
            await publishDocumentTypeTemplate(token, {
              name: template.name,
              description: template.description ?? "",
              sections: template.sections.map((section) => ({
                id: section.id,
                name: section.name,
                description: section.description ?? "",
                order: section.order,
              })),
              based_on: template.basedOn ?? "",
              created_by_name: createdByName,
            });
          } catch (publishErr) {
            console.warn("Could not publish document type template to community", publishErr);
          }
        })();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save template.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-title-md text-title-md text-primary">Create new document type</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Name it, choose a starting point, then save as a reusable template.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="font-label-sm text-label-sm text-secondary hover:underline shrink-0"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-error-container/20 text-error text-sm">{error}</div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="new-type-name" className="font-label-md text-label-md text-primary">
            Name
          </label>
          <input
            id="new-type-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Market Research Brief"
            className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary outline-none"
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="new-type-description"
            className="font-label-md text-label-md text-primary"
          >
            Description <span className="text-on-surface-variant font-normal">(optional)</span>
          </label>
          <input
            id="new-type-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short one-liner shown under the name"
            className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary outline-none"
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={shareWithTeam}
            onChange={(e) => setShareWithTeam(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-body-md text-body-md text-on-surface block">
              Share this document type with your team
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant block mt-1">
              Other signed-in users will be able to see and reuse it. Uncheck for anything
              confidential.
            </span>
          </span>
        </label>
      </div>

      {!started ? (
        <div className="space-y-4">
          <fieldset className="space-y-3">
            <legend className="font-label-md text-label-md text-primary">Starting point</legend>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="create-mode"
                checked={mode === "blank"}
                onChange={() => setMode("blank")}
              />
              <span className="font-body-md text-body-md text-on-surface">
                Start blank — add sections yourself
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="create-mode"
                checked={mode === "clone"}
                onChange={() => setMode("clone")}
              />
              <span className="font-body-md text-body-md text-on-surface">
                Clone from an existing type or template
              </span>
            </label>
          </fieldset>

          {mode === "clone" && (
            <div className="space-y-2">
              <label htmlFor="clone-source" className="font-label-md text-label-md text-primary">
                Clone from
              </label>
              <select
                id="clone-source"
                value={cloneSource}
                onChange={(e) => setCloneSource(e.target.value)}
                className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary outline-none"
              >
                {cloneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-outline-variant">
            <button
              type="button"
              onClick={handleStartConfiguring}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
            >
              Configure sections
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {basedOn && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">{basedOn}</p>
          )}

          <section className="space-y-3">
            <div>
              <h4 className="font-label-md text-label-md text-primary">
                Upload sample reports{" "}
                <span className="text-on-surface-variant font-normal">(optional)</span>
              </h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Upload 1+ PDF, DOCX, or PPTX examples to suggest sections. You can accept, edit, or
                reject each suggestion — nothing is applied automatically.
              </p>
            </div>

            <input
              ref={fileInputRef}
              id={fileInputId}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.pptx"
              multiple
              onChange={handleFileInputChange}
            />
            <div
              ref={dropzoneRef}
              role="button"
              tabIndex={uploading || suggesting ? -1 : 0}
              aria-disabled={uploading || suggesting}
              onClick={() => !uploading && !suggesting && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (uploading || suggesting) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border-2 border-dashed border-outline-variant rounded-xl p-6 flex flex-col items-center justify-center bg-surface-container-low transition-all group ${
                uploading || suggesting
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-primary/5 hover:border-primary cursor-pointer"
              }`}
            >
              <span
                className={`material-symbols-outlined text-primary text-4xl mb-3 transition-transform ${
                  uploading || suggesting ? "loading-spin" : "group-hover:scale-110"
                }`}
              >
                {uploading || suggesting ? "progress_activity" : "cloud_upload"}
              </span>
              <p className="font-title-md text-title-md text-on-surface mb-1">
                {uploading
                  ? "Parsing sample reports…"
                  : suggesting
                    ? "Suggesting sections…"
                    : "Drag files here or click to browse"}
              </p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Accepted formats: PDF, .docx, .pptx
              </p>
            </div>

            <UploadProgressPanel items={uploadQueue} />

            {(uploadError || suggestError) && (
              <div className="p-3 rounded-lg bg-error-container/20 text-error text-sm">
                {uploadError ?? suggestError}
              </div>
            )}

            {sampleFiles.length > 0 && (
              <ul className="space-y-2">
                {sampleFiles.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-outline-variant bg-surface"
                  >
                    <span className="material-symbols-outlined text-primary shrink-0">
                      {fileIcon(file.filename)}
                    </span>
                    <div className="flex-grow min-w-0">
                      <p className="font-body-md text-body-md truncate">{file.filename}</p>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {formatFileSize(file.sizeBytes)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSampleFile(file.id)}
                      className="font-label-sm text-label-sm text-secondary hover:underline shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {pendingSuggestions.length > 0 && (
            <section className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <h4 className="font-label-md text-label-md text-primary">Suggested sections</h4>
                  {styleNote && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      Style note: {styleNote}
                    </p>
                  )}
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Edit a suggestion, then accept it into your section list — or reject it.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRejectAllSuggestions}
                    className="px-3 py-1.5 rounded-lg border border-outline-variant font-label-sm text-label-sm text-on-surface"
                  >
                    Reject all
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptAllSuggestions}
                    className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-sm text-label-sm"
                  >
                    Accept all
                  </button>
                </div>
              </div>
              <ul className="space-y-3">
                {pendingSuggestions.map((suggestion) => (
                  <li
                    key={suggestion.localId}
                    className="space-y-2 p-3 rounded-lg border border-outline-variant bg-surface"
                  >
                    <input
                      type="text"
                      value={suggestion.name}
                      onChange={(e) =>
                        handlePatchSuggestion(suggestion.localId, { name: e.target.value })
                      }
                      aria-label="Suggested section name"
                      className="w-full bg-white border border-outline-variant rounded-lg p-2.5 font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary outline-none"
                    />
                    <textarea
                      value={suggestion.description}
                      onChange={(e) =>
                        handlePatchSuggestion(suggestion.localId, {
                          description: e.target.value,
                        })
                      }
                      rows={2}
                      aria-label="Suggested section description"
                      className="w-full bg-white border border-outline-variant rounded-lg p-2.5 font-body-sm text-body-sm text-on-surface focus:ring-2 focus:ring-secondary focus:border-secondary outline-none resize-y"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleRejectSuggestion(suggestion.localId)}
                        className="px-3 py-1.5 rounded-lg border border-outline-variant font-label-sm text-label-sm text-on-surface"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcceptSuggestion(suggestion.localId)}
                        disabled={!suggestion.name.trim()}
                        className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-sm text-label-sm disabled:opacity-50"
                      >
                        Accept
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <SectionListEditor
            fixedIds={fixedIds}
            rowOrder={rowOrder}
            localSettings={localSettings}
            warnOnRemoveIds={EMPTY_WARN_ON_REMOVE}
            defaultLabels={defaultLabels}
            defaultDescriptions={defaultDescriptions}
            onMove={(index, direction) => {
              const target = index + direction;
              if (target < 0 || target >= rowOrder.length) return;
              setRowOrder((prev) => {
                const next = [...prev];
                const [removed] = next.splice(index, 1);
                next.splice(target, 0, removed);
                return next;
              });
            }}
            onPatch={(id, patch) => setLocalSettings((prev) => patchSetting(prev, id, patch))}
            onToggleIncluded={(id, included) =>
              setLocalSettings((prev) => patchSetting(prev, id, { included }))
            }
            onDeleteCustom={(id) => {
              setRowOrder((prev) => prev.filter((rowId) => rowId !== id));
              setLocalSettings((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
              });
            }}
            onAdd={(id, setting) => {
              setLocalSettings((prev) => ({ ...prev, [id]: setting }));
              setRowOrder((prev) => [...prev, id]);
            }}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant">
            <button
              type="button"
              onClick={() => setStarted(false)}
              className="px-4 py-2.5 rounded-lg border border-outline-variant font-label-md text-label-md text-on-surface"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
            >
              Save as template
              <span className="material-symbols-outlined text-[20px]">save</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { getToken } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<SelectedType>({
    kind: "builtin",
    id: "PATENT_PROVISIONAL",
  });
  const [templates, setTemplates] = useState<DocumentTypeTemplate[]>(() =>
    listDocumentTypeTemplates(),
  );
  const [communityTemplates, setCommunityTemplates] = useState<
    CommunityDocumentTypeTemplate[]
  >([]);
  const [createSeed, setCreateSeed] = useState<CreateDocumentTypeSeed | null>(null);
  const [templatePendingDelete, setTemplatePendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const patent = usePatentWorkflow();
  const grant = useGrantWorkflow();
  const sow = useSowWorkflow();
  const ada = useAdaWorkflow();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const listed = await listCommunityDocumentTypeTemplates(token);
        if (!cancelled) {
          setCommunityTemplates(listed);
        }
      } catch {
        if (!cancelled) {
          setCommunityTemplates([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    const seed = (location.state as { createSeed?: CreateDocumentTypeSeed } | null)?.createSeed;
    if (!seed) return;
    setCreateSeed(seed);
    setSelectedType({ kind: "creating" });
    navigate(".", { replace: true, state: null });
  }, [location.state, navigate]);

  const sharedTeamTemplates = useMemo(
    () => communityTemplates.filter((template) => !template.mine),
    [communityTemplates],
  );

  // Picking a document type (including "Create new document type") swaps the
  // right-hand panel in place — no route change, so the browser never
  // scrolls anywhere. If the user had scrolled down (e.g. to "Shared by your
  // team"), the new panel would render off-screen above them. Bring it into
  // view every time the selection changes.
  const contentSectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    contentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedType]);

  const selectedBuiltin =
    selectedType.kind === "builtin"
      ? (DOCUMENT_TYPES.find((doc) => doc.id === selectedType.id) ?? DOCUMENT_TYPES[0])
      : null;
  const selectedTemplate =
    selectedType.kind === "custom"
      ? (templates.find((template) => template.id === selectedType.templateId) ?? null)
      : null;

  const panelProps: TypeSectionsPanelProps | null = (() => {
    if (selectedType.kind !== "builtin") return null;
    switch (selectedType.id) {
      case "PATENT_PROVISIONAL":
        return {
          typeId: selectedType.id,
          typeTitle: selectedBuiltin?.title ?? "Patent Draft",
          fixedIds: PATENT_SECTION_IDS,
          defaultLabels: SECTION_LABELS,
          warnOnRemoveIds: PATENT_WARN_ON_REMOVE,
          sectionSettings: patent.sectionSettings,
          setSectionSettings: patent.setSectionSettings,
          hasProgress:
            !patent.workflowResetting && workflowHasProgress(patent.getWorkflowSnapshot()),
          resumePath: getResumePath(patent.getWorkflowSnapshot()),
          entryPath: "/patent",
          saveNamedDraft: patent.saveNamedDraft,
          clearWorkflow: patent.clearWorkflow,
        };
      case "GRANT_APPLICATION":
        return {
          typeId: selectedType.id,
          typeTitle: selectedBuiltin?.title ?? "Grant Application",
          fixedIds: GRANT_SECTION_IDS,
          defaultLabels: GRANT_SECTION_LABELS,
          warnOnRemoveIds: EMPTY_WARN_ON_REMOVE,
          sectionSettings: grant.sectionSettings,
          setSectionSettings: grant.setSectionSettings,
          hasProgress:
            !grant.workflowResetting && grantWorkflowHasProgress(grant.getWorkflowSnapshot()),
          resumePath: getGrantResumePath(grant.getWorkflowSnapshot()),
          entryPath: GRANT_STEP_PATHS.input,
          saveNamedDraft: grant.saveNamedDraft,
          clearWorkflow: grant.clearWorkflow,
        };
      case "SOW_CONTRACT":
        return {
          typeId: selectedType.id,
          typeTitle: selectedBuiltin?.title ?? "SOW Contract",
          fixedIds: SOW_SECTION_IDS,
          defaultLabels: SOW_SECTION_LABELS,
          warnOnRemoveIds: EMPTY_WARN_ON_REMOVE,
          sectionSettings: sow.sectionSettings,
          setSectionSettings: sow.setSectionSettings,
          hasProgress:
            !sow.workflowResetting && sowWorkflowHasProgress(sow.getWorkflowSnapshot()),
          resumePath: getSowResumePath(sow.getWorkflowSnapshot()),
          entryPath: SOW_STEP_PATHS.input,
          saveNamedDraft: sow.saveNamedDraft,
          clearWorkflow: sow.clearWorkflow,
        };
      case "ADA_BIOANALYTICAL_REPORT":
        return {
          typeId: selectedType.id,
          typeTitle: selectedBuiltin?.title ?? "ADA Bioanalytical Report",
          fixedIds: ADA_SECTION_IDS,
          defaultLabels: ADA_SECTION_LABELS,
          warnOnRemoveIds: EMPTY_WARN_ON_REMOVE,
          sectionSettings: ada.sectionSettings,
          setSectionSettings: ada.setSectionSettings,
          hasProgress:
            !ada.workflowResetting && adaWorkflowHasProgress(ada.getWorkflowSnapshot()),
          resumePath: getAdaResumePath(ada.getWorkflowSnapshot()),
          entryPath: ADA_STEP_PATHS.input,
          saveNamedDraft: ada.saveNamedDraft,
          clearWorkflow: ada.clearWorkflow,
        };
    }
  })();

  const handleTemplateSaved = (template: DocumentTypeTemplate) => {
    setCreateSeed(null);
    setTemplates(listDocumentTypeTemplates());
    setSelectedType({ kind: "custom", templateId: template.id });
  };

  const handleConfirmDeleteTemplate = () => {
    if (!templatePendingDelete) return;
    const { id } = templatePendingDelete;
    deleteDocumentTypeTemplate(id);
    setTemplates(listDocumentTypeTemplates());
    setTemplatePendingDelete(null);
    if (selectedType.kind === "custom" && selectedType.templateId === id) {
      setSelectedType({ kind: "builtin", id: "PATENT_PROVISIONAL" });
    }
  };

  return (
    <AppShell
      step="input"
      showStepNav={false}
      mainClassName="max-w-6xl mx-auto px-margin-desktop py-12"
    >
      <div className="space-y-8">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-3">Report Drafter</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl">
            Pick a document type and configure the sections you&apos;ll draft.
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-8 md:gap-10 items-start">
          <aside className="w-full md:w-80 shrink-0 space-y-3">
            <h2 className="font-title-md text-title-md text-primary">Pick a document type.</h2>
            <div className="flex flex-col gap-3">
              {DOCUMENT_TYPES.map((doc) => {
                const selected =
                  selectedType.kind === "builtin" && selectedType.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedType({ kind: "builtin", id: doc.id })}
                    aria-pressed={selected}
                    data-testid={`builtin-type-card-${doc.id}`}
                    className={`p-5 rounded-xl border text-left transition-all ${
                      selected
                        ? "border-2 border-primary bg-primary/5 shadow-sm"
                        : "border border-outline-variant bg-surface-container-lowest hover:border-primary/40"
                    }`}
                  >
                    <span className="material-symbols-outlined text-primary text-3xl mb-3 block">
                      description
                    </span>
                    <h3 className="font-title-md text-title-md text-primary mb-1">{doc.title}</h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">{doc.steps}</p>
                  </button>
                );
              })}

              {templates.map((template) => {
                const selected =
                  selectedType.kind === "custom" &&
                  selectedType.templateId === template.id;
                return (
                  <div key={template.id} className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedType({ kind: "custom", templateId: template.id })
                      }
                      aria-pressed={selected}
                      data-testid={`custom-template-card-${template.id}`}
                      className={`w-full p-5 pr-12 rounded-xl border text-left transition-all ${
                        selected
                          ? "border-2 border-primary bg-primary/5 shadow-sm"
                          : "border border-outline-variant bg-surface-container-lowest hover:border-primary/40"
                      }`}
                    >
                      <span className="material-symbols-outlined text-primary text-3xl mb-3 block">
                        note_add
                      </span>
                      <h3 className="font-title-md text-title-md text-primary mb-1">
                        {template.name}
                      </h3>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {template.description?.trim() ||
                          "4 steps: Input → Review → Draft → Export"}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${template.name}`}
                      title="Delete template"
                      data-testid={`delete-template-${template.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        event.preventDefault();
                        setTemplatePendingDelete({
                          id: template.id,
                          name: template.name,
                        });
                      }}
                      className="absolute top-3 right-3 z-10 p-1.5 rounded hover:bg-error-container/30 text-on-surface-variant hover:text-error"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                );
              })}

              {templatePendingDelete && (
                <div
                  className="p-4 rounded-lg border border-error/30 bg-error-container/10 space-y-3"
                  role="alertdialog"
                  aria-labelledby="delete-template-confirm-title"
                  data-testid="delete-template-confirm"
                >
                  <p
                    id="delete-template-confirm-title"
                    className="font-body-sm text-body-sm text-on-surface"
                  >
                    Are you sure you want to delete &apos;{templatePendingDelete.name}
                    &apos;? This can&apos;t be undone.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmDeleteTemplate}
                      className="px-4 py-2 rounded-lg bg-error text-on-error font-label-md text-label-md hover:bg-error/90 transition-all active:scale-95"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplatePendingDelete(null)}
                      className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setCreateSeed(null);
                  setSelectedType({ kind: "creating" });
                }}
                aria-pressed={selectedType.kind === "creating" && !createSeed}
                className={`p-5 rounded-xl border text-left transition-all border-dashed ${
                  selectedType.kind === "creating" && !createSeed
                    ? "border-2 border-primary bg-primary/5 shadow-sm"
                    : "border border-outline-variant bg-surface-container-lowest hover:border-primary/40"
                }`}
              >
                <span className="material-symbols-outlined text-primary text-3xl mb-3 block">
                  add_circle
                </span>
                <h3 className="font-title-md text-title-md text-primary mb-1">
                  Create new document type
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Start blank or clone an existing type
                </p>
              </button>

              <Link
                to="/shared-document-types"
                data-testid="browse-shared-document-types"
                className="p-5 rounded-xl border border-outline-variant bg-surface-container-lowest hover:border-primary/40 text-left transition-all flex flex-col"
              >
                <span className="material-symbols-outlined text-primary text-3xl mb-3 block">
                  group
                </span>
                <h3 className="font-title-md text-title-md text-primary mb-1 flex items-center gap-2 flex-wrap">
                  Browse shared document types
                  {sharedTeamTemplates.length > 0 && (
                    <span className="inline-flex items-center justify-center min-w-6 h-6 px-1.5 rounded-md bg-primary/10 text-primary font-label-sm text-label-sm">
                      {sharedTeamTemplates.length}
                    </span>
                  )}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Preview and reuse templates shared by your team
                </p>
              </Link>
            </div>
          </aside>

          <section ref={contentSectionRef} className="flex-1 min-w-0 space-y-4 w-full">
            <h2 className="font-title-md text-title-md text-primary">
              {selectedType.kind === "creating" ? "Create template." : "Configure sections."}
            </h2>
            {selectedType.kind === "creating" ? (
              <CreateDocumentTypePanel
                key={
                  createSeed
                    ? `seed-${createSeed.name}-${createSeed.basedOn}-${createSeed.sections
                        .map((section) => section.id)
                        .join("-")}`
                    : "create-blank"
                }
                templates={templates}
                initialSeed={createSeed}
                onSaved={handleTemplateSaved}
                onCancel={() => {
                  setCreateSeed(null);
                  setSelectedType({ kind: "builtin", id: "PATENT_PROVISIONAL" });
                }}
              />
            ) : selectedType.kind === "custom" && selectedTemplate ? (
              <CustomTypeSectionsPanel
                key={selectedTemplate.id}
                template={selectedTemplate}
              />
            ) : panelProps ? (
              <TypeSectionsPanel key={panelProps.typeId} {...panelProps} />
            ) : (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Select a document type to continue.
              </p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
