import type { CommunityDocumentTypeTemplate } from "../services/api";
import type { CustomSectionDef } from "./documentTypeTemplates";

export interface CreateDocumentTypeSeed {
  name: string;
  description?: string;
  sections: CustomSectionDef[];
  basedOn: string;
}

/** Map community template sections into local CustomSectionDef shape. */
export function communitySectionsToCustom(
  sections: CommunityDocumentTypeTemplate["sections"],
): CustomSectionDef[] {
  return (Array.isArray(sections) ? sections : [])
    .map((section, index) => {
      const name = typeof section.name === "string" ? section.name.trim() : "";
      const id =
        typeof section.id === "string" && section.id.trim()
          ? section.id.trim()
          : name
            ? `section_${index}`
            : "";
      if (!id || !name) return null;
      return {
        id,
        name,
        description: typeof section.description === "string" ? section.description : "",
        order: typeof section.order === "number" ? section.order : index,
      };
    })
    .filter((section): section is CustomSectionDef => section !== null)
    .sort((a, b) => a.order - b.order)
    .map((section, index) => ({ ...section, order: index }));
}

/** Display label for who shared a community template. */
export function sharedByLabel(createdByName: string | undefined): string {
  const name = createdByName?.trim() || "Teammate";
  return `Shared by ${name}`;
}
