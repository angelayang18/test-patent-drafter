import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

interface AppHeaderProps {
  stepNav: ReactNode;
  draftCount: number;
  onOpenDrafts: () => void;
  filingGuideButton?: ReactNode;
}

export function AppHeader({
  stepNav,
  draftCount,
  onOpenDrafts,
  filingGuideButton,
}: AppHeaderProps) {
  const location = useLocation();
  const isGrantRoute = location.pathname.startsWith("/grant");
  const activeWorkflow = isGrantRoute ? "grant" : "patent";

  return (
    <header className="bg-primary flex justify-between items-center w-full px-margin-desktop h-16 border-b border-outline-variant shadow-sm sticky top-0 z-50">
      <div className="flex items-center gap-6 min-w-0">
        <nav
          className="flex items-center rounded-lg border border-on-primary/20 p-0.5 bg-primary-container/10 shrink-0"
          aria-label="Workflow"
        >
          <Link
            to="/"
            className={`px-4 py-2 rounded-md font-label-md text-label-md transition-all whitespace-nowrap ${
              activeWorkflow === "patent"
                ? "bg-secondary text-on-secondary shadow-sm"
                : "text-on-primary/80 hover:text-on-primary hover:bg-primary-container/20"
            }`}
          >
            Patent Drafter
          </Link>
          <Link
            to="/grant"
            className={`px-4 py-2 rounded-md font-label-md text-label-md transition-all whitespace-nowrap ${
              activeWorkflow === "grant"
                ? "bg-secondary text-on-secondary shadow-sm"
                : "text-on-primary/80 hover:text-on-primary hover:bg-primary-container/20"
            }`}
          >
            Grant Application
          </Link>
        </nav>
        {stepNav}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {activeWorkflow === "patent" && filingGuideButton}
        <button
          type="button"
          onClick={onOpenDrafts}
          className="bg-primary-container/20 hover:bg-primary-container/40 text-on-primary px-4 py-2 rounded-lg font-label-md text-label-md transition-all active:scale-95 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">folder_open</span>
          <span className="hidden sm:inline">
            Drafts{draftCount > 0 ? ` (${draftCount})` : ""}
          </span>
          {draftCount > 0 && (
            <span className="sm:hidden font-label-sm text-label-sm">({draftCount})</span>
          )}
        </button>
        <span
          className="material-symbols-outlined text-on-primary cursor-default opacity-60 p-2 rounded-full"
          title="Account (coming soon)"
        >
          account_circle
        </span>
      </div>
    </header>
  );
}
