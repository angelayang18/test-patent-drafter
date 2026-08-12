import type { ReactNode } from "react";

function RegenerateButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex items-center gap-2 text-secondary font-label-sm text-label-sm hover:underline disabled:opacity-50"
    >
      <span className={`material-symbols-outlined text-[16px] ${loading ? "loading-spin" : ""}`}>
        autorenew
      </span>
      {loading ? "Regenerating..." : "Regenerate with AI"}
    </button>
  );
}

/**
 * Field shell used on Review pages: label, AI-Generated badge, optional hint,
 * field body, and regenerate / extra actions row.
 */
export function ReviewAiField({
  label,
  hint,
  children,
  onRegenerate,
  regenerating,
  extraActions,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  onRegenerate: () => void;
  regenerating: boolean;
  extraActions?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <label className="font-label-md text-label-md text-primary">{label}</label>
          <span className="bg-secondary-fixed text-on-secondary-fixed text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
            AI-Generated
          </span>
        </div>
        {hint && (
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">{hint}</p>
        )}
      </div>
      {children}
      <div className="flex justify-end items-center gap-4">
        {extraActions}
        <RegenerateButton onClick={onRegenerate} loading={regenerating} />
      </div>
    </div>
  );
}
