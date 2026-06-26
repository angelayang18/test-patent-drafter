import { useCopyToClipboard } from "../hooks/useCopyToClipboard";

interface CopyToClipboardButtonProps {
  text: string;
  disabled?: boolean;
  onError?: (message: string) => void;
  className?: string;
  /** Labeled button (grant draft) or compact icon button (patent draft). */
  variant?: "labeled" | "icon";
  label?: string;
}

export function CopyToClipboardButton({
  text,
  disabled = false,
  onError,
  className = "",
  variant = "labeled",
  label = "Copy to clipboard",
}: CopyToClipboardButtonProps) {
  const { copy, copied } = useCopyToClipboard();

  const handleClick = async () => {
    const ok = await copy(text);
    if (!ok) {
      onError?.("Could not copy to clipboard.");
    }
  };

  const iconName = copied ? "check" : "content_copy";
  const displayLabel = copied ? "Copied!" : label;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={disabled}
        className={`flex items-center gap-1 ${className}`}
        title={displayLabel}
        aria-label={displayLabel}
      >
        <span className="material-symbols-outlined">{iconName}</span>
        {copied && <span className="text-xs font-label-sm whitespace-nowrap">Copied!</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled}
      className={`${className} ${copied ? "border-green-500 text-green-700 bg-green-50" : ""}`}
      aria-label={displayLabel}
    >
      <span className="material-symbols-outlined text-[18px]">{iconName}</span>
      {displayLabel}
    </button>
  );
}
