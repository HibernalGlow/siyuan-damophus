import type { SettingCategoryId } from "@/libs/setting-categories";

export const SETTINGS_NAV_STATE_KEY = "uiSettingsNavigation";

export interface SettingsNavState {
  /** Sidebar category id -> expanded. Missing entries count as expanded. */
  sidebarExpanded?: Record<string, boolean>;
  /** Switch-settings category id -> expanded. Missing entries count as expanded. */
  switchesExpanded?: Record<string, boolean>;
  /** Category ids in the user's preferred order. Unknown ids append at the end. */
  categoryOrder?: string[];
  /** Category id -> module keys in the user's preferred order. Unknown keys append at the end. */
  moduleOrder?: Record<string, string[]>;
}

export function parseSettingsNavState(raw: unknown): SettingsNavState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const candidate = raw as Record<string, unknown>;
  return {
    sidebarExpanded: isBooleanRecord(candidate.sidebarExpanded) ? candidate.sidebarExpanded : undefined,
    switchesExpanded: isBooleanRecord(candidate.switchesExpanded) ? candidate.switchesExpanded : undefined,
    categoryOrder: isStringArray(candidate.categoryOrder) ? candidate.categoryOrder : undefined,
    moduleOrder: isStringArrayRecord(candidate.moduleOrder) ? candidate.moduleOrder : undefined,
  };
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((entry) => typeof entry === "boolean");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(isStringArray);
}

/**
 * Order ids by the stored preference. Ids missing from the preference keep
 * their relative order and append after the known ones, so newly added
 * modules/categories never disappear.
 */
export function orderByPreference(ids: string[], preference: string[] | undefined): string[] {
  if (!preference || preference.length === 0) return ids;
  const position = new Map(preference.map((id, index) => [id, index]));
  return [...ids].sort((a, b) => {
    const aKnown = position.get(a);
    const bKnown = position.get(b);
    if (aKnown === undefined && bKnown === undefined) return 0;
    if (aKnown === undefined) return 1;
    if (bKnown === undefined) return -1;
    return aKnown - bKnown;
  });
}

export function applyNavOrder<T extends { id: SettingCategoryId | string; groups: string[] }>(
  categories: T[],
  state: SettingsNavState,
): T[] {
  const orderedCategories = orderByPreference(
    categories.map((category) => category.id),
    state.categoryOrder,
  );
  const byId = new Map(categories.map((category) => [category.id, category]));
  return orderedCategories
    .map((id) => byId.get(id as SettingCategoryId))
    .filter((category): category is T => Boolean(category))
    .map((category) => ({
      ...category,
      groups: orderByPreference(category.groups, state.moduleOrder?.[category.id]),
    }));
}

/** Move `draggedId` directly before `targetId`; appends when targetId is null. */
export function moveBefore(ids: string[], draggedId: string, targetId: string | null): string[] {
  const remaining = ids.filter((id) => id !== draggedId);
  if (targetId === null || targetId === draggedId) return [...remaining, draggedId];
  const index = remaining.indexOf(targetId);
  if (index < 0) return [...remaining, draggedId];
  return [...remaining.slice(0, index), draggedId, ...remaining.slice(index)];
}
