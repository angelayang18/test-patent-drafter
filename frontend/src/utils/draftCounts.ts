import { listSavedDrafts } from "./draftStorage";
import { listSavedGrantDrafts } from "./grantStorage";
import { listSavedSowDrafts } from "./sowStorage";
import { listSavedAdaDrafts } from "./adaStorage";

/** Total named drafts saved in this browser (patent + grant + SOW + ADA). */
export function countAllSavedDrafts(): number {
  const patentDrafts = listSavedDrafts().filter(
    (record) => record.workflow.workflowMode !== "grant",
  );
  return (
    patentDrafts.length +
    listSavedGrantDrafts().length +
    listSavedSowDrafts().length +
    listSavedAdaDrafts().length
  );
}
