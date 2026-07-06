const NOTES_SIDEBAR_HINT_KEY = "patent-drafter:notes-sidebar-hint-seen";

/** Whether the user has already seen the Notes sidebar first-visit coachmark. */
export function hasSeenNotesSidebarHint(): boolean {
  try {
    return localStorage.getItem(NOTES_SIDEBAR_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist that the user has seen the Notes sidebar first-visit coachmark. */
export function markNotesSidebarHintSeen(): void {
  try {
    localStorage.setItem(NOTES_SIDEBAR_HINT_KEY, "1");
  } catch {
    // localStorage unavailable — hint may reappear next visit
  }
}
