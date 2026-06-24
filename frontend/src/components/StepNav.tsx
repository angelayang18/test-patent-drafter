import { Link } from "react-router-dom";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import {
  isWorkflowStepAccessible,
  WORKFLOW_STEP_ORDER,
  WORKFLOW_STEP_PATHS,
  type WorkflowStep,
} from "../utils/draftStorage";

export type { WorkflowStep };

const STEPS = WORKFLOW_STEP_ORDER.map((id) => ({
  id,
  label: `${WORKFLOW_STEP_ORDER.indexOf(id) + 1}. ${id.charAt(0).toUpperCase()}${id.slice(1)}`,
  path: WORKFLOW_STEP_PATHS[id],
}));

export function StepNav({ current }: { current: WorkflowStep }) {
  const { getWorkflowSnapshot } = usePatentWorkflow();
  const snapshot = getWorkflowSnapshot();

  return (
    <nav className="hidden md:flex items-center gap-6">
      {STEPS.map((step) => {
        const accessible = isWorkflowStepAccessible(step.id, snapshot);
        const isCurrent = step.id === current;

        if (isCurrent) {
          return (
            <div
              key={step.id}
              className="flex items-center gap-2 text-on-primary border-b-4 border-secondary-container pb-1 transition-all"
            >
              <span className="font-label-md text-label-md font-semibold">{step.label}</span>
            </div>
          );
        }

        if (!accessible) {
          return (
            <span
              key={step.id}
              aria-disabled="true"
              title="Complete the previous step first"
              className="flex items-center gap-2 text-on-primary/35 cursor-not-allowed pb-1 select-none"
            >
              <span className="font-label-md text-label-md">{step.label}</span>
            </span>
          );
        }

        return (
          <Link
            key={step.id}
            to={step.path}
            className="flex items-center gap-2 text-on-primary/70 hover:text-on-primary transition-colors pb-1"
          >
            <span className="font-label-md text-label-md">{step.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
