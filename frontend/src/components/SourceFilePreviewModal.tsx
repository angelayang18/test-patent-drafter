import type { UploadedSourceFile } from "../context/PatentWorkflowContext";
import { formatFileSize } from "../utils/format";
import { SourceTextPreviewModal } from "./SourceTextPreviewModal";

interface SourceFilePreviewModalProps {
  file: UploadedSourceFile | null;
  onClose: () => void;
  /** Optional quote to highlight and scroll to in the extracted text. */
  highlightText?: string;
}

export function SourceFilePreviewModal({
  file,
  onClose,
  highlightText,
}: SourceFilePreviewModalProps) {
  if (!file) return null;

  return (
    <SourceTextPreviewModal
      title={file.filename}
      subtitle={`${formatFileSize(file.sizeBytes)} · Extracted text used for AI analysis`}
      content={file.content}
      highlightText={highlightText}
      onClose={onClose}
    />
  );
}
