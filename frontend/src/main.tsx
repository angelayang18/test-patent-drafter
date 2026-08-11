import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import App from "./App";
import { setActiveStorageUserId } from "./utils/userScopedStorage";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error(
    "Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to frontend/.env (see .env.example)."
  );
}

// Clerk's default sign-in title pulls the raw application name from the
// dashboard ("Sign in to drafter-dev"), which doesn't match the "Report
// Drafter" branding used everywhere else in the app. Override the string
// directly instead of renaming the Clerk application.
const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in to Report Drafter",
    },
  },
};

/**
 * Scopes every localStorage-backed draft/template/workflow to the signed-in
 * Clerk user before App (and the workflow providers it wraps) ever mounts.
 *
 * The scope is set synchronously in the render body — not in a useEffect —
 * because React renders parents before children: by the time App's own
 * providers run their `useState(() => readFromStorage())` initializers,
 * this line has already executed. An effect would run too late, after those
 * initializers already captured the previous (wrong) user's data.
 *
 * `key={userId}` forces App to fully unmount and remount when the signed-in
 * user changes (sign-out then a different sign-in, without a page reload).
 * Without this, providers that already mounted would keep holding the old
 * user's data in memory and could write it back out under the new user's
 * storage keys.
 */
function ScopedApp() {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <span
          className="material-symbols-outlined loading-spin text-primary text-[32px]"
          aria-hidden
        >
          progress_activity
        </span>
      </div>
    );
  }

  setActiveStorageUserId(userId ?? null);
  return <App key={userId ?? "anonymous"} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      localization={clerkLocalization}
    >
      <ScopedApp />
    </ClerkProvider>
  </StrictMode>
);
