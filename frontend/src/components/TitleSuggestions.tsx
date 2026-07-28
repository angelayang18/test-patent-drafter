export function SuggestTitlesButton({
  onClick,
  loading,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={loading || disabled}
      onClick={onClick}
      className="flex items-center gap-2 text-secondary font-label-sm text-label-sm hover:underline disabled:opacity-50"
    >
      <span className={`material-symbols-outlined text-[16px] ${loading ? "loading-spin" : ""}`}>
        title
      </span>
      {loading ? "Suggesting..." : "Suggest titles"}
    </button>
  );
}

export function TitleSuggestionsList({
  suggestions,
  onSelect,
  enforceMaxLength = false,
  maxLength = 500,
}: {
  suggestions: string[];
  onSelect: (title: string) => void;
  enforceMaxLength?: boolean;
  maxLength?: number;
}) {
  return (
    <fieldset className="mt-2 space-y-2">
      <legend className="font-label-sm text-label-sm text-on-surface-variant mb-1">
        Suggested titles — select one
      </legend>
      <ul className="space-y-2">
        {suggestions.map((title, index) => {
          const tooLong = enforceMaxLength && title.length > maxLength;
          const display = tooLong ? `${title.slice(0, maxLength)}…` : title;
          return (
            <li key={`${index}-${title.slice(0, 32)}`}>
              <button
                type="button"
                onClick={() => onSelect(title)}
                className="w-full text-left px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-low hover:border-secondary hover:bg-secondary/5 transition-colors"
              >
                <span className="font-body-md text-body-md text-on-surface">{display}</span>
                {tooLong && (
                  <span className="block mt-1 font-body-sm text-body-sm text-error">
                    Exceeds {maxLength} characters — will be truncated on select ({title.length} chars)
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
