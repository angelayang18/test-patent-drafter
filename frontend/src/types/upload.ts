export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx"] as const;

export function isAcceptedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export type UploadFileStatus = "pending" | "parsing" | "done" | "error";

export interface UploadQueueItem {
  id: string;
  filename: string;
  sizeBytes: number;
  status: UploadFileStatus;
  error?: string;
}
