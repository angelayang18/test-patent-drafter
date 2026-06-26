import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { useFileUpload as useFileUploadCore } from "./useFileUpload";

/** File upload hook wired to the patent workflow context. */
export function usePatentFileUpload() {
  const { addUploadedFilesAndPersist } = usePatentWorkflow();
  return useFileUploadCore(addUploadedFilesAndPersist);
}
