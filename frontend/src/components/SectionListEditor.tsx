import { useState, type FormEvent } from "react";
import {
  generateCustomSectionId,
  type SectionSetting,
  type SectionSettingsMap,
} from "../utils/sectionSettings";

const CLAIMS_REMOVE_WARNING =
  "Claims are a core part of a US provisional patent filing — remove anyway?";

export interface SectionListEditorProps {
  fixedIds: readonly string[];
  rowOrder: string[];
  localSettings: SectionSettingsMap;
  warnOnRemoveIds: Set<string>;
  defaultLabels: Record<string, string>;
  defaultDescriptions: Record<string, string>;
  onMove: (index: number, direction: -1 | 1) => void;
  onPatch: (id: string, patch: Partial<SectionSetting>) => void;
  onToggleIncluded: (id: string, included: boolean) => void;
  onDeleteCustom: (id: string) => void;
  onAdd: (id: string, setting: SectionSetting) => void;
}

export function SectionListEditor({
  fixedIds,
  rowOrder,
  localSettings,
  warnOnRemoveIds,
  defaultLabels,
  defaultDescriptions,
  onMove,
  onPatch,
  onToggleIncluded,
  onDeleteCustom,
  onAdd,
}: SectionListEditorProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const handleToggleIncluded = (id: string, nextIncluded: boolean) => {
    if (!nextIncluded && warnOnRemoveIds.has(id)) {
      const label = defaultLabels[id] ?? id;
      const message =
        id === "claims"
          ? CLAIMS_REMOVE_WARNING
          : `"${label}" is a structurally expected section — remove anyway?`;
      if (!window.confirm(message)) {
        return;
      }
    }
    onToggleIncluded(id, nextIncluded);
  };

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) {
      return;
    }
    const id = generateCustomSectionId(name, rowOrder);
    const description = newDescription.trim();
    onAdd(id, {
      order: rowOrder.length,
      included: true,
      name,
      ...(description ? { description } : {}),
    });
    setNewName("");
    setNewDescription("");
    setAdding(false);
  };

  return (
    <div className="space-y-6">
      <ul className="space-y-4">
        {rowOrder.map((id, index) => {
          const isCustom = !fixedIds.includes(id);
          const included = localSettings[id]?.included !== false;
          const nameValue = localSettings[id]?.name ?? "";
          const descriptionValue = localSettings[id]?.description ?? "";
          const displayLabel = defaultLabels[id] ?? (nameValue || id);

          return (
            <li
              key={id}
              className="rounded-lg border border-outline-variant bg-surface p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 shrink-0 pt-1">
                  <button
                    type="button"
                    aria-label={`Move ${displayLabel} up`}
                    disabled={index === 0}
                    onClick={() => onMove(index, -1)}
                    className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      keyboard_arrow_up
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${displayLabel} down`}
                    disabled={index === rowOrder.length - 1}
                    onClick={() => onMove(index, 1)}
                    className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      keyboard_arrow_down
                    </span>
                  </button>
                </div>

                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface">
                      <input
                        type="checkbox"
                        checked={included}
                        title="Include in this draft"
                        onChange={(e) => handleToggleIncluded(id, e.target.checked)}
                        className="rounded border-outline-variant"
                      />
                      Include in this draft
                    </label>
                    {isCustom && (
                      <button
                        type="button"
                        aria-label={`Delete ${displayLabel}`}
                        onClick={() => onDeleteCustom(id)}
                        className="p-1.5 rounded hover:bg-error-container/30 text-on-surface-variant hover:text-error"
                        title="Delete custom section"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor={`section-name-${id}`}
                      className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1"
                    >
                      Display name
                    </label>
                    <input
                      id={`section-name-${id}`}
                      type="text"
                      value={nameValue}
                      placeholder={defaultLabels[id] ?? id}
                      onChange={(e) => {
                        const value = e.target.value;
                        onPatch(id, {
                          name: value.length > 0 ? value : undefined,
                        });
                      }}
                      className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-sm text-body-sm focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`section-description-${id}`}
                      className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1"
                    >
                      Description
                    </label>
                    <textarea
                      id={`section-description-${id}`}
                      value={descriptionValue}
                      placeholder={defaultDescriptions[id] ?? ""}
                      rows={2}
                      onChange={(e) => {
                        const value = e.target.value;
                        onPatch(id, {
                          description: value.length > 0 ? value : undefined,
                        });
                      }}
                      className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-sm text-body-sm focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none resize-y"
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="pt-2 border-t border-outline-variant space-y-3">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add section
          </button>
        ) : (
          <form
            onSubmit={handleAddSubmit}
            className="rounded-lg border border-outline-variant bg-surface p-4 space-y-3"
          >
            <p className="font-label-md text-label-md text-on-surface">New section</p>
            <div>
              <label
                htmlFor="new-section-name"
                className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1"
              >
                Display name
              </label>
              <input
                id="new-section-name"
                type="text"
                value={newName}
                required
                autoFocus
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-sm text-body-sm focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="new-section-description"
                className="block font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider mb-1"
              >
                Description
              </label>
              <textarea
                id="new-section-description"
                value={newDescription}
                rows={2}
                placeholder="Optional drafting instructions for this section"
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full bg-white border border-outline-variant rounded-lg p-3 font-body-sm text-body-sm focus:ring-2 focus:ring-secondary/20 focus:border-secondary outline-none resize-y"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setNewDescription("");
                }}
                className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container transition-all active:scale-95"
              >
                Add
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
