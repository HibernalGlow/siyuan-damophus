import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("layout actions plugin metadata", () => {
  it("declares centrally managed menu, desktop Dock, and command capabilities", () => {
    const entrySettings = pluginMetadata.settings?.filter((setting) => setting.entryManagement === "central");

    expect(entrySettings?.map((setting) => [setting.entrySurface, setting.value])).toEqual([
      ["menu", true],
      ["desktopDock", true],
      ["command", true],
    ]);
    expect(pluginMetadata.settings?.some((setting) => setting.key === "showDock")).toBe(false);
  });
});
