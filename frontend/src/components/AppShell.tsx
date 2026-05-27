import type { ReactNode } from "react";
import { StepNav, type WorkflowStep } from "./StepNav";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";

interface AppShellProps {
  step: WorkflowStep;
  children: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
  /** fixed = viewport-locked (draft/review); document = page scrolls (export) */
  layout?: "fixed" | "document";
}

export function AppShell({
  step,
  children,
  footer,
  mainClassName = "",
  layout = "fixed",
}: AppShellProps) {
  const { saveToStorage } = usePatentWorkflow();
  const isDocument = layout === "document";

  return (
    <div
      className={`font-body-md text-on-background flex flex-col bg-background ${
        isDocument ? "min-h-screen" : "h-screen overflow-hidden"
      }`}
    >
      <header className="bg-primary flex justify-between items-center w-full px-margin-desktop h-16 border-b border-outline-variant shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-8">
          <span className="text-on-primary font-display font-bold text-headline-md tracking-tight whitespace-nowrap">
            Patent Drafter
          </span>
          <StepNav current={step} />
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => saveToStorage()}
            className="bg-primary-container/20 hover:bg-primary-container/40 text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md transition-all active:scale-95"
          >
            Save Draft
          </button>
          <span
            className="material-symbols-outlined text-on-primary cursor-default opacity-60 p-2 rounded-full"
            title="Notifications (coming soon)"
          >
            notifications
          </span>
          <span
            className="material-symbols-outlined text-on-primary cursor-default opacity-60 p-2 rounded-full"
            title="Account (coming soon)"
          >
            account_circle
          </span>
        </div>
      </header>

      <main
        className={`w-full ${
          isDocument
            ? `flex-1 ${mainClassName}`
            : `flex-1 min-h-0 overflow-y-auto ${mainClassName}`
        }`}
      >
        {children}
      </main>

      {footer}
    </div>
  );
}
