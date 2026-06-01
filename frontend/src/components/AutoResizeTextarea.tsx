import { useCallback, useEffect, useRef, type TextareaHTMLAttributes } from "react";

type AutoResizeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

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
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

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
