import { describe, expect, it } from "vitest";
import { convertSfpConfig } from "./sfp-migration";
import { DEFAULT_FLASHCARD_SETTINGS } from "./types";

describe("SFP configuration migration", () => {
  it("converts categories, groups, query-first and automation settings while dropping cache", () => {
    const result = convertSfpConfig({
      groupCategories: [{ id: "law", name: "Law" }],
      groups: [{ id: "tag", name: "Tags", sqlQuery: "SELECT id FROM blocks", categoryId: "law", queryFirst: true, priority: 80, enabled: true, priorityEnabled: true }],
      cacheUpdateInterval: 45,
      scanInterval: 10,
      postponeDays: 3,
      postponeEnabled: true,
      priorityScanEnabled: true,
      priorityScanInterval: 20,
    }, DEFAULT_FLASHCARD_SETTINGS);

    expect(result.settings.categories).toEqual([{ id: "law", name: "Law" }]);
    expect(result.settings.groups[0]).toMatchObject({ id: "tag", categoryId: "law", queryFirst: true, cacheMinutes: 45, priority: 80 });
    expect(result.settings.postponeEnabled).toBe(true);
    expect(result.settings.priorityScanInterval).toBe(20);
    expect(result.enabledGroupCount).toBe(1);
  });
});
