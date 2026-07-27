import { Link } from "react-router-dom";
import { useSowWorkflow } from "../context/SowWorkflowContext";
import {
  SOW_STEP_ORDER,
  SOW_STEP_PATHS,
  isSowStepAccessible,
  type SowWorkflowStep,
} from "../utils/sowStorage";

export type { SowWorkflowStep };

const STEP_LABELS: Record<SowWorkflowStep, string> = {
  input: "Input",
  review: "Review",
  draft: "Draft",
  export: "Export",
};

export function SowStepNav({ current }: { current: SowWorkflowStep }) {
  const { getWorkflowSnapshot } = useSowWorkflow();
  const snapshot = getWorkflowSnapshot();

  return (
    <nav className="hidden md:flex items-center gap-6">
      {SOW_STEP_ORDER.map((step, index) => {
        const accessible = isSowStepAccessible(step, snapshot);
        const isCurrent = step === current;
        const label = `${index + 1}. ${STEP_LABELS[step]}`;
        const path = SOW_STEP_PATHS[step];

        if (isCurrent) {
          return (
            <div
              key={step}
              className="flex items-center gap-2 text-on-primary border-b-4 border-secondary-container pb-1"
            >
              <span className="font-label-md text-label-md font-semibold">{label}</span>
            </div>
          );
        }

        if (!accessible) {
          return (
            <span
              key={step}
              aria-disabled="true"
              title="Complete the previous step first"
              className="flex items-center gap-2 text-on-primary/35 cursor-not-allowed pb-1 select-none"
            >
              <span className="font-label-md text-label-md">{label}</span>
            </span>
          );
        }

        return (
          <Link
            key={step}
            to={path}
            className="flex items-center gap-2 text-on-primary/70 hover:text-on-primary transition-colors pb-1"
          >
            <span className="font-label-md text-label-md">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
