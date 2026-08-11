import type { CachedRemoteSources } from "./gatherSourceText";
import { formatFileSize } from "./format";

/** Preview payload for {@link SourceTextPreviewModal}. */
export interface CitationPreviewSource {
  title: string;
  subtitle?: string;
  content: string;
}

export interface ResolveCitationPreviewOptions {
  uploadedFiles?: Array<{
    filename: string;
    content: string;
    sizeBytes: number;
  }>;
  pastedText?: string;
  cachedRemoteSources?: CachedRemoteSources;
  /**
   * Bare field label → current Review-tab value.
   * Keys match the text after ``Your reviewed `` in citation labels
   * (see backend ``review_field_sources.review_field_source_label``).
   */
  reviewFieldValues?: Record<string, string>;
}

const REVIEWED_FIELD_PREFIX = "Your reviewed ";

/** Citation labels from imported-draft chunk headers in pastedText. */
const IMPORTED_DRAFT_LABEL_RE = /^Imported Draft: (.+) \[id=([^\]]+)\]$/;

/**
 * Build a bare-field-label → value map for review-field citation previews.
 * Empty / whitespace-only values are omitted so they are not previewable.
 */
export function buildReviewFieldValues(
  fieldLabels: Record<string, string>,
  details: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!details) return {};

  const result: Record<string, string> = {};
  for (const [key, label] of Object.entries(fieldLabels)) {
    const raw = details[key];
    let value = "";
    if (Array.isArray(raw)) {
      value = raw
        .map((item) => String(item).trim())
        .filter(Boolean)
        .join("\n");
    } else if (raw != null) {
      value = String(raw).trim();
    }
    if (value) {
      result[label] = value;
    }
  }
  return result;
}

const CHUNK_HEADER_RE = /^--- (.+?) ---$/gm;

/**
 * Extract the body of a ``--- {label} ---`` chunk from combined source text.
 * Used for Confluence caches, which store multiple page chunks in one string.
 */
function findLabeledChunkBody(combined: string, label: string): string | null {
  const text = combined.trim();
  if (!text) return null;

  const matches = [...text.matchAll(CHUNK_HEADER_RE)];
  if (!matches.length) {
    return null;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const chunkLabel = match[1]?.trim() ?? "";
    if (chunkLabel !== label) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const body = text.slice(start, end).trim();
    return body.length > 0 ? body : null;
  }
  return null;
}

/**
 * Resolve a citation label to previewable source text.
 *
 * Labels come from ``--- {label} ---`` headers in combined source text:
 * - uploaded files → filename
 * - pasted text → ``Pasted text``
 * - imported saved drafts → ``Imported Draft: {title} [id={id}]`` (body in pastedText)
 * - website scrapes → URL
 * - Confluence pages → page title (bodies live inside ``cachedRemoteSources.confluence.content``)
 * - Review-tab fields → ``Your reviewed {Field Label}`` (values from ``reviewFieldValues``)
 */
export function resolveCitationPreviewSource(
  label: string,
  options: ResolveCitationPreviewOptions,
): CitationPreviewSource | null {
  const trimmedLabel = label.trim();
  if (!trimmedLabel) return null;

  const uploadedFiles = options.uploadedFiles ?? [];
  const matchedFile = uploadedFiles.find((file) => file.filename === trimmedLabel);
  if (matchedFile && matchedFile.content.trim()) {
    return {
      title: matchedFile.filename,
      subtitle: `${formatFileSize(matchedFile.sizeBytes)} · Extracted text used for AI analysis`,
      content: matchedFile.content,
    };
  }

  const pasted = options.pastedText?.trim() ?? "";
  if (trimmedLabel === "Pasted text" && pasted) {
    return {
      title: "Pasted text",
      subtitle: "Text entered on the Input step",
      content: pasted,
    };
  }

  const importedMatch = trimmedLabel.match(IMPORTED_DRAFT_LABEL_RE);
  if (importedMatch && pasted) {
    const title = importedMatch[1]?.trim() ?? "";
    const draftId = importedMatch[2]?.trim() ?? "";
    if (title && draftId) {
      const body = findLabeledChunkBody(pasted, trimmedLabel);
      if (body) {
        return {
          title,
          subtitle: "Imported draft",
          content: body,
        };
      }
    }
  }

  const websites = options.cachedRemoteSources?.website ?? [];
  const website = websites.find((entry) => entry.url === trimmedLabel && entry.content.trim());
  if (website) {
    return {
      title: "Website",
      subtitle: website.url,
      content: website.content,
    };
  }

  const confluence = options.cachedRemoteSources?.confluence;
  if (confluence?.content?.trim()) {
    const pageBody = findLabeledChunkBody(confluence.content, trimmedLabel);
    if (pageBody) {
      return {
        title: trimmedLabel,
        subtitle: `Confluence · ${confluence.spaceKey}`,
        content: pageBody,
      };
    }
  }

  // Citation labels include the prefix; map keys are the bare field label.
  const reviewValues = options.reviewFieldValues;
  if (reviewValues) {
    const fieldLabel = trimmedLabel.startsWith(REVIEWED_FIELD_PREFIX)
      ? trimmedLabel.slice(REVIEWED_FIELD_PREFIX.length).trim()
      : trimmedLabel;
    const value = fieldLabel ? reviewValues[fieldLabel]?.trim() ?? "" : "";
    if (fieldLabel && value) {
      return {
        title: fieldLabel,
        subtitle: "From your reviewed answers",
        content: value,
      };
    }
  }

  return null;
}
