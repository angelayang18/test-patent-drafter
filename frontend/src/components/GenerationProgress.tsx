import { useEffect, useState } from "react";

interface GenerationProgressProps {
  active: boolean;
  label: string;
  /** When set, shows "step current of total" instead of only elapsed time. */
  step?: { current: number; total: number };
}

export function GenerationProgress({ active, label, step }: GenerationProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  const stepLabel = step ? ` (${step.current} of ${step.total})` : "";

  return (
    <div
      className="rounded-lg border border-outline-variant bg-surface-container-low p-4 space-y-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex justify-between items-center gap-4">
        <p className="font-label-md text-label-md text-on-surface">
          {label}
          {stepLabel}
        </p>
        <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
          {elapsed}s
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-outline-variant/40 overflow-hidden">
        <div className="generation-progress-bar h-full rounded-full bg-secondary" />
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        AI generation can take 30 seconds to a few minutes, depending on source length.
      </p>
    </div>
  );
}
