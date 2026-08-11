import { Link, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { SignedIn, UserButton } from "@clerk/clerk-react";

interface AppHeaderProps {
  stepNav: ReactNode;
  draftCount?: number;
  onOpenDrafts?: () => void;
  filingGuideButton?: ReactNode;
  /** When false, hides the Drafts button (e.g. custom-type pages). Default true. */
  showDraftsButton?: boolean;
}

export function AppHeader({
  stepNav,
  draftCount = 0,
  onOpenDrafts,
  filingGuideButton,
  showDraftsButton = true,
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
        {showDraftsButton && (
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
        )}
        {/* App is fully gated behind RequireAuth, so this header only ever
            renders for signed-in users — SignedIn here is just a defensive
            guard against Clerk's auth state not being loaded yet. */}
        <SignedIn>
          <UserButton afterSignOutUrl="/" />
        </SignedIn>
      </div>
    </header>
  );
}
