import type { InputSources, UploadedSourceFile } from "../context/PatentWorkflowContext";
import type { CachedRemoteSources } from "./gatherSourceText";
import type { InventionDetails } from "../types/patent";

const REVIEW_EXTRACTION_FIELDS: (keyof InventionDetails)[] = [
  "invention_title",
  "problem_being_solved",
  "core_technical_solution",
  "novel_mechanism",
  "alternative_embodiments",
];

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/** True when at least one review field has extracted content. */
export function hasExtractedReviewContent(invention: InventionDetails): boolean {
  return REVIEW_EXTRACTION_FIELDS.some((field) => {
    const value = invention[field];
    if (Array.isArray(value)) {
      return value.some((item) => item.trim().length > 0);
    }
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** True when the workflow has local files/text or remote source configuration. */
export function hasSourceMaterialConfigured(
  uploadedFiles: UploadedSourceFile[],
  inputSources: InputSources,
  cachedRemoteSources: CachedRemoteSources = {},
): boolean {
  if (uploadedFiles.some((file) => file.content.trim().length > 0)) {
    return true;
  }
  if (inputSources.pastedText.trim().length > 0) {
    return true;
  }
  if (inputSources.websiteUrl.trim().length > 0) {
    return true;
  }
  if (
    inputSources.confluenceUrl.trim().length > 0 &&
    inputSources.confluenceSpaceKey.trim().length > 0 &&
    inputSources.confluenceToken.trim().length > 0
  ) {
    return true;
  }
  if (cachedRemoteSources.website?.content?.trim()) {
    return true;
  }
  if (cachedRemoteSources.confluence?.content?.trim()) {
    return true;
  }
  return false;
}

/** Fingerprint of source inputs used to detect stale extraction results. */
export function computeExtractionSourceKey(
  uploadedFiles: UploadedSourceFile[],
  inputSources: InputSources,
  cachedRemoteSources: CachedRemoteSources = {},
): string {
  const parts: string[] = [
    uploadedFiles
      .map(
        (file) =>
          `${file.id}\0${file.filename}\0${file.content.length}\0${hashString(file.content.slice(0, 2000))}`,
      )
      .sort()
      .join("\n"),
    inputSources.pastedText,
    inputSources.websiteUrl.trim(),
    inputSources.confluenceUrl.trim(),
    inputSources.confluenceSpaceKey.trim(),
    inputSources.relevantContentNotes,
    inputSources.irrelevantContentNotes,
  ];

  if (cachedRemoteSources.website) {
    parts.push(
      `web:${cachedRemoteSources.website.url}:${cachedRemoteSources.website.content.length}:${hashString(cachedRemoteSources.website.content.slice(0, 2000))}`,
    );
  }
  if (cachedRemoteSources.confluence) {
    parts.push(
      `conf:${cachedRemoteSources.confluence.url}:${cachedRemoteSources.confluence.spaceKey}:${cachedRemoteSources.confluence.content.length}:${hashString(cachedRemoteSources.confluence.content.slice(0, 2000))}`,
    );
  }

  return hashString(parts.join("\0"));
}

/**
 * Whether the Review step should run extraction automatically.
 * Skips when results exist for the current source fingerprint.
 */
export function needsExtraction(
  invention: InventionDetails | null,
  extractionSourceKey: string | null | undefined,
  uploadedFiles: UploadedSourceFile[],
  inputSources: InputSources,
  cachedRemoteSources: CachedRemoteSources = {},
): boolean {
  if (!hasSourceMaterialConfigured(uploadedFiles, inputSources, cachedRemoteSources)) {
    return false;
  }
  if (!invention || !hasExtractedReviewContent(invention)) {
    return true;
  }
  if (extractionSourceKey == null) {
    // Legacy saved drafts: content exists but no fingerprint was stored yet.
    return false;
  }
  const currentKey = computeExtractionSourceKey(
    uploadedFiles,
    inputSources,
    cachedRemoteSources,
  );
  return extractionSourceKey !== currentKey;
}
