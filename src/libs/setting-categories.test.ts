import { describe, expect, it } from "vitest";
import { buildSettingCategoryGroups, getSettingCategory } from "./setting-categories";

describe("setting categories", () => {
  it("groups modules by user workflow and keeps unknown modules discoverable", () => {
    const categories = buildSettingCategoryGroups([
      { key: "questionBank" },
      { key: "styleBrush" },
      { key: "calloutAppearance" },
      { key: "agentSurface" },
      { key: "futureModule" },
    ], ["switches", "entries", "general"]);

    expect(categories.map((category) => [category.id, category.groups])).toEqual([
      ["core", ["switches", "entries", "general"]],
      ["study", ["questionBank"]],
      ["workflow", ["styleBrush"]],
      ["appearance", ["calloutAppearance"]],
      ["integrations", ["agentSurface"]],
      ["other", ["futureModule"]],
    ]);
  });

  it("uses the other category as a forward-compatible fallback", () => {
    expect(getSettingCategory("unknownModule")).toBe("other");
  });
});
