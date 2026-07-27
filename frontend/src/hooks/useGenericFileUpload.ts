import { useGenericWorkflow } from "../context/GenericWorkflowContext";
import { useFileUpload as useFileUploadCore } from "./useFileUpload";

/** File upload hook wired to the generic workflow context. */
export function useGenericFileUpload() {
  const { addUploadedFilesAndPersist } = useGenericWorkflow();
  return useFileUploadCore(addUploadedFilesAndPersist);
}
