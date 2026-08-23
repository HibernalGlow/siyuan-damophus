import { describe, expect, it, vi } from "vitest";
import pluginMetadata from "./plugin";
import FlashcardPlugin from "./index";

describe("flashcard plugin metadata", () => {
  it("declares the settings surface and native review entry points", () => {
    const entrySettings = pluginMetadata.settings?.filter((setting) => setting.entryManagement === "central");

    expect(entrySettings?.map((setting) => [setting.entrySurface, setting.value])).toEqual([
      ["menu", true],
      ["command", true],
      ["desktopDock", true],
      ["mobileDock", true],
      ["tab", true],
    ]);
    expect(pluginMetadata.settings?.some((setting) => setting.key === "openSettingsButton")).toBe(false);
  });

  it("contributes one top-level menu item with review actions as children", () => {
    const addItem = vi.fn();
    const fakePlugin = {
      isEntryEnabled: () => true,
      t: (key: string) => key,
      runtime: { getEnabledGroups: () => [{ name: "含指定标签" }] },
      openSettings: vi.fn(),
      reviewAll: vi.fn(),
      reviewGroup: vi.fn(),
      currentReviewContext: () => undefined,
    };

    FlashcardPlugin.prototype.addMenuItem.call(fakePlugin as never, { addItem } as never);

    expect(addItem).toHaveBeenCalledTimes(1);
    const item = addItem.mock.calls[0][0] as { label: string; submenu?: Array<{ label?: string; type?: string }> };
    expect(item.label).toBe("lets-flashcard.displayName");
    expect(item.submenu?.map((child) => child.type ?? child.label)).toEqual([
      "lets-flashcard.openSettings",
      "lets-flashcard.reviewAll",
      "separator",
      "复习：含指定标签",
    ]);
  });
});
