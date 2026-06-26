import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const backClassName =
  "px-6 py-2.5 rounded-lg border border-outline text-on-surface font-label-md text-label-md hover:bg-surface transition-all flex items-center gap-2 active:scale-95";

const nextClassName =
  "px-8 py-2.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary-container shadow-md transition-all flex items-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed";

export function WorkflowBackLink({ to }: { to: string }) {
  return (
    <Link to={to} className={backClassName}>
      <span className="material-symbols-outlined text-[18px]">arrow_back</span>
      Back
    </Link>
  );
}

export function WorkflowNextLink({
  to,
  children,
  onClick,
  disabled,
  disabledTitle,
}: {
  to: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        title={disabledTitle}
        className={nextClassName}
      >
        {children}
        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
      </span>
    );
  }

  return (
    <Link to={to} onClick={onClick} className={nextClassName}>
      {children}
      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
    </Link>
  );
}

export function WorkflowNextButton({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${nextClassName} ${className}`.trim()}
    >
      {children}
      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
    </button>
  );
}
