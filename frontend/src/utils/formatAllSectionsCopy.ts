/** Concatenate section titles and content for clipboard export. */
export function formatAllSectionsCopy(
  sectionIds: readonly string[],
  sectionLabels: Record<string, string>,
  sections: Record<string, string>,
  activeSection: string,
  activeDraftText: string,
): string {
  return sectionIds
    .map((id) => {
      const content = (id === activeSection ? activeDraftText : sections[id] ?? "").trim();
      const label = sectionLabels[id] ?? id;
      return `## ${label}\n\n${content}`;
    })
    .join("\n\n");
}
