import { Link } from "react-router-dom";
import { useGenericWorkflow } from "../context/GenericWorkflowContext";
import {
  GENERIC_STEP_ORDER,
  GENERIC_STEP_PATHS,
  isGenericStepAccessible,
  type GenericWorkflowStep,
} from "../utils/genericStorage";

export type { GenericWorkflowStep };

const STEP_LABELS: Record<GenericWorkflowStep, string> = {
  input: "Input",
  review: "Review",
  draft: "Draft",
  export: "Export",
};

export function GenericStepNav({ current }: { current: GenericWorkflowStep }) {
  const { templateId, getWorkflowSnapshot } = useGenericWorkflow();
  const snapshot = getWorkflowSnapshot();
  const paths = GENERIC_STEP_PATHS(templateId);

  return (
    <nav className="hidden md:flex items-center gap-6">
      {GENERIC_STEP_ORDER.map((step, index) => {
        const accessible = isGenericStepAccessible(step, snapshot);
        const isCurrent = step === current;
        const label = `${index + 1}. ${STEP_LABELS[step]}`;
        const path = paths[step];

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
