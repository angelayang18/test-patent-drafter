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
  const showFilingGuide = location.pathname.startsWith("/patent");

  return (
    <header className="bg-primary flex justify-between items-center w-full px-margin-desktop h-16 border-b border-outline-variant shadow-sm sticky top-0 z-50">
      <div className="flex items-center gap-6 min-w-0">
        <Link
          to="/"
          className="flex items-center gap-2 text-on-primary hover:opacity-90 transition-opacity shrink-0"
        >
          <span className="material-symbols-outlined text-[22px]">description</span>
          <span className="font-label-md text-label-md hidden sm:inline">Report Drafter</span>
        </Link>
        {stepNav}
      </div>
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {showFilingGuide && filingGuideButton}
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
