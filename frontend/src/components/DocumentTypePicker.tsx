import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link } from "react-router-dom";
import { DOCUMENT_TYPES } from "../constants/documentTypes";

/** Routes for document types that already have workflows. Others are "Coming soon". */
const DOCUMENT_TYPE_ROUTES: Record<string, string> = {
  PATENT_PROVISIONAL: "/",
  GRANT_APPLICATION: "/grant",
};

/** Display labels that match the legacy header tabs for live workflows. */
const DOCUMENT_TYPE_DISPLAY_LABELS: Record<string, string> = {
  PATENT_PROVISIONAL: "Patent Drafter",
};

interface DocumentTypePickerProps {
  activeDocumentTypeId: string;
}

function displayLabel(id: string, fallback: string): string {
  return DOCUMENT_TYPE_DISPLAY_LABELS[id] ?? fallback;
}

export function DocumentTypePicker({ activeDocumentTypeId }: DocumentTypePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const activeConfig =
    DOCUMENT_TYPES.find((config) => config.id === activeDocumentTypeId) ?? DOCUMENT_TYPES[0];
  const activeLabel = displayLabel(activeConfig.id, activeConfig.label);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstEnabled = listRef.current?.querySelector<HTMLElement>(
      '[role="option"]:not([aria-disabled="true"])',
    );
    firstEnabled?.focus();
  }, [open]);

  const focusOptionAt = (index: number) => {
    const options = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!options?.length) return;
    const clamped = ((index % options.length) + options.length) % options.length;
    options[clamped]?.focus();
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLUListElement>) => {
    const options = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    if (!options?.length) return;
    const currentIndex = Array.from(options).indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOptionAt(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOptionAt(currentIndex <= 0 ? options.length - 1 : currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOptionAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOptionAt(options.length - 1);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        className="flex items-center gap-2 rounded-lg border border-on-primary/20 bg-primary-container/10 px-3 py-2 font-label-md text-label-md text-on-primary transition-all hover:bg-primary-container/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="whitespace-nowrap">
          Document type: <span className="font-medium">{activeLabel}</span>
        </span>
        <span
          className="material-symbols-outlined text-[18px] opacity-80"
          aria-hidden="true"
        >
          {open ? "expand_less" : "expand_more"}
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label="Document type"
          className="absolute left-0 top-full z-50 mt-1 min-w-full w-72 rounded-lg border border-outline-variant bg-surface py-1 shadow-lg"
          onKeyDown={onListKeyDown}
        >
          {DOCUMENT_TYPES.map((config) => {
            const route = DOCUMENT_TYPE_ROUTES[config.id];
            const enabled = Boolean(route);
            const selected = config.id === activeDocumentTypeId;
            const label = displayLabel(config.id, config.label);
            const optionClass = `flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left font-label-md text-label-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-secondary ${
              selected
                ? "bg-secondary/15 text-on-surface"
                : enabled
                  ? "text-on-surface hover:bg-surface-container"
                  : "cursor-not-allowed text-on-surface/45"
            }`;

            if (!enabled) {
              return (
                <li key={config.id} role="presentation">
                  <div
                    role="option"
                    aria-selected={selected}
                    aria-disabled="true"
                    tabIndex={-1}
                    className={optionClass}
                  >
                    <span>{label}</span>
                    <span className="shrink-0 rounded bg-surface-container px-2 py-0.5 text-[11px] uppercase tracking-wide text-on-surface/55">
                      Coming soon
                    </span>
                  </div>
                </li>
              );
            }

            return (
              <li key={config.id} role="presentation">
                <Link
                  to={route}
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  className={optionClass}
                  onClick={() => setOpen(false)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setOpen(false);
                      (event.currentTarget as HTMLAnchorElement).click();
                    }
                  }}
                >
                  <span>{label}</span>
                  {selected && (
                    <span className="material-symbols-outlined text-[18px] text-secondary" aria-hidden="true">
                      check
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
