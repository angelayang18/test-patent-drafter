/**
 * Namespaces localStorage keys by the signed-in Clerk user so two accounts
 * sharing a browser never see each other's drafts, templates, or in-progress
 * workflows. Before Clerk existed (and until this module), every storage key
 * in this app was a fixed string with no concept of "which user" — anyone
 * signed into the same browser saw the same data.
 *
 * `setActiveStorageUserId` must be called synchronously, during render,
 * before any descendant component reads/writes storage — see the render-time
 * (not useEffect) call in main.tsx. Render order guarantees parents run
 * before children, so as long as the call happens above the app tree, every
 * storage read below it already has the right scope.
 */

let activeUserId: string | null = null;

export function setActiveStorageUserId(userId: string | null): void {
  activeUserId = userId;
}

export function getActiveStorageUserId(): string | null {
  return activeUserId;
}

// Tracks which scoped keys we've already attempted a legacy migration for,
// so repeated reads/writes of the same key don't repeat the check.
const migratedKeys = new Set<string>();

/**
 * Returns the per-user storage key for `baseKey`. The first time a given
 * scoped key is requested, if it doesn't exist yet but an old un-scoped
 * value does (data saved before this module existed, or before the
 * currently-active user was known), that value is copied over once and the
 * legacy key is cleared — so whichever account opens the app first after
 * this ships keeps its existing drafts instead of losing them, and no other
 * account inherits them afterward.
 */
export function getStorageKey(baseKey: string): string {
  const scope = activeUserId ?? "anonymous";
  const scopedKey = `${baseKey}::${scope}`;

  if (typeof window !== "undefined" && !migratedKeys.has(scopedKey)) {
    migratedKeys.add(scopedKey);
    try {
      const alreadyScoped = window.localStorage.getItem(scopedKey);
      const legacy = window.localStorage.getItem(baseKey);
      if (alreadyScoped === null && legacy !== null) {
        window.localStorage.setItem(scopedKey, legacy);
        window.localStorage.removeItem(baseKey);
      }
    } catch {
      // Storage unavailable (private browsing, quota) — nothing to migrate.
    }
  }

  return scopedKey;
}
