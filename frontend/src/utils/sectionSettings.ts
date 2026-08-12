export interface SectionSetting {
  order: number;
  included: boolean;
  /** Overrides the default label when set. */
  name?: string;
  /** Overrides the default description when set. */
  description?: string;
  /** When true, the Figures step generates a diagram for this section. */
  needsFigure?: boolean;
}

export type SectionSettingsMap = Record<string, SectionSetting>;

export type CustomSectionMeta = {
  name: string;
  description: string;
};

/**
 * Build default settings for a fixed section id list:
 * order = index, included = true, no name/description overrides.
 */
export function defaultSectionSettings(sectionIds: readonly string[]): SectionSettingsMap {
  const settings: SectionSettingsMap = {};
  sectionIds.forEach((id, index) => {
    settings[id] = { order: index, included: true };
  });
  return settings;
}

/**
 * Sort section ids by settings order, drop excluded ones, and append
 * ids missing from settings at the end (included by default).
 */
export function resolveSectionOrder(
  sectionIds: readonly string[],
  settings: SectionSettingsMap,
): string[] {
  const known: { id: string; order: number }[] = [];
  const missing: string[] = [];

  sectionIds.forEach((id, originalIndex) => {
    const setting = settings[id];
    if (!setting) {
      missing.push(id);
      return;
    }
    if (setting.included === false) {
      return;
    }
    known.push({ id, order: setting.order ?? originalIndex });
  });

  known.sort((a, b) => a.order - b.order);
  return [...known.map((entry) => entry.id), ...missing];
}

/** Prefer trimmed name override; otherwise fallback label. */
export function resolveSectionLabel(
  id: string,
  settings: SectionSettingsMap,
  fallback: string,
): string {
  const override = settings[id]?.name?.trim();
  return override || fallback;
}

/** Prefer trimmed description override; otherwise fallback description. */
export function resolveSectionDescription(
  id: string,
  settings: SectionSettingsMap,
  fallback: string,
): string {
  const override = settings[id]?.description?.trim();
  return override || fallback;
}

/** Ids present in settings but not in the fixed default id list — i.e. user-added sections. */
export function customSectionIds(
  fixedIds: readonly string[],
  settings: SectionSettingsMap,
): string[] {
  return Object.keys(settings).filter((id) => !fixedIds.includes(id));
}

/** Fixed ids plus any user-added custom section ids. */
export function effectiveSectionIds(
  fixedIds: readonly string[],
  settings: SectionSettingsMap,
): string[] {
  return [...fixedIds, ...customSectionIds(fixedIds, settings)];
}

/** Generate a unique, URL/id-safe key for a new user-added section from its display name. */
export function generateCustomSectionId(
  name: string,
  existingIds: readonly string[],
): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "section";
  const base = `custom_${slug}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.includes(candidate)) {
    candidate = `${base}_${suffix++}`;
  }
  return candidate;
}

/** Seed defaults for fixed ids, then overlay saved settings (including custom ids). */
export function seedSectionSettings(
  fixedIds: readonly string[],
  settings: SectionSettingsMap,
): SectionSettingsMap {
  return { ...defaultSectionSettings(fixedIds), ...settings };
}

/** Order all ids (including excluded) by settings.order for editing UIs. */
export function orderAllSectionIds(
  sectionIds: readonly string[],
  settings: SectionSettingsMap,
): string[] {
  return [...sectionIds].sort((a, b) => {
    const orderA = settings[a]?.order ?? sectionIds.indexOf(a);
    const orderB = settings[b]?.order ?? sectionIds.indexOf(b);
    return orderA - orderB;
  });
}

/** Commit row-order + local settings into a persisted SectionSettingsMap. */
export function commitSectionSettings(
  rowOrder: readonly string[],
  localSettings: SectionSettingsMap,
): SectionSettingsMap {
  const next: SectionSettingsMap = {};
  rowOrder.forEach((id, index) => {
    const current = localSettings[id] ?? { order: index, included: true };
    const name = current.name?.trim();
    const description = current.description?.trim();
    next[id] = {
      order: index,
      included: current.included !== false,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(current.needsFigure ? { needsFigure: true } : {}),
    };
  });
  return next;
}

/** Backend custom_sections payload for user-added section ids. */
export function buildCustomSectionsPayload(
  fixedIds: readonly string[],
  settings: SectionSettingsMap,
): Record<string, CustomSectionMeta> {
  const payload: Record<string, CustomSectionMeta> = {};
  for (const id of customSectionIds(fixedIds, settings)) {
    payload[id] = {
      name: resolveSectionLabel(id, settings, id),
      description: settings[id]?.description?.trim() ?? "",
    };
  }
  return payload;
}

/** Backend section_labels payload for every id being exported. */
export function buildSectionLabelsPayload(
  ids: readonly string[],
  settings: SectionSettingsMap,
  defaultLabels: Record<string, string>,
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const id of ids) {
    payload[id] = resolveSectionLabel(id, settings, defaultLabels[id] ?? id);
  }
  return payload;
}
