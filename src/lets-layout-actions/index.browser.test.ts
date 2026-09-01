import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import LayoutActionsPlugin from "./index";
import { PANEL_LAYOUT_ICONS } from "./icons";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("layout action Dock registration", () => {
  it("registers every Dock-assigned action as its own direct entry", () => {
    type RegisteredDock = {
      type: string;
      config: { title: string; icon: string; position: string };
    };
    const addDock = vi.fn((_dock: RegisteredDock) => ({ config: {} as never, model: {} as never }));
    const addIcons = vi.fn();
    setPlugin({
      name: "siyuan-damophus",
      app: {},
      commands: [],
      docks: {},
      addCommand: vi.fn(),
      addDock,
      addIcons,
    });

    const settings = new Map<string, unknown>([
      ["entryCommand", false],
      ["entryDesktopDock", true],
      ["dockPosition", "LeftTop"],
      ["actions", [
        {
          id: "collapse-left",
          title: "Collapse left sidebar",
          icon: PANEL_LAYOUT_ICONS.switchLeftDock,
          kind: "system",
          value: "switchLeftDock",
          placement: "dock",
          enabled: true,
        },
        {
          id: "sync-now",
          title: "Sync now",
          icon: "iconSync",
          kind: "system",
          value: "syncNow",
          placement: "both",
          enabled: true,
        },
        {
          id: "menu-only",
          title: "Menu only",
          icon: "iconMenu",
          kind: "system",
          value: "noop",
          placement: "menu",
          enabled: true,
        },
      ]],
    ]);
    const module = new LayoutActionsPlugin();
    module.enabled = true;
    module.getSetting = (key) => settings.get(key);
    module.t = (key) => key;

    module.onload();

    expect(addIcons).toHaveBeenCalledOnce();
    expect(addDock).toHaveBeenCalledTimes(2);
    expect(addDock.mock.calls.map(([dock]) => ({
      type: dock.type,
      title: dock.config.title,
      icon: dock.config.icon,
      position: dock.config.position,
    }))).toEqual([
      {
        type: expect.stringMatching(/^damophus-layout-action-collapse-left-/),
        title: "Collapse left sidebar",
        icon: PANEL_LAYOUT_ICONS.switchLeftDock,
        position: "LeftTop",
      },
      {
        type: expect.stringMatching(/^damophus-layout-action-sync-now-/),
        title: "Sync now",
        icon: "iconSync",
        position: "LeftTop",
      },
    ]);

    module.onunload();
  });

  it("skips mobile-only actions when registering desktop Docks", () => {
    type RegisteredDock = { type: string };
    const addDock = vi.fn((_dock: RegisteredDock) => ({ config: {} as never, model: {} as never }));
    setPlugin({
      name: "siyuan-damophus",
      app: {},
      commands: [],
      docks: {},
      addCommand: vi.fn(),
      addDock,
      addIcons: vi.fn(),
    });

    const settings = new Map<string, unknown>([
      ["entryCommand", false],
      ["entryDesktopDock", true],
      ["dockPosition", "LeftTop"],
      ["actions", [
        {
          id: "mobile-only",
          title: "Mobile only",
          icon: "iconPhone",
          kind: "system",
          value: "syncNow",
          placement: "dock",
          platform: "mobile",
          enabled: true,
        },
      ]],
    ]);
    const module = new LayoutActionsPlugin();
    module.enabled = true;
    module.getSetting = (key) => settings.get(key);
    module.t = (key) => key;

    module.onload();

    expect(addDock).not.toHaveBeenCalled();
    module.onunload();
  });
});
