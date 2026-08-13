import { describe, expect, it } from "vitest";
import {
  mergeSlashMenuItems,
  parseSlashMenuConfig,
  reorderSlashMenuConfig,
  serializeSlashMenuConfig,
} from "./slash-menu-settings";

describe("slash menu settings", () => {
  it("preserves configured order and appends newly discovered commands", () => {
    const config = parseSlashMenuConfig('[{"id":"b","visible":false,"display":"full"}]');
    const merged = mergeSlashMenuItems([
      { id: "a", label: "A", hasIcon: true },
      { id: "b", label: "B", hasIcon: true },
      { id: "c", label: "C", hasIcon: false },
    ], config);
    expect(merged).toEqual([
      { id: "b", visible: false, display: "full" },
      { id: "a", visible: true, display: "icon" },
      { id: "c", visible: true, display: "full" },
    ]);
    expect(parseSlashMenuConfig(serializeSlashMenuConfig(merged))).toEqual(merged);
  });

  it("does not allow icon-only defaults for separators or text-only entries", () => {
    const merged = mergeSlashMenuItems([
      { id: "separator_1", label: "Separator", hasIcon: false, separator: true },
      { id: "custom", label: "Custom", hasIcon: false },
    ], []);
    expect(merged.every((item) => item.display === "full")).toBe(true);
  });

  it("moves only within bounds", () => {
    const config = [
      { id: "a", visible: true, display: "full" as const },
      { id: "b", visible: true, display: "full" as const },
    ];
    expect(reorderSlashMenuConfig(config, 1, -1).map((item) => item.id)).toEqual(["b", "a"]);
    expect(reorderSlashMenuConfig(config, 0, -1)).toBe(config);
  });
});
