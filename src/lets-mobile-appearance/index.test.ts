import { beforeEach, describe, expect, it, vi } from "vitest";

const { addTopBar, remove } = vi.hoisted(() => ({
  addTopBar: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../utils", () => ({
  isMobile: true,
  plugin: { addTopBar },
}));

vi.mock("./appearance-menu", () => ({
  openMobileAppearanceMenu: vi.fn(),
}));

import MobileAppearancePlugin from "./index";

describe("mobile appearance module lifecycle", () => {
  beforeEach(() => {
    addTopBar.mockReset();
    remove.mockReset();
    addTopBar.mockReturnValue({ remove });
    vi.stubGlobal("window", {
      siyuan: { languages: { appearanceMode: "Appearance mode" } },
    });
  });

  it("owns one mobile top bar entry and removes it when disabled", () => {
    const module = new MobileAppearancePlugin();

    module.onLayoutReady();
    module.onLayoutReady();

    expect(addTopBar).toHaveBeenCalledOnce();
    expect(addTopBar).toHaveBeenCalledWith(expect.objectContaining({
      icon: "iconTheme",
      title: "Appearance mode",
      position: "right",
    }));

    module.onunload();
    expect(remove).toHaveBeenCalledOnce();
  });
});
