import { beforeEach, describe, expect, it, vi } from "vitest";

const { menuItems, fullscreen, fetchPost } = vi.hoisted(() => ({
  menuItems: [] as Array<Record<string, unknown>>,
  fullscreen: vi.fn(),
  fetchPost: vi.fn(),
}));

vi.mock("siyuan", () => ({
  fetchPost,
  Menu: class {
    addItem(item: Record<string, unknown>) {
      menuItems.push(item);
    }

    fullscreen() {
      fullscreen();
    }
  },
}));

import { openMobileAppearanceMenu } from "./appearance-menu";

describe("mobile appearance shortcut", () => {
  beforeEach(() => {
    menuItems.length = 0;
    fullscreen.mockClear();
    fetchPost.mockClear();
    vi.stubGlobal("window", {
      matchMedia: vi.fn(() => ({ matches: true })),
      siyuan: {
        config: {
          appearance: { mode: 1, modeOS: false, themeDark: "midnight" },
        },
        languages: {
          themeLight: "Light",
          themeDark: "Dark",
          themeOS: "Follow system",
        },
      },
    });
  });

  it("opens all native appearance choices and applies the selected mode", () => {
    openMobileAppearanceMenu();

    expect(menuItems.map((item) => item.label)).toEqual(["Light", "Dark", "Follow system"]);
    expect(menuItems.map((item) => item.current)).toEqual([false, true, false]);
    expect(fullscreen).toHaveBeenCalledOnce();

    (menuItems[0].click as () => void)();
    expect(fetchPost).toHaveBeenLastCalledWith("/api/setting/setAppearance", {
      mode: 0,
      modeOS: false,
      themeDark: "midnight",
    });

    (menuItems[2].click as () => void)();
    expect(fetchPost).toHaveBeenLastCalledWith("/api/setting/setAppearance", {
      mode: 1,
      modeOS: true,
      themeDark: "midnight",
    });
  });
});
