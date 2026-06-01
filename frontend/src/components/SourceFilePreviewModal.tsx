import type { UploadedSourceFile } from "../context/PatentWorkflowContext";
import { formatFileSize } from "../utils/format";

interface SourceFilePreviewModalProps {
  file: UploadedSourceFile | null;
  onClose: () => void;
}

export function SourceFilePreviewModal({ file, onClose }: SourceFilePreviewModalProps) {
  if (!file) return null;

  const hasContent = file.content.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex">
      <button
        type="button"
        aria-label="Close file preview"
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-file-preview-title"
        className="w-full max-w-3xl bg-surface-container-low h-full shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-lowest shrink-0 gap-4">
          <div className="min-w-0">
            <h2
              id="source-file-preview-title"
              className="font-headline-md text-headline-md text-primary truncate"
            >
              {file.filename}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
              {formatFileSize(file.sizeBytes)} · Extracted text used for AI analysis
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant shrink-0"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
          {hasContent ? (
            <pre className="whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface leading-relaxed bg-surface-container-lowest border border-outline-variant rounded-lg p-6">
              {file.content}
            </pre>
          ) : (
            <p className="font-body-md text-body-md text-on-surface-variant">
              No text could be extracted from this file.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
