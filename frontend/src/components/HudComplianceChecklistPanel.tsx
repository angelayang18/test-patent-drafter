import { useId, useMemo, useState } from "react";
import {
  HUD_CHECKLIST_TOTAL_ITEMS,
  HUD_COMPLIANCE_SECTIONS,
} from "../constants/hudComplianceChecklist";

export function HudComplianceChecklistPanel() {
  const idPrefix = useId();
  const [expanded, setExpanded] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const checkedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked],
  );

  const toggleItem = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <section className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant shadow-sm bento-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-start gap-3 w-full text-left"
        aria-expanded={expanded}
      >
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <span className="material-symbols-outlined text-primary">checklist</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-headline-md text-headline-md text-primary">
            HUD AI Compliance Checklist
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 italic">
            Required for all HUD contracts above the micro-purchase threshold.
          </p>
        </div>
        <span className="material-symbols-outlined text-on-surface-variant shrink-0 mt-1">
          {expanded ? "expand_less" : "expand_more"}
        </span>
      </button>

      {expanded && (
        <div className="mt-6 space-y-6">
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            {checkedCount} / {HUD_CHECKLIST_TOTAL_ITEMS} complete
          </p>

          {HUD_COMPLIANCE_SECTIONS.map((section) => (
            <div key={section.code}>
              <h3 className="font-label-md text-label-md text-on-surface mb-3">
                {section.code} – {section.title}
              </h3>
              <ul className="space-y-2">
                {section.items.map((item) => {
                  const checkboxId = `${idPrefix}-${item.id}`;
                  return (
                    <li key={item.id}>
                      <label
                        htmlFor={checkboxId}
                        className="flex items-start gap-3 cursor-pointer group"
                      >
                        <input
                          id={checkboxId}
                          type="checkbox"
                          checked={Boolean(checked[item.id])}
                          onChange={() => toggleItem(item.id)}
                          className="mt-0.5 h-4 w-4 rounded border-outline-variant text-secondary focus:ring-secondary/40 shrink-0"
                        />
                        <span className="font-body-sm text-body-sm text-on-surface-variant group-hover:text-on-surface transition-colors">
                          {item.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
