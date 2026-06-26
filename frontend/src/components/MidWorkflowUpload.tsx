import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePatentWorkflow } from "../context/PatentWorkflowContext";
import { usePatentFileUpload } from "../hooks/usePatentFileUpload";
import { fileIcon } from "../utils/format";

export function MidWorkflowUpload() {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  const { uploadedFiles, removeUploadedFile, saveToStorage } = usePatentWorkflow();
  const { processFiles, uploadQueue, error: uploadError, uploading } = usePatentFileUpload();

  const [expanded, setExpanded] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const activeUpload = uploadQueue.find(
    (item) => item.status === "pending" || item.status === "parsing",
  );

  useEffect(() => {
    if (uploadQueue.length === 0 || uploading) {
      return;
    }
    const allSucceeded = uploadQueue.every((item) => item.status === "done");
    if (!allSucceeded) {
      return;
    }

    const label =
      uploadQueue.length === 1
        ? uploadQueue[0].filename
        : `${uploadQueue.length} files`;
    setSuccessMessage(`✓ ${label} added`);

    const timer = window.setTimeout(() => {
      setSuccessMessage(null);
      setExpanded(false);
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [uploadQueue, uploading]);

  useEffect(() => {
    const dropzone = dropzoneRef.current;
    if (!dropzone || !expanded) {
      return;
    }

    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.add("border-secondary", "bg-secondary/10");
    };
    const onDragLeave = () => {
      dropzone.classList.remove("border-secondary", "bg-secondary/10");
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.remove("border-secondary", "bg-secondary/10");
      if (e.dataTransfer?.files?.length) {
        void processFiles(e.dataTransfer.files);
      }
    };

    dropzone.addEventListener("dragover", onDragOver);
    dropzone.addEventListener("dragleave", onDragLeave);
    dropzone.addEventListener("drop", onDrop);
    return () => {
      dropzone.removeEventListener("dragover", onDragOver);
      dropzone.removeEventListener("dragleave", onDragLeave);
      dropzone.removeEventListener("drop", onDrop);
    };
  }, [expanded, processFiles]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void processFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleRemoveFile = useCallback(
    (id: string) => {
      removeUploadedFile(id);
      saveToStorage();
    },
    [removeUploadedFile, saveToStorage],
  );

  const showPanel = expanded || uploading || Boolean(successMessage);

  return (
    <div className="mt-4 pt-4 border-t border-outline-variant space-y-3">
      {!showPanel && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-left px-3 py-2 rounded-lg text-secondary font-label-sm text-label-sm hover:bg-secondary/10 transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add source material
        </button>
      )}

      {showPanel && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              Add files
            </p>
            {!uploading && (
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  setSuccessMessage(null);
                }}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded"
                aria-label="Collapse upload panel"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            multiple
            accept=".pdf,.docx,.pptx"
            className="sr-only"
            onChange={handleFileInputChange}
          />

          {!successMessage && (
            <div
              ref={dropzoneRef}
              role="button"
              tabIndex={uploading ? -1 : 0}
              aria-disabled={uploading}
              onClick={() => !uploading && fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (uploading) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border border-dashed border-outline-variant rounded-lg p-4 flex flex-col items-center text-center transition-all ${
                uploading
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:border-secondary hover:bg-secondary/5 cursor-pointer"
              }`}
            >
              <span
                className={`material-symbols-outlined text-secondary text-2xl mb-1 ${
                  uploading ? "loading-spin" : ""
                }`}
              >
                {uploading ? "progress_activity" : "upload_file"}
              </span>
              <p className="font-body-sm text-body-sm text-on-surface">
                {uploading ? "Parsing…" : "Drop PDF, DOCX, or PPTX"}
              </p>
              {!uploading && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="mt-2 font-label-sm text-label-sm text-secondary hover:underline"
                >
                  Browse files
                </button>
              )}
            </div>
          )}

          {uploading && activeUpload && (
            <p className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary loading-spin text-[18px]">
                progress_activity
              </span>
              <span className="truncate">{activeUpload.filename}</span>
            </p>
          )}

          {successMessage && (
            <p
              className="font-body-sm text-body-sm text-green-700 flex items-center gap-1 animate-pulse"
              role="status"
            >
              {successMessage}
            </p>
          )}

          {uploadError && (
            <p className="font-body-sm text-body-sm text-error" role="alert">
              {uploadError}
            </p>
          )}
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <ul className="space-y-1.5">
          {uploadedFiles.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-surface-container-low border border-outline-variant/60"
            >
              <span className="material-symbols-outlined text-primary text-[18px] shrink-0">
                {fileIcon(file.filename)}
              </span>
              <span className="font-body-sm text-body-sm text-on-surface truncate flex-1 min-w-0">
                {file.filename}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.filename}`}
                onClick={() => handleRemoveFile(file.id)}
                className="shrink-0 text-on-surface-variant hover:text-error p-0.5 rounded transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
