import { useState, type ReactNode } from "react";
import { StepNav, type WorkflowStep } from "./StepNav";
import { AppHeader } from "./AppHeader";
import { DraftManagerModal } from "./DraftManagerModal";
import { PatentSubmissionGuidePanel } from "./PatentSubmissionGuidePanel";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { countAllSavedDrafts } from "../utils/draftCounts";

interface AppShellProps {
  step: WorkflowStep;
  children: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
  /** fixed = viewport-locked (draft/review); document = page scrolls (export) */
  layout?: "fixed" | "document";
  showStepNav?: boolean;
}

export function AppShell({
  step,
  children,
  footer,
  mainClassName = "",
  layout = "fixed",
  showStepNav = true,
}: AppShellProps) {
  const { saveToStorage } = usePatentWorkflow();
  const [draftManagerOpen, setDraftManagerOpen] = useState(false);
  const [filingGuideOpen, setFilingGuideOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(countAllSavedDrafts);
  const isDocument = layout === "document";

  const openDraftManager = () => {
    saveToStorage();
    setDraftCount(countAllSavedDrafts());
    setDraftManagerOpen(true);
  };

  return (
    <div
      className={`font-body-md text-on-background flex flex-col bg-background ${
        isDocument ? "min-h-screen" : "h-screen overflow-hidden"
      }`}
    >
      <AppHeader
        stepNav={showStepNav ? <StepNav current={step} /> : null}
        draftCount={draftCount}
        onOpenDrafts={openDraftManager}
        filingGuideButton={
          <button
            type="button"
            onClick={() => setFilingGuideOpen(true)}
            className="bg-primary-container/20 hover:bg-primary-container/40 text-on-primary p-2 sm:px-4 sm:py-2 rounded-lg font-label-md text-label-md transition-all active:scale-95 flex items-center gap-2"
            aria-label="Open patent submission guide"
            title="Patent submission guide"
          >
            <span className="material-symbols-outlined text-[20px]">info</span>
            <span className="hidden sm:inline">Filing guide</span>
          </button>
        }
      />

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

      <DraftManagerModal
        open={draftManagerOpen}
        onClose={() => setDraftManagerOpen(false)}
        onDraftCountChange={() => setDraftCount(countAllSavedDrafts())}
      />
      <PatentSubmissionGuidePanel
        open={filingGuideOpen}
        onClose={() => setFilingGuideOpen(false)}
      />
    </div>
  );
}
