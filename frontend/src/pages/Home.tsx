import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { SectionListEditor } from "../components/SectionListEditor";
import { getDocumentTypeConfig } from "../constants/documentTypes";
import { useAdaWorkflow } from "../context/AdaWorkflowContext";
import { useGrantWorkflow } from "../context/GrantWorkflowContext";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useSowWorkflow } from "../context/SowWorkflowContext";
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
import { getResumePath, workflowHasProgress } from "../utils/draftStorage";
import {
  type CustomSectionDef,
  type DocumentTypeTemplate,
  generateDocumentTypeTemplateId,
  listDocumentTypeTemplates,
  saveDocumentTypeTemplate,
} from "../utils/documentTypeTemplates";
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
  orderAllSectionIds,
  resolveSectionDescription,
  resolveSectionLabel,
  seedSectionSettings,
  type SectionSetting,
  type SectionSettingsMap,
} from "../utils/sectionSettings";
import { getSowResumePath, sowWorkflowHasProgress, SOW_STEP_PATHS } from "../utils/sowStorage";
import "../styles/patent-drafter.css";

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
  onSaved: (template: DocumentTypeTemplate) => void;
  onCancel: () => void;
}

function CreateDocumentTypePanel({
  templates,
  onSaved,
  onCancel,
}: CreateDocumentTypePanelProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<CreateMode>("blank");
  const [cloneSource, setCloneSource] = useState<string>("builtin:SOW_CONTRACT");
  const [basedOn, setBasedOn] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const [fixedIds, setFixedIds] = useState<string[]>([]);
  const [defaultLabels, setDefaultLabels] = useState<Record<string, string>>({});
  const [defaultDescriptions, setDefaultDescriptions] = useState<Record<string, string>>({});
  const [localSettings, setLocalSettings] = useState<SectionSettingsMap>({});
  const [rowOrder, setRowOrder] = useState<string[]>([]);

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
    };

    try {
      saveDocumentTypeTemplate(template);
      onSaved(template);
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
  const [selectedType, setSelectedType] = useState<SelectedType>({
    kind: "builtin",
    id: "PATENT_PROVISIONAL",
  });
  const [templates, setTemplates] = useState<DocumentTypeTemplate[]>(() =>
    listDocumentTypeTemplates(),
  );

  const patent = usePatentWorkflow();
  const grant = useGrantWorkflow();
  const sow = useSowWorkflow();
  const ada = useAdaWorkflow();

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
    setTemplates(listDocumentTypeTemplates());
    setSelectedType({ kind: "custom", templateId: template.id });
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
                  <button
                    key={template.id}
                    type="button"
                    onClick={() =>
                      setSelectedType({ kind: "custom", templateId: template.id })
                    }
                    aria-pressed={selected}
                    className={`p-5 rounded-xl border text-left transition-all ${
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
                );
              })}

              <button
                type="button"
                onClick={() => setSelectedType({ kind: "creating" })}
                aria-pressed={selectedType.kind === "creating"}
                className={`p-5 rounded-xl border text-left transition-all border-dashed ${
                  selectedType.kind === "creating"
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
            </div>
          </aside>

          <section className="flex-1 min-w-0 space-y-4 w-full">
            <h2 className="font-title-md text-title-md text-primary">
              {selectedType.kind === "creating" ? "Create template." : "Configure sections."}
            </h2>
            {selectedType.kind === "creating" ? (
              <CreateDocumentTypePanel
                templates={templates}
                onSaved={handleTemplateSaved}
                onCancel={() =>
                  setSelectedType({ kind: "builtin", id: "PATENT_PROVISIONAL" })
                }
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
