import { afterEach, describe, expect, it, vi } from "vitest";

import { UnifiedEntryPoint } from "./unified-entry-point";

describe("UnifiedEntryPoint mobile Dock registration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes a disabled Dock from the mobile plugin menu and registers it again when enabled", () => {
    vi.stubGlobal("document", {
      documentElement: { dataset: { frontend: "mobile" } },
    });
    const docks: Record<string, unknown> = {};
    const addDock = vi.fn((dock: { type: string; config: unknown }) => {
      const key = `siyuan-damophus${dock.type}`;
      docks[key] = { config: dock.config };
      return docks[key];
    });
    const entry = new UnifiedEntryPoint({
      id: "mobile-dock-test",
      title: "Mobile Dock test",
      icon: "iconTest",
      execute: vi.fn(),
      dock: {
        type: "mobile-dock-test",
        config: {
          position: "RightBottom",
          size: { width: 240, height: 0 },
          icon: "iconTest",
          title: "Mobile Dock test",
        },
        data: {},
        init: vi.fn(),
      },
    }, {
      name: "siyuan-damophus",
      docks,
      addCommand: vi.fn(),
      addDock,
    } as never);

    entry.registerDock();
    expect(Object.keys(docks)).toEqual(["siyuan-damophusmobile-dock-test"]);

    entry.setSurfaces({ dock: false });
    expect(Object.keys(docks)).toEqual([]);

    entry.setSurfaces({ dock: true });
    expect(Object.keys(docks)).toEqual(["siyuan-damophusmobile-dock-test"]);
    expect(addDock).toHaveBeenCalledTimes(2);
  });
});
