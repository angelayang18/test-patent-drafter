import { useSowWorkflow } from "../context/SowWorkflowContext";
import { useFileUpload as useFileUploadCore } from "./useFileUpload";

/** File upload hook wired to the SOW workflow context. */
export function useSowFileUpload() {
  const { addUploadedFilesAndPersist } = useSowWorkflow();
  return useFileUploadCore(addUploadedFilesAndPersist);
}
