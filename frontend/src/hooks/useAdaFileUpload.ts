import { useAdaWorkflow } from "../context/AdaWorkflowContext";
import { useFileUpload as useFileUploadCore } from "./useFileUpload";

/** File upload hook wired to the ADA workflow context. */
export function useAdaFileUpload() {
  const { addUploadedFilesAndPersist } = useAdaWorkflow();
  return useFileUploadCore(addUploadedFilesAndPersist);
}
