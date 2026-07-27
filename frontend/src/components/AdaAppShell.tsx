import { useState, type ReactNode } from "react";
import { AdaStepNav, type AdaWorkflowStep } from "./AdaStepNav";
import { AppHeader } from "./AppHeader";
import { DraftManagerModal } from "./DraftManagerModal";
import { useAdaWorkflow } from "../context/AdaWorkflowContext";
import { countAllSavedDrafts } from "../utils/draftCounts";

interface AdaAppShellProps {
  step: AdaWorkflowStep;
  children: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
  layout?: "fixed" | "document";
  showStepNav?: boolean;
}

export function AdaAppShell({
  step,
  children,
  footer,
  mainClassName = "",
  layout = "fixed",
  showStepNav = true,
}: AdaAppShellProps) {
  const { saveToStorage } = useAdaWorkflow();
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
        stepNav={showStepNav ? <AdaStepNav current={step} /> : null}
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
