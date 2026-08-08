import { describe, expect, it, vi } from "vitest";
import {
  actionAppearsOn,
  executeConfiguredAction,
  normalizeConfiguredActions,
  type ActionRuntime,
} from "./actions";

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
