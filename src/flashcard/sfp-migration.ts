import type { FlashcardGroup, FlashcardSettings } from "./types";

export const SFP_CONFIG_PATH = "/data/storage/petal/Specialized-Flashcard-Plugin/plugin-config.json";

export interface SfpImportPreview {
  settings: FlashcardSettings;
  categoryCount: number;
  groupCount: number;
  enabledGroupCount: number;
  hasAutomation: boolean;
}

function text(value: unknown, fallback: string): string {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const result = Number(value);
  if (!Number.isFinite(result)) return fallback;
  return Math.min(max, Math.max(min, result));
}

/** Convert the SFP 0.2.x config shape without carrying its cache or runtime IDs. */
export function convertSfpConfig(value: unknown, base: FlashcardSettings): SfpImportPreview {
  if (!value || typeof value !== "object") throw new Error("SFP config is not an object");
  const input = value as Record<string, unknown>;
  const categoriesInput = Array.isArray(input.groupCategories) ? input.groupCategories : [];
  const groupsInput = Array.isArray(input.groups) ? input.groups : [];
  const categories = categoriesInput.map((category, index) => {
    const item = category && typeof category === "object" ? category as Record<string, unknown> : {};
    return { id: text(item.id, `sfp-category-${index + 1}`), name: text(item.name, `SFP category ${index + 1}`) };
  });
  const categoryIds = new Set(categories.map((category) => category.id));
  const fallbackCategory = categories[0]?.id ?? base.categories[0]?.id ?? "default";
  if (categories.length === 0) categories.push({ id: fallbackCategory, name: "SFP" });

  const cacheMinutes = finiteNumber(input.cacheUpdateInterval, base.cacheUpdateInterval, 1, 1440);
  const groups: FlashcardGroup[] = groupsInput.map((group, index) => {
    const item = group && typeof group === "object" ? group as Record<string, unknown> : {};
    const categoryId = text(item.categoryId, fallbackCategory);
    return {
      id: text(item.id, `sfp-group-${index + 1}`),
      name: text(item.name, `SFP group ${index + 1}`),
      sqlQuery: text(item.sqlQuery, "SELECT id FROM blocks LIMIT 1"),
      categoryId: categoryIds.has(categoryId) ? categoryId : fallbackCategory,
      enabled: item.enabled !== false,
      queryFirst: item.queryFirst === true,
      cacheMinutes,
      priority: finiteNumber(item.priority, 50, 0, 100),
      priorityEnabled: item.priorityEnabled === true,
    };
  });
  const settings: FlashcardSettings = {
    ...structuredClone(base),
    categories,
    groups,
    cacheUpdateInterval: cacheMinutes,
    scanInterval: finiteNumber(input.scanInterval, base.scanInterval, 1, 1440),
    postponeDays: finiteNumber(input.postponeDays, base.postponeDays, 0, 30),
    postponeEnabled: input.postponeEnabled === true,
    priorityScanEnabled: input.priorityScanEnabled === true,
    priorityScanInterval: finiteNumber(input.priorityScanInterval, base.priorityScanInterval, 1, 1440),
  };
  return {
    settings,
    categoryCount: categories.length,
    groupCount: groups.length,
    enabledGroupCount: groups.filter((group) => group.enabled).length,
    hasAutomation: settings.postponeEnabled || settings.priorityScanEnabled,
  };
}

export async function fetchSfpConfig(fetcher: typeof window.fetch = window.fetch): Promise<unknown> {
  const response = await fetcher("/api/file/getFile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: SFP_CONFIG_PATH }),
  });
  if (!response.ok) throw new Error(`SFP config unavailable (${response.status})`);
  return JSON.parse(await response.text()) as unknown;
}
