import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

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
});
