import type { ReactNode } from "react";

interface WorkflowFooterProps {
  left?: ReactNode;
  right: ReactNode;
}

/** Standard h-20 workflow navigation bar used across all steps. */
export function WorkflowFooter({ left, right }: WorkflowFooterProps) {
  return (
    <footer className="h-20 shrink-0 bg-surface-container-lowest border-t border-outline-variant px-margin-desktop flex items-center justify-between z-50">
      <div className="flex items-center min-w-0">{left}</div>
      <div className="flex items-center gap-4 shrink-0">{right}</div>
    </footer>
  );
}
