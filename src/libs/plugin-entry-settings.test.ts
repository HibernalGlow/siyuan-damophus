import { describe, expect, it } from "vitest";
import { createEntrySettings, entrySettingKey, resolveEntrySetting } from "./plugin-entry-settings";

describe("plugin entry settings", () => {
  it("creates only the surfaces declared by a module", () => {
    const settings = createEntrySettings({ menu: true, tab: false });

    expect(settings.map((setting) => [setting.key, setting.value])).toEqual([
      ["entryMenu", true],
      ["entryTab", false],
    ]);
  });

  it("resolves persisted values while preserving the declared default", () => {
    expect(entrySettingKey("command")).toBe("entryCommand");
    expect(resolveEntrySetting(() => undefined, "dock", false)).toBe(false);
    expect(resolveEntrySetting(() => true, "dock", false)).toBe(true);
  });
});
