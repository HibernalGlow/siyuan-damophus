import { describe, expect, it } from "vitest";
import { convertSfpConfig } from "./sfp-migration";
import { DEFAULT_FLASHCARD_SETTINGS } from "./types";

describe("SFP configuration migration", () => {
  it("converts categories and query-first settings while dropping legacy priority automation", () => {
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
    expect(result.settings.groups[0]).toMatchObject({ id: "tag", categoryId: "law", queryFirst: true, cacheMinutes: 45 });
    expect(result.settings.groups[0]).not.toHaveProperty("priority");
    expect(result.settings.groups[0]).not.toHaveProperty("priorityEnabled");
    expect(result.settings.postponeEnabled).toBe(true);
    expect(result.settings).not.toHaveProperty("priorityScanEnabled");
    expect(result.settings).not.toHaveProperty("priorityScanInterval");
    expect(result.enabledGroupCount).toBe(1);
  });
});
