import { DOCUMENT_SECTION_ORDER, sectionDisplayTitle } from "../utils/documentPreview";
import type { QAReportEntry } from "../services/api";

interface QAReportPanelProps {
  report: QAReportEntry[];
}

function statusIndicator(status: string): {
  icon: string;
  iconClass: string;
  rowClass: string;
  label: string;
} {
  switch (status) {
    case "pass":
      return {
        icon: "check_circle",
        iconClass: "text-green-600",
        rowClass: "border-outline-variant bg-surface",
        label: "Pass",
      };
    case "warn":
      return {
        icon: "warning",
        iconClass: "text-amber-600",
        rowClass: "border-amber-500/40 bg-amber-500/5",
        label: "Warning",
      };
    case "fail":
      return {
        icon: "error",
        iconClass: "text-error",
        rowClass: "border-error/40 bg-error-container/10",
        label: "Fail",
      };
    default:
      return {
        icon: "help",
        iconClass: "text-on-surface-variant",
        rowClass: "border-outline-variant bg-surface",
        label: status,
      };
  }
}

function sortReport(report: QAReportEntry[]): QAReportEntry[] {
  const order = [...DOCUMENT_SECTION_ORDER];
  return [...report].sort((a, b) => {
    const indexA = order.indexOf(a.section as (typeof DOCUMENT_SECTION_ORDER)[number]);
    const indexB = order.indexOf(b.section as (typeof DOCUMENT_SECTION_ORDER)[number]);
    if (indexA === -1 && indexB === -1) {
      return a.section.localeCompare(b.section);
    }
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  });
}

export function QAReportPanel({ report }: QAReportPanelProps) {
  if (report.length === 0) {
    return null;
  }

  const sorted = sortReport(report);

  return (
    <section className="p-10 border-b border-outline-variant">
      <div className="flex items-start gap-3 mb-4">
        <span className="material-symbols-outlined text-secondary text-[24px] shrink-0">
          fact_check
        </span>
        <div>
          <h2 className="font-title-lg text-title-lg text-primary mb-1">Format QA checklist</h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Automated checks for empty sections, claim numbering, and abstract length before export.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {sorted.map((entry) => {
          const indicator = statusIndicator(entry.status);
          return (
            <li
              key={entry.section}
              className={`flex items-start gap-3 p-3 rounded-lg border ${indicator.rowClass}`}
            >
              <span
                className={`material-symbols-outlined shrink-0 mt-0.5 ${indicator.iconClass}`}
                style={entry.status === "pass" ? { fontVariationSettings: "'FILL' 1" } : undefined}
                aria-hidden
              >
                {indicator.icon}
              </span>
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-body-md text-body-md font-medium text-on-surface">
                    {sectionDisplayTitle(entry.section)}
                  </p>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {indicator.label}
                  </span>
                </div>
                {entry.messages.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {entry.messages.map((message, messageIndex) => (
                      <li
                        key={`${entry.section}-${messageIndex}`}
                        className="font-body-sm text-body-sm text-on-surface-variant"
                      >
                        {message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
