import type { ReactNode } from "react";
import { GenericStepNav, type GenericWorkflowStep } from "./GenericStepNav";
import { AppHeader } from "./AppHeader";

interface GenericAppShellProps {
  step: GenericWorkflowStep;
  children: ReactNode;
  footer?: ReactNode;
  mainClassName?: string;
  layout?: "fixed" | "document";
  showStepNav?: boolean;
}

export function GenericAppShell({
  step,
  children,
  footer,
  mainClassName = "",
  layout = "fixed",
  showStepNav = true,
}: GenericAppShellProps) {
  const isDocument = layout === "document";

  return (
    <div
      className={`font-body-md text-on-background flex flex-col bg-background ${
        isDocument ? "min-h-screen" : "h-screen overflow-hidden"
      }`}
    >
      <AppHeader
        stepNav={showStepNav ? <GenericStepNav current={step} /> : null}
        showDraftsButton={false}
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
    </div>
  );
}
