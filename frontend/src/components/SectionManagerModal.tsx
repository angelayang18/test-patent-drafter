import { useEffect, useState } from "react";
import { SectionListEditor } from "./SectionListEditor";
import {
  commitSectionSettings,
  effectiveSectionIds,
  orderAllSectionIds,
  seedSectionSettings,
  type SectionSetting,
  type SectionSettingsMap,
} from "../utils/sectionSettings";

export interface SectionManagerModalProps {
  open: boolean;
  onClose: () => void;
  /** Full fixed section id set in original canonical order. */
  sectionIds: readonly string[];
  defaultLabels: Record<string, string>;
  defaultDescriptions: Record<string, string>;
  /** Structurally expected ids — unchecking shows a confirm warning. */
  warnOnRemoveIds: Set<string>;
  settings: SectionSettingsMap;
  onSave: (settings: SectionSettingsMap) => void;
  /** When true, show per-section "Needs figure" checkboxes (non-patent types). */
  supportsFigureSections?: boolean;
}

function patchSetting(
  prev: SectionSettingsMap,
  id: string,
  patch: Partial<SectionSetting>,
): SectionSettingsMap {
  const current = prev[id] ?? { order: 0, included: true };
  return { ...prev, [id]: { ...current, ...patch } };
}

export function SectionManagerModal({
  open,
  onClose,
  sectionIds,
  defaultLabels,
  defaultDescriptions,
  warnOnRemoveIds,
  settings,
  onSave,
  supportsFigureSections = false,
}: SectionManagerModalProps) {
  const allIds = effectiveSectionIds(sectionIds, settings);
  const [localSettings, setLocalSettings] = useState<SectionSettingsMap>(() =>
    seedSectionSettings(sectionIds, settings),
  );
  const [rowOrder, setRowOrder] = useState<string[]>(() =>
    orderAllSectionIds(allIds, seedSectionSettings(sectionIds, settings)),
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const seeded = seedSectionSettings(sectionIds, settings);
    const ids = effectiveSectionIds(sectionIds, settings);
    setLocalSettings(seeded);
    setRowOrder(orderAllSectionIds(ids, seeded));
  }, [open, sectionIds, settings]);

  if (!open) {
    return null;
  }

  const moveRow = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rowOrder.length) {
      return;
    }
    setRowOrder((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      next.splice(target, 0, removed);
      return next;
    });
  };

  const handleSave = () => {
    onSave(commitSectionSettings(rowOrder, localSettings));
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
      role="presentation"
      onClick={handleCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="section-manager-title"
        className="bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant w-full max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-outline-variant">
          <div>
            <h2
              id="section-manager-title"
              className="font-headline-md text-headline-md text-primary"
            >
              Manage sections
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Reorder, rename, remove, or add sections for this draft.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={handleCancel}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <SectionListEditor
            fixedIds={sectionIds}
            rowOrder={rowOrder}
            localSettings={localSettings}
            warnOnRemoveIds={warnOnRemoveIds}
            defaultLabels={defaultLabels}
            defaultDescriptions={defaultDescriptions}
            supportsFigureSections={supportsFigureSections}
            onMove={moveRow}
            onPatch={(id, patch) =>
              setLocalSettings((prev) => patchSetting(prev, id, patch))
            }
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

          <div className="pt-2 border-t border-outline-variant flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
