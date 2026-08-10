/**
 * Pick the initial Draft active section from an optional `?section=` query value.
 * Falls back to the first section when the param is missing or not in the order.
 */
export function resolveInitialActiveSection(
  sectionIds: readonly string[],
  sectionParam: string | null | undefined,
): string {
  if (sectionParam && sectionIds.includes(sectionParam)) {
    return sectionParam;
  }
  return sectionIds[0] ?? "";
}
