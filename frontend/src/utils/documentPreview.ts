import { GRANT_SECTION_IDS, GRANT_SECTION_LABELS, PATENT_SECTION_IDS } from "../types/patent";

export const DOCUMENT_SECTION_ORDER = [
  "cross_reference",
  "field",
  "background",
  "summary",
  "brief_description_of_drawings",
  "description",
  "claims",
  "abstract",
] as const;

export const DOCUMENT_SECTION_TITLES: Record<string, string> = {
  cross_reference: "CROSS-REFERENCE TO RELATED APPLICATIONS",
  field: "FIELD",
  background: "BACKGROUND",
  summary: "SUMMARY",
  brief_description_of_drawings: "BRIEF DESCRIPTION OF THE DRAWINGS",
  description: "DETAILED DESCRIPTION",
  claims: "CLAIMS",
  abstract: "ABSTRACT",
};

export const SECTIONS_REQUIRING_PAGE_BREAK_BEFORE = new Set(["claims", "abstract"]);

export const STATIC_SECTION_KEYS = new Set(["cross_reference"]);

export function crossReferenceBody(filingInfo?: { related_applications?: string } | null): string {
  const related = filingInfo?.related_applications?.trim();
  return related || "Not Applicable.";
}

const HEADING_RE = /^#{1,6}\s+/gm;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const BULLET_RE = /^[\-*•]\s+/gm;
const ORDERED_BULLET_RE = /^\d+\.\s+/;
const WRAPPED_INTERNAL_TAG_RE = /%%([^%]+)%%\s*/g;
const INTERNAL_DELIMITER_TAG_RE = /%%([a-zA-Z][a-zA-Z0-9_]*)/g;
const TEMPLATE_PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;
const SUBSECTION_TITLE_RUN_IN_RE =
  /(^|\n)(\d+\.\s+)([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5})(\s+)(?=(?:The|A|An|Each|This|Unlike|Upon|In|Each|Where)\s)/gm;
const LIST_ITEM_WITH_TITLE_RE = /^(\d+\.\s+)([^:]+):\s+(.+)$/s;
const LIST_ITEM_WITH_EMDASH_TITLE_RE = /^(\d+\.\s+)(.+?)\s*[—–-]\s*(.+)$/s;

/** Normalize LLM/source-artifact markup into readable patent prose. */
export function sanitizePatentProse(text: string): string {
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned.replace(WRAPPED_INTERNAL_TAG_RE, (_match, inner: string) => `${inner.trim()}: `);
  cleaned = cleaned.replace(INTERNAL_DELIMITER_TAG_RE, "$1");
  cleaned = cleaned.replace(TEMPLATE_PLACEHOLDER_RE, "");
  cleaned = cleaned.replace(SUBSECTION_TITLE_RUN_IN_RE, "$1$2$3\n\n");
  cleaned = cleaned.replace(/[ \t]+\./g, ".");
  cleaned = cleaned.replace(/  +/g, " ");
  cleaned = cleaned.replace(/ *\n *\n */g, "\n\n");
  return cleaned.trim();
}

/** @deprecated Use sanitizePatentProse */
export function sanitizeInternalDelimiterTags(text: string): string {
  return sanitizePatentProse(text);
}

export function parseNumberedListItemHeader(
  paragraph: string,
): { prefix: string; title: string; body: string; separator: string } | null {
  const trimmed = paragraph.trim();
  let match = trimmed.match(LIST_ITEM_WITH_TITLE_RE);
  let separator = ": ";
  if (!match) {
    match = trimmed.match(LIST_ITEM_WITH_EMDASH_TITLE_RE);
    separator = " — ";
  }
  if (!match) {
    return null;
  }
  const prefix = match[1];
  const title = match[2].trim();
  const body = match[3].trim();
  if (!title || !body || title.length > 80) {
    return null;
  }
  return { prefix, title, body, separator };
}

export function stripMarkdown(text: string): string {
  let cleaned = sanitizePatentProse(text);
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  cleaned = cleaned.replace(HEADING_RE, "");
  cleaned = cleaned.replace(BOLD_RE, "$1");
  cleaned = cleaned.replace(ITALIC_RE, "$1");
  cleaned = cleaned.replace(INLINE_CODE_RE, "$1");
  cleaned = cleaned.replace(BULLET_RE, "");
  return cleaned.trim();
}

export function splitParagraphs(text: string): string[] {
  const normalized = stripMarkdown(text);
  if (!normalized) return [];

  const blocks = normalized.split(/\n\s*\n/);
  const paragraphs: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;

    if (lines.every((line) => ORDERED_BULLET_RE.test(line))) {
      paragraphs.push(...lines);
      continue;
    }

    if (lines.length === 1) {
      paragraphs.push(lines[0]);
      continue;
    }

    let current = lines[0];
    for (const line of lines.slice(1)) {
      if (ORDERED_BULLET_RE.test(line)) {
        paragraphs.push(current);
        current = line;
      } else if (current.endsWith("-") || current.endsWith("—")) {
        current = current.slice(0, -1) + line;
      } else {
        current = `${current} ${line}`;
      }
    }
    paragraphs.push(current);
  }

  return paragraphs;
}

export function draftPreviewSectionKeys(sections: Record<string, string>): string[] {
  const hasGrantSections = GRANT_SECTION_IDS.some((key) => Boolean(sections[key]?.trim()));
  if (hasGrantSections) {
    return GRANT_SECTION_IDS.filter((key) => Boolean(sections[key]?.trim()));
  }

  return DOCUMENT_SECTION_ORDER.filter(
    (key) =>
      STATIC_SECTION_KEYS.has(key) ||
      (PATENT_SECTION_IDS as readonly string[]).includes(key) ||
      Boolean(sections[key]?.trim()),
  );
}

export function orderedPreviewSectionKeys(sections: Record<string, string>): string[] {
  return draftPreviewSectionKeys(sections).filter(
    (key) => STATIC_SECTION_KEYS.has(key) || Boolean(sections[key]?.trim()),
  );
}

export function sectionDisplayTitle(key: string): string {
  if (key in GRANT_SECTION_LABELS) {
    return GRANT_SECTION_LABELS[key as keyof typeof GRANT_SECTION_LABELS].toUpperCase();
  }
  return DOCUMENT_SECTION_TITLES[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
