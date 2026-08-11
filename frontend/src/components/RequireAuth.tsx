import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Gates the app behind Clerk auth. Signed-out users are redirected to
 * /sign-in with the page they were trying to reach preserved so they can be
 * sent back after signing in.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <span className="material-symbols-outlined loading-spin text-primary text-[32px]" aria-hidden>
          progress_activity
        </span>
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
