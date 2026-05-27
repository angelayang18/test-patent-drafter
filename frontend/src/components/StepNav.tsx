import { Link } from "react-router-dom";

export type WorkflowStep = "input" | "review" | "draft" | "figures" | "export";

const STEPS: { id: WorkflowStep; label: string; path: string }[] = [
  { id: "input", label: "1. Input", path: "/" },
  { id: "review", label: "2. Review", path: "/review" },
  { id: "draft", label: "3. Draft", path: "/draft" },
  { id: "figures", label: "4. Figures", path: "/figures" },
  { id: "export", label: "5. Export", path: "/export" },
];

export function StepNav({ current }: { current: WorkflowStep }) {
  return (
    <nav className="hidden md:flex items-center gap-6">
      {STEPS.map((step) =>
        step.id === current ? (
          <div
            key={step.id}
            className="flex items-center gap-2 text-on-primary border-b-4 border-secondary-container pb-1 transition-all"
          >
            <span className="font-label-md text-label-md font-semibold">{step.label}</span>
          </div>
        ) : (
          <Link
            key={step.id}
            to={step.path}
            className="flex items-center gap-2 text-on-primary/70 hover:text-on-primary transition-colors pb-1"
          >
            <span className="font-label-md text-label-md">{step.label}</span>
          </Link>
        )
      )}
    </nav>
  );
}
