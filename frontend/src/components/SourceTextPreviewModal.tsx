import { useEffect, useMemo, useRef, type ReactNode } from "react";

interface SourceTextPreviewModalProps {
  title: string;
  subtitle?: string;
  content: string;
  onClose: () => void;
  /** Optional quote to locate, highlight, and scroll into view. */
  highlightText?: string;
}

interface HighlightRange {
  start: number;
  end: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find the first occurrence of ``needle`` in ``content`` after normalizing
 * whitespace on both sides (excerpts are reflowed through paragraph splitting).
 * Trailing ellipsis characters on the needle are stripped before matching.
 */
function findNormalizedMatch(content: string, needle: string): HighlightRange | null {
  const cleaned = needle.replace(/…$|\.\.\.$/, "").trim();
  if (!cleaned) {
    return null;
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return null;
  }
  const pattern = words.map(escapeRegExp).join("\\s+");
  try {
    const match = new RegExp(pattern, "i").exec(content);
    if (!match) {
      return null;
    }
    return { start: match.index, end: match.index + match[0].length };
  } catch {
    return null;
  }
}

export function SourceTextPreviewModal({
  title,
  subtitle,
  content,
  onClose,
  highlightText,
}: SourceTextPreviewModalProps) {
  const hasContent = content.trim().length > 0;
  const markRef = useRef<HTMLElement | null>(null);

  const highlightRange = useMemo(() => {
    if (!highlightText?.trim() || !hasContent) {
      return null;
    }
    return findNormalizedMatch(content, highlightText);
  }, [content, highlightText, hasContent]);

  useEffect(() => {
    if (!highlightRange || !markRef.current?.scrollIntoView) {
      return;
    }
    markRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightRange]);

  let body: ReactNode;
  if (!hasContent) {
    body = (
      <p className="font-body-md text-body-md text-on-surface-variant">
        No text content available for this source.
      </p>
    );
  } else if (highlightRange) {
    const before = content.slice(0, highlightRange.start);
    const matched = content.slice(highlightRange.start, highlightRange.end);
    const after = content.slice(highlightRange.end);
    body = (
      <pre className="whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface leading-relaxed bg-surface-container-lowest border border-outline-variant rounded-lg p-6">
        {before}
        <mark
          ref={markRef}
          className="bg-primary/25 text-on-surface rounded-sm px-0.5"
        >
          {matched}
        </mark>
        {after}
      </pre>
    );
  } else {
    body = (
      <pre className="whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface leading-relaxed bg-surface-container-lowest border border-outline-variant rounded-lg p-6">
        {content}
      </pre>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex">
      <button
        type="button"
        aria-label="Close preview"
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-text-preview-title"
        className="w-full max-w-3xl bg-surface-container-low h-full shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-lowest shrink-0 gap-4">
          <div className="min-w-0">
            <h2
              id="source-text-preview-title"
              className="font-headline-md text-headline-md text-primary truncate"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5 truncate">
                {subtitle}
              </p>
            )}
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

        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">{body}</div>
      </aside>
    </div>
  );
}
