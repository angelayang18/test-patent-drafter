import { useEffect, useState } from "react";
import { fileIcon, formatFileSize } from "../utils/format";

export type UploadFileStatus = "pending" | "parsing" | "done" | "error";

export interface UploadQueueItem {
  id: string;
  filename: string;
  sizeBytes: number;
  status: UploadFileStatus;
  error?: string;
}

interface UploadProgressPanelProps {
  items: UploadQueueItem[];
}

function statusLabel(status: UploadFileStatus): string {
  switch (status) {
    case "pending":
      return "Waiting";
    case "parsing":
      return "Parsing…";
    case "done":
      return "Done";
    case "error":
      return "Failed";
  }
}

export function UploadProgressPanel({ items }: UploadProgressPanelProps) {
  const [elapsed, setElapsed] = useState(0);

  const total = items.length;
  const doneCount = items.filter((i) => i.status === "done" || i.status === "error").length;
  const parsingItems = items.filter((i) => i.status === "parsing");
  const allParsing = parsingItems.length === total && total > 0;
  const hasActive = items.some((i) => i.status === "pending" || i.status === "parsing");

  const progressPercent =
    total === 0
      ? 0
      : allParsing
        ? 15
        : Math.round(((doneCount + (parsingItems.length > 0 ? 0.5 : 0)) / total) * 100);

  useEffect(() => {
    if (!hasActive) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasActive]);

  if (items.length === 0) return null;

  return (
    <div
      className="mt-6 rounded-lg border border-outline-variant bg-surface-container-low p-4 space-y-4"
      role="status"
      aria-live="polite"
      aria-busy={hasActive}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {hasActive && (
            <span className="material-symbols-outlined text-primary loading-spin shrink-0">
              progress_activity
            </span>
          )}
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface">
              {hasActive
                ? allParsing
                  ? `Parsing ${total} document${total === 1 ? "" : "s"} in one batch…`
                  : `Parsing documents (${doneCount} of ${total} complete)`
                : `Finished parsing ${doneCount} of ${total} file${total === 1 ? "" : "s"}`}
            </p>
            {parsingItems.length === 1 && (
              <p className="font-body-sm text-body-sm text-secondary truncate mt-0.5">
                Currently parsing: {parsingItems[0].filename}
              </p>
            )}
            {parsingItems.length > 1 && allParsing && (
              <p className="font-body-sm text-body-sm text-secondary mt-0.5">
                Server is parsing files in parallel.
              </p>
            )}
          </div>
        </div>
        {hasActive && (
          <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums shrink-0">
            {elapsed}s
          </span>
        )}
      </div>

      <div className="h-2 w-full rounded-full bg-outline-variant/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-secondary transition-all duration-300 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              item.status === "parsing"
                ? "border-secondary bg-secondary/5"
                : item.status === "error"
                  ? "border-error/40 bg-error-container/10"
                  : "border-outline-variant bg-surface"
            }`}
          >
            <span className="material-symbols-outlined text-primary shrink-0">
              {fileIcon(item.filename)}
            </span>
            <div className="flex-grow min-w-0">
              <p className="font-body-md text-body-md font-medium truncate">{item.filename}</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {formatFileSize(item.sizeBytes)}
                {item.error ? ` · ${item.error}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-label-sm text-label-sm text-on-surface-variant hidden sm:inline">
                {statusLabel(item.status)}
              </span>
              {item.status === "pending" && (
                <span className="material-symbols-outlined text-outline text-[20px]">
                  schedule
                </span>
              )}
              {item.status === "parsing" && (
                <span className="material-symbols-outlined text-secondary loading-spin text-[20px]">
                  progress_activity
                </span>
              )}
              {item.status === "done" && (
                <span
                  className="material-symbols-outlined text-green-600 text-[20px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              )}
              {item.status === "error" && (
                <span className="material-symbols-outlined text-error text-[20px]">error</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
