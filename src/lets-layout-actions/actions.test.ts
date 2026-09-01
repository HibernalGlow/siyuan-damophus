import { describe, expect, it, vi } from "vitest";
import type { ICommand, Plugin } from "siyuan";
import {
  actionAppearsOn,
  editorCategoryLabel,
  executeConfiguredAction,
  normalizeConfiguredActions,
  pluginCommandLabel,
  systemCommandLabel,
  type ActionRuntime,
} from "./actions";
import { PANEL_LAYOUT_ICONS } from "./icons";

function runtime(): ActionRuntime {
  return {
    executeSystem: vi.fn(),
    executePlugin: vi.fn(() => true),
    getEditorHotkey: vi.fn(() => "Ctrl+Alt+L"),
    simulateHotkey: vi.fn(),
  };
}

describe("configured actions", () => {
  it("uses menu-only layout actions as the default without enabling a Dock", () => {
    const actions = normalizeConfiguredActions(undefined);

    expect(actions.map((action) => action.value)).toEqual([
      "switchLeftDock",
      "switchRightDock",
      "switchBottomDock",
    ]);
    expect(actions.every((action) => actionAppearsOn(action, "menu", "desktop"))).toBe(true);
    expect(actions.every((action) => actionAppearsOn(action, "menu", "mobile"))).toBe(true);
    expect(actions.some((action) => actionAppearsOn(action, "dock", "desktop"))).toBe(false);
  });

  it("normalizes custom values and removes invalid entries", () => {
    expect(normalizeConfiguredActions([
      { title: " Search ", value: " globalSearch ", icon: "#iconSearch", kind: "system", placement: "both" },
      null,
    ])).toEqual([{
      id: "custom-action-1",
      title: "Search",
      value: "globalSearch",
      icon: "iconSearch",
      kind: "system",
      placement: "both",
      platform: "both",
      enabled: true,
    }]);
  });

  it("offers actions only on the configured platform", () => {
    const base = {
      id: "a",
      title: "Action",
      icon: "iconMenu",
      kind: "system" as const,
      value: "syncNow",
      enabled: true,
    };
    const desktopOnly = { ...base, placement: "both" as const, platform: "desktop" as const };
    const mobileOnly = { ...base, placement: "both" as const, platform: "mobile" as const };
    const everywhere = { ...base, placement: "both" as const, platform: "both" as const };

    expect(actionAppearsOn(desktopOnly, "menu", "desktop")).toBe(true);
    expect(actionAppearsOn(desktopOnly, "menu", "mobile")).toBe(false);
    expect(actionAppearsOn(desktopOnly, "dock", "desktop")).toBe(true);

    expect(actionAppearsOn(mobileOnly, "menu", "mobile")).toBe(true);
    expect(actionAppearsOn(mobileOnly, "menu", "desktop")).toBe(false);
    expect(actionAppearsOn(mobileOnly, "dock", "desktop")).toBe(false);

    expect(actionAppearsOn(everywhere, "menu", "desktop")).toBe(true);
    expect(actionAppearsOn(everywhere, "menu", "mobile")).toBe(true);
    expect(actionAppearsOn({ ...everywhere, enabled: false }, "menu", "desktop")).toBe(false);
  });

  it("migrates the original arrow icons to panel-collapse icons", () => {
    const actions = normalizeConfiguredActions([
      { id: "switch-left-dock", title: "Left", value: "switchLeftDock", icon: "iconLeft" },
      { id: "custom", title: "Custom", value: "switchLeftDock", icon: "iconLeft" },
    ]);

    expect(actions[0].icon).toBe(PANEL_LAYOUT_ICONS.switchLeftDock);
    expect(actions[1].icon).toBe("iconLeft");
  });

  it("executes system, plugin, and editor commands through one runtime interface", () => {
    const host = runtime();
    const base = { id: "a", title: "Action", icon: "iconMenu", placement: "menu" as const, platform: "both" as const, enabled: true };

    expect(executeConfiguredAction({ ...base, kind: "system", value: "syncNow" }, host)).toBe(true);
    expect(executeConfiguredAction({ ...base, kind: "plugin", value: "plugin::example::open" }, host)).toBe(true);
    expect(executeConfiguredAction({ ...base, kind: "editor", value: "editor::general::switchReadonly" }, host)).toBe(true);

    expect(host.executeSystem).toHaveBeenCalledWith("syncNow");
    expect(host.executePlugin).toHaveBeenCalledWith("example", "open");
    expect(host.getEditorHotkey).toHaveBeenCalledWith("general", "switchReadonly");
    expect(host.simulateHotkey).toHaveBeenCalledWith("Ctrl+Alt+L");
  });
});

const LANGUAGES: Record<string, string> = {
  syncNow: "立即同步",
  general: "常规",
  element: "元素",
  headings: "标题",
  list1: "列表",
  table: "表格",
};

describe("command option labels", () => {
  it("localizes system commands through the SiYuan language dictionary", () => {
    expect(systemCommandLabel(LANGUAGES, "syncNow")).toBe("立即同步");
    expect(systemCommandLabel(LANGUAGES, "missingKey")).toBe("missingKey");
    expect(systemCommandLabel(undefined, "syncNow")).toBe("syncNow");
  });

  it("maps editor categories to the language keys used by SiYuan's shortcut settings", () => {
    expect(editorCategoryLabel(LANGUAGES, "general")).toBe("常规");
    expect(editorCategoryLabel(LANGUAGES, "insert")).toBe("元素");
    expect(editorCategoryLabel(LANGUAGES, "heading")).toBe("标题");
    expect(editorCategoryLabel(LANGUAGES, "list")).toBe("列表");
    expect(editorCategoryLabel(LANGUAGES, "table")).toBe("表格");
    expect(editorCategoryLabel(LANGUAGES, "unknown")).toBe("unknown");
  });

  it("resolves plugin command names from langText, the plugin i18n dict, then the raw key", () => {
    const item = {
      name: "damophus",
      displayName: "Damophus",
      i18n: { "lets-layout-actions.switchLeft": "切换左侧面板布局" },
    } as unknown as Plugin;
    const commands = [
      { langKey: "lets-layout-actions.switchLeft" },
      { langKey: "lets-layout-actions.switchRight", langText: "Switch right" },
      { langKey: "missingKey" },
    ] as unknown as ICommand[];

    expect(pluginCommandLabel(item, commands[0])).toBe("切换左侧面板布局");
    expect(pluginCommandLabel(item, commands[1])).toBe("Switch right");
    expect(pluginCommandLabel(item, commands[2])).toBe("missingKey");
  });
});
