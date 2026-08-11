import { describe, expect, it, vi } from "vitest";
import {
  actionAppearsOn,
  executeConfiguredAction,
  normalizeConfiguredActions,
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
    expect(actions.every((action) => actionAppearsOn(action, "menu"))).toBe(true);
    expect(actions.some((action) => actionAppearsOn(action, "dock"))).toBe(false);
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
      enabled: true,
    }]);
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
    const base = { id: "a", title: "Action", icon: "iconMenu", placement: "menu" as const, enabled: true };

    expect(executeConfiguredAction({ ...base, kind: "system", value: "syncNow" }, host)).toBe(true);
    expect(executeConfiguredAction({ ...base, kind: "plugin", value: "plugin::example::open" }, host)).toBe(true);
    expect(executeConfiguredAction({ ...base, kind: "editor", value: "editor::general::switchReadonly" }, host)).toBe(true);

    expect(host.executeSystem).toHaveBeenCalledWith("syncNow");
    expect(host.executePlugin).toHaveBeenCalledWith("example", "open");
    expect(host.getEditorHotkey).toHaveBeenCalledWith("general", "switchReadonly");
    expect(host.simulateHotkey).toHaveBeenCalledWith("Ctrl+Alt+L");
  });
});
