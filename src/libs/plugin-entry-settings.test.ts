import { describe, expect, it } from "vitest";
import { createEntrySettings, entrySettingKey, resolveEntrySetting } from "./plugin-entry-settings";

describe("plugin entry settings", () => {
  it("creates only the surfaces declared by a module", () => {
    const settings = createEntrySettings({ menu: true, dock: true, tab: false });

    expect(settings.map((setting) => [setting.key, setting.value])).toEqual([
      ["entryMenu", true],
      ["entryDesktopDock", true],
      ["entryMobileDock", true],
      ["entryTab", false],
    ]);
  });

  it("resolves persisted values while preserving the declared default", () => {
    expect(entrySettingKey("command")).toBe("entryCommand");
    expect(resolveEntrySetting(() => undefined, "dock", false)).toBe(false);
    expect(resolveEntrySetting(() => true, "dock", false)).toBe(true);
  });

  it("migrates the legacy shared Dock value to desktop while keeping the mobile default independent", () => {
    const legacySettings = new Map<string, unknown>([["entryDock", false]]);
    expect(resolveEntrySetting((key) => legacySettings.get(key), "desktopDock")).toBe(false);
    expect(resolveEntrySetting((key) => legacySettings.get(key), "mobileDock")).toBe(true);

    legacySettings.set("entryMobileDock", false);
    expect(resolveEntrySetting((key) => legacySettings.get(key), "desktopDock")).toBe(false);
    expect(resolveEntrySetting((key) => legacySettings.get(key), "mobileDock")).toBe(false);
  });
});
