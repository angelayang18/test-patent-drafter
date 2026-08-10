/**
 * Two-tier empty-core-fields warning used on Review pages.
 * - all empty: blocking-style error (Next is typically disabled by the page)
 * - some empty: advisory warning that draft quality may improve
 */
export function ReviewEmptyFieldsBanner({
  allCoreFieldsEmpty,
  someCoreFieldsEmpty,
  detailNoun,
}: {
  allCoreFieldsEmpty: boolean;
  someCoreFieldsEmpty: boolean;
  /** Singular noun for the all-empty message, e.g. "invention detail". */
  detailNoun: string;
}) {
  return (
    <>
      {allCoreFieldsEmpty && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-error-container/20 text-error border border-error/30 font-body-sm text-body-sm"
        >
          Please fill in at least one {detailNoun} before drafting.
        </div>
      )}
      {someCoreFieldsEmpty && (
        <div className="p-4 rounded-lg bg-secondary/10 text-on-surface border border-secondary/30 font-body-sm text-body-sm">
          Some {detailNoun}s are still empty. You can continue, but draft quality may improve if
          you fill in the remaining fields.
        </div>
      )}
    </>
  );
}

/** Compute all-empty / some-empty flags from a list of core field string values. */
export function computeCoreFieldEmptiness(values: string[]): {
  allCoreFieldsEmpty: boolean;
  someCoreFieldsEmpty: boolean;
} {
  const filledCount = values.filter((value) => value.trim().length > 0).length;
  return {
    allCoreFieldsEmpty: filledCount === 0,
    someCoreFieldsEmpty: filledCount > 0 && filledCount < values.length,
  };
}
