import { useGrantWorkflow } from "../context/GrantWorkflowContext";
import { useFileUpload as useFileUploadCore } from "./useFileUpload";

/** File upload hook wired to the grant workflow context. */
export function useGrantFileUpload() {
  const { addUploadedFilesAndPersist } = useGrantWorkflow();
  return useFileUploadCore(addUploadedFilesAndPersist);
}
