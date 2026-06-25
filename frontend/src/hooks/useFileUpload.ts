import { useCallback, useMemo, useState } from "react";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { ApiError, uploadDocuments } from "../services/api";
import { isAcceptedFile, type UploadQueueItem } from "../types/upload";

export function useFileUpload() {
  const { addUploadedFilesAndPersist } = usePatentWorkflow();
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const uploading = useMemo(
    () => uploadQueue.some((item) => item.status === "pending" || item.status === "parsing"),
    [uploadQueue],
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter(isAcceptedFile);
      if (files.length === 0) {
        setError("Please upload PDF, DOCX, or PPTX files only.");
        return;
      }
      setError(null);

      const queue: UploadQueueItem[] = files.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        filename: file.name,
        sizeBytes: file.size,
        status: "pending",
      }));
      setUploadQueue(queue.map((item) => ({ ...item, status: "parsing" as const })));

      const parsed: {
        id: string;
        filename: string;
        sizeBytes: number;
        content: string;
      }[] = [];

      try {
        const results = await uploadDocuments(files);
        const resultByName = new Map(
          results.map((result) => [result.filename ?? "", result]),
        );

        const finalQueue: UploadQueueItem[] = queue.map((item) => {
          const result = resultByName.get(item.filename);
          if (!result) {
            return {
              ...item,
              status: "error" as const,
              error: "No response from server.",
            };
          }

          parsed.push({
            id: item.id,
            filename: result.filename ?? item.filename,
            sizeBytes: item.sizeBytes,
            content: result.content,
          });
          return { ...item, status: "done" as const };
        });
        setUploadQueue(finalQueue);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Upload failed.";
        setUploadQueue((prev) =>
          prev.map((item) => ({ ...item, status: "error", error: message })),
        );
      }

      if (parsed.length > 0) {
        addUploadedFilesAndPersist(parsed);
      }

      const failedCount = files.length - parsed.length;
      if (failedCount > 0 && parsed.length === 0) {
        setError(
          failedCount === 1
            ? "Could not parse the uploaded file."
            : `Could not parse ${failedCount} file(s).`,
        );
      } else if (failedCount > 0) {
        setError(
          `${parsed.length} file(s) added; ${failedCount} failed to parse. See details below.`,
        );
      }

      if (failedCount === 0) {
        window.setTimeout(() => setUploadQueue([]), 2000);
      }
    },
    [addUploadedFilesAndPersist],
  );

  return { processFiles, uploadQueue, error, uploading };
}
