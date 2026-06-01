import type { UploadedSourceFile } from "../context/PatentWorkflowContext";
import { formatFileSize } from "../utils/format";
import { SourceTextPreviewModal } from "./SourceTextPreviewModal";

interface SourceFilePreviewModalProps {
  file: UploadedSourceFile | null;
  onClose: () => void;
}

export function SourceFilePreviewModal({ file, onClose }: SourceFilePreviewModalProps) {
  if (!file) return null;

  return (
    <SourceTextPreviewModal
      title={file.filename}
      subtitle={`${formatFileSize(file.sizeBytes)} · Extracted text used for AI analysis`}
      content={file.content}
      onClose={onClose}
    />
  );
}
