import { beforeEach, describe, expect, it, vi } from "vitest";

const { addTopBar, remove, onEvent, offEvent } = vi.hoisted(() => ({
  addTopBar: vi.fn(),
  remove: vi.fn(),
  onEvent: vi.fn(),
  offEvent: vi.fn(),
}));

vi.mock("../utils", () => ({
  isMobile: true,
  plugin: {
    addTopBar,
    eventBus: {
      on: onEvent,
      off: offEvent,
    },
  },
}));

vi.mock("./appearance-menu", () => ({
  openMobileAppearanceMenu: vi.fn(),
}));

import MobileAppearancePlugin from "./index";

describe("mobile appearance module lifecycle", () => {
  beforeEach(() => {
    addTopBar.mockReset();
    remove.mockReset();
    onEvent.mockReset();
    offEvent.mockReset();
    addTopBar.mockReturnValue({ remove });
    vi.stubGlobal("window", {
      siyuan: { languages: { appearanceMode: "Appearance mode" } },
    });
    const mockElement = {
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      append: vi.fn(),
      before: vi.fn(),
      insertAdjacentElement: vi.fn(),
      remove: vi.fn(),
      classList: {
        contains: vi.fn(() => false),
        add: vi.fn(),
        remove: vi.fn(),
      },
      style: {},
    };

    vi.stubGlobal("document", {
      documentElement: { dataset: { frontend: "mobile" } },
      body: { append: vi.fn() },
      head: { append: vi.fn() },
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null),
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({ ...mockElement })),
    });
  });

  it("owns one mobile top bar entry and removes it when disabled", () => {
    const module = new MobileAppearancePlugin();
    module.getSetting = vi.fn(() => true);

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

  it("skips top bar shortcut when topBarShortcut setting is disabled", () => {
    const module = new MobileAppearancePlugin();
    module.getSetting = vi.fn((key: string) => (key === "topBarShortcut" ? false : true));

    module.onLayoutReady();

    expect(addTopBar).not.toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalled();
  });

  it("skips title path listeners when titlePath setting is disabled", () => {
    const module = new MobileAppearancePlugin();
    module.getSetting = vi.fn((key: string) => (key === "titlePath" ? false : true));

    module.onLayoutReady();

    expect(addTopBar).toHaveBeenCalledOnce();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("dynamically toggles sub-features when onDataChanged is triggered", () => {
    let topBarEnabled = true;
    let titlePathEnabled = true;
    const module = new MobileAppearancePlugin();
    module.getSetting = vi.fn((key: string) => {
      if (key === "topBarShortcut") return topBarEnabled;
      if (key === "titlePath") return titlePathEnabled;
      return true;
    });

    module.onLayoutReady();
    expect(addTopBar).toHaveBeenCalledOnce();
    expect(onEvent).toHaveBeenCalledTimes(2);

    // Disable topBar and titlePath
    topBarEnabled = false;
    titlePathEnabled = false;
    module.onDataChanged();

    expect(remove).toHaveBeenCalledOnce();
    expect(offEvent).toHaveBeenCalledTimes(2);

    // Re-enable topBar
    topBarEnabled = true;
    module.onDataChanged();
    expect(addTopBar).toHaveBeenCalledTimes(2);
  });
});
