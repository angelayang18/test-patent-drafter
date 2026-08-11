import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Split-screen shell for the sign-in / sign-up pages: branded panel on the
 * left, the Clerk form (passed as children) on the right.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] bg-primary text-on-primary flex-col justify-between p-12 relative overflow-hidden">
        <div className="flex items-center gap-2 relative z-10">
          <span className="material-symbols-outlined text-[26px]" aria-hidden>
            description
          </span>
          <span className="font-label-lg text-label-lg">Report Drafter</span>
        </div>

        <div className="relative z-10">
          <h1 className="font-headline-lg text-headline-lg leading-tight mb-4">
            AI-assisted drafting for patents, grants, and beyond
          </h1>
          <p className="font-body-md text-body-md text-on-primary/80 max-w-md">
            Turn source material into structured, citation-backed provisional
            patents, grant applications, statements of work, and bioanalytical
            reports — with every claim traceable back to its source.
          </p>
        </div>

        <p className="font-body-sm text-body-sm text-on-primary/60 relative z-10">
          opAIda &middot; Report Drafter
        </p>

        <svg
          className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none"
          viewBox="0 0 400 800"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          <circle cx="60" cy="120" r="140" fill="currentColor" />
          <circle cx="360" cy="620" r="200" fill="currentColor" />
          <rect x="180" y="360" width="220" height="220" rx="24" fill="currentColor" transform="rotate(18 290 470)" />
        </svg>
      </div>

      <div className="flex-1 flex items-center justify-center bg-surface-container-low p-6 sm:p-12">
        <div className="w-full max-w-[440px]">{children}</div>
      </div>
    </div>
  );
}
