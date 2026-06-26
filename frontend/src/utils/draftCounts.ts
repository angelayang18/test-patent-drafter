import { listSavedDrafts } from "./draftStorage";
import { listSavedGrantDrafts } from "./grantStorage";

/** Total named drafts saved in this browser (patent + grant). */
export function countAllSavedDrafts(): number {
  const patentDrafts = listSavedDrafts().filter(
    (record) => record.workflow.workflowMode !== "grant",
  );
  return patentDrafts.length + listSavedGrantDrafts().length;
}
