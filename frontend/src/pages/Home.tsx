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
import { getGrantResumePath, grantWorkflowHasProgress, GRANT_STEP_PATHS } from "../utils/grantStorage";
import {
  commitSectionSettings,
  effectiveSectionIds,
  orderAllSectionIds,
  seedSectionSettings,
  type SectionSetting,
  type SectionSettingsMap,
} from "../utils/sectionSettings";
import { getSowResumePath, sowWorkflowHasProgress, SOW_STEP_PATHS } from "../utils/sowStorage";
import "../styles/patent-drafter.css";

type DocumentTypeId =
  | "PATENT_PROVISIONAL"
  | "GRANT_APPLICATION"
  | "SOW_CONTRACT"
  | "ADA_BIOANALYTICAL_REPORT";

const DOCUMENT_TYPES: {
  id: DocumentTypeId;
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

function patchSetting(
  prev: SectionSettingsMap,
  id: string,
  patch: Partial<SectionSetting>,
): SectionSettingsMap {
  const current = prev[id] ?? { order: 0, included: true };
  return { ...prev, [id]: { ...current, ...patch } };
}

interface TypeSectionsPanelProps {
  typeId: DocumentTypeId;
  typeTitle: string;
  fixedIds: readonly string[];
  defaultLabels: Record<string, string>;
  warnOnRemoveIds: Set<string>;
  sectionSettings: SectionSettingsMap;
  setSectionSettings: (next: SectionSettingsMap) => void;
  hasProgress: boolean;
  resumePath: string;
  entryPath: string;
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

  if (hasProgress) {
    return (
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 space-y-4">
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
      </div>
    );
  }

  const handleContinue = () => {
    setSectionSettings(commitSectionSettings(rowOrder, localSettings));
    navigate(entryPath);
  };

  return (
    <div className="space-y-6">
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
          Continue
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedType, setSelectedType] = useState<DocumentTypeId>("PATENT_PROVISIONAL");

  const patent = usePatentWorkflow();
  const grant = useGrantWorkflow();
  const sow = useSowWorkflow();
  const ada = useAdaWorkflow();

  const selectedDoc = DOCUMENT_TYPES.find((doc) => doc.id === selectedType) ?? DOCUMENT_TYPES[0];

  const panelProps: TypeSectionsPanelProps = (() => {
    switch (selectedType) {
      case "PATENT_PROVISIONAL":
        return {
          typeId: selectedType,
          typeTitle: selectedDoc.title,
          fixedIds: PATENT_SECTION_IDS,
          defaultLabels: SECTION_LABELS,
          warnOnRemoveIds: PATENT_WARN_ON_REMOVE,
          sectionSettings: patent.sectionSettings,
          setSectionSettings: patent.setSectionSettings,
          hasProgress:
            !patent.workflowResetting && workflowHasProgress(patent.getWorkflowSnapshot()),
          resumePath: getResumePath(patent.getWorkflowSnapshot()),
          entryPath: "/patent",
        };
      case "GRANT_APPLICATION":
        return {
          typeId: selectedType,
          typeTitle: selectedDoc.title,
          fixedIds: GRANT_SECTION_IDS,
          defaultLabels: GRANT_SECTION_LABELS,
          warnOnRemoveIds: EMPTY_WARN_ON_REMOVE,
          sectionSettings: grant.sectionSettings,
          setSectionSettings: grant.setSectionSettings,
          hasProgress:
            !grant.workflowResetting && grantWorkflowHasProgress(grant.getWorkflowSnapshot()),
          resumePath: getGrantResumePath(grant.getWorkflowSnapshot()),
          entryPath: GRANT_STEP_PATHS.input,
        };
      case "SOW_CONTRACT":
        return {
          typeId: selectedType,
          typeTitle: selectedDoc.title,
          fixedIds: SOW_SECTION_IDS,
          defaultLabels: SOW_SECTION_LABELS,
          warnOnRemoveIds: EMPTY_WARN_ON_REMOVE,
          sectionSettings: sow.sectionSettings,
          setSectionSettings: sow.setSectionSettings,
          hasProgress:
            !sow.workflowResetting && sowWorkflowHasProgress(sow.getWorkflowSnapshot()),
          resumePath: getSowResumePath(sow.getWorkflowSnapshot()),
          entryPath: SOW_STEP_PATHS.input,
        };
      case "ADA_BIOANALYTICAL_REPORT":
        return {
          typeId: selectedType,
          typeTitle: selectedDoc.title,
          fixedIds: ADA_SECTION_IDS,
          defaultLabels: ADA_SECTION_LABELS,
          warnOnRemoveIds: EMPTY_WARN_ON_REMOVE,
          sectionSettings: ada.sectionSettings,
          setSectionSettings: ada.setSectionSettings,
          hasProgress:
            !ada.workflowResetting && adaWorkflowHasProgress(ada.getWorkflowSnapshot()),
          resumePath: getAdaResumePath(ada.getWorkflowSnapshot()),
          entryPath: ADA_STEP_PATHS.input,
        };
    }
  })();

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
                const selected = doc.id === selectedType;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedType(doc.id)}
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
            </div>
          </aside>

          <section className="flex-1 min-w-0 space-y-4 w-full">
            <h2 className="font-title-md text-title-md text-primary">Configure sections.</h2>
            <TypeSectionsPanel key={selectedType} {...panelProps} />
          </section>
        </div>
      </div>
    </AppShell>
  );
}
