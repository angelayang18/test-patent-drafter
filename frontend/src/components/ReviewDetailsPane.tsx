import type { ReactNode } from "react";

/**
 * Right-pane chrome for Review pages: title, description, Regenerate all,
 * and a scrollable body for field editors.
 */
export function ReviewDetailsPane({
  title,
  description,
  onRegenerateAll,
  regeneratingAll,
  isBusy,
  children,
}: {
  title: string;
  description: string;
  onRegenerateAll: () => void;
  regeneratingAll: boolean;
  isBusy: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <div className="p-8 border-b border-outline-variant flex justify-between items-start gap-4 shrink-0">
        <div>
          <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
            {title}
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{description}</p>
        </div>
        <button
          type="button"
          onClick={onRegenerateAll}
          disabled={isBusy}
          className="px-4 py-2 bg-secondary/10 text-secondary rounded-lg font-label-md text-label-md hover:bg-secondary/20 disabled:opacity-50 flex items-center gap-2 shrink-0"
        >
          <span
            className={`material-symbols-outlined text-sm ${regeneratingAll ? "loading-spin" : ""}`}
          >
            autorenew
          </span>
          Regenerate all
        </button>
      </div>
      <div className="flex-grow overflow-y-auto p-8 space-y-8 custom-scrollbar pb-8">
        {children}
      </div>
    </>
  );
}
