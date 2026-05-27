export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileIcon(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "picture_as_pdf";
  if (lower.endsWith(".pptx")) return "slideshow";
  return "description";
}
