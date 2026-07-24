/** Fired after the patent or grant draft library is written (save/delete). */
export const DRAFTS_CHANGED_EVENT = "patent-drafter:drafts-changed";

/** Notify listeners (e.g. ImportSavedDraftsCard) that saved-draft libraries changed. */
export function notifyDraftsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(DRAFTS_CHANGED_EVENT));
}
