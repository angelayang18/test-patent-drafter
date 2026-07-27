import { useState, type ReactNode } from "react";
import { SowStepNav, type SowWorkflowStep } from "./SowStepNav";
import { AppHeader } from "./AppHeader";
import { DraftManagerModal } from "./DraftManagerModal";
import { useSowWorkflow } from "../context/SowWorkflowContext";
import { countAllSavedDrafts } from "../utils/draftCounts";

interface SowAppShellProps {
  step: SowWorkflowStep;
  children: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
  layout?: "fixed" | "document";
  showStepNav?: boolean;
}

export function SowAppShell({
  step,
  children,
  footer,
  mainClassName = "",
  layout = "fixed",
  showStepNav = true,
}: SowAppShellProps) {
  const { saveToStorage } = useSowWorkflow();
  const [draftManagerOpen, setDraftManagerOpen] = useState(false);
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
        stepNav={showStepNav ? <SowStepNav current={step} /> : null}
        draftCount={draftCount}
        onOpenDrafts={openDraftManager}
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
    </div>
  );
}
