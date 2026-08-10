import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * Vertical border widths in px. With `box-sizing: border-box` (Tailwind
 * preflight), `style.height` includes borders while `scrollHeight` does not,
 * so the applied height must add these back or the last line can clip.
 */
function verticalBorderWidth(el: HTMLTextAreaElement): number {
  const style = window.getComputedStyle(el);
  return (
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0)
  );
}

export function AutoResizeTextarea({
  value,
  onChange,
  className = "",
  ...props
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse first so scrollHeight reflects full content, not the current box.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + verticalBorderWidth(el)}px`;
  }, []);

  // Measure before paint when value changes so the first frame is not clipped.
  useLayoutEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  // Re-measure when the field's width changes (split-pane, sibling chrome,
  // responsive layout). A narrower width wraps an extra line (~line-height)
  // without changing `value`, so a value-only effect leaves height one line short.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    // Track content-box width only. Height changes from adjustHeight must not
    // re-enter (that would loop via collapse-to-auto), but width changes must.
    let lastWidth: number | null = null;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.getBoundingClientRect().width;
      if (lastWidth !== null && Math.abs(width - lastWidth) < 0.5) return;
      lastWidth = width;
      adjustHeight();
    });
    observer.observe(el);

    // Web fonts can change metrics/wrapping after the first layout.
    const fontsReady = document.fonts?.ready;
    if (fontsReady) {
      void fontsReady.then(() => {
        if (ref.current) adjustHeight();
      });
    }

    return () => observer.disconnect();
  }, [adjustHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(event) => {
        onChange?.(event);
        requestAnimationFrame(adjustHeight);
      }}
      className={`overflow-hidden resize-none ${className}`}
      {...props}
    />
  );
}
