import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";
import { collectPluginSettings } from "@/libs/plugin-declarations";

describe("question bank plugin settings", () => {
  it("declares separate centrally managed desktop and mobile Dock entries", () => {
    const entrySettings = pluginMetadata.settings.filter(
      (setting) => setting.entryManagement === "central",
    );

    expect(entrySettings.map((setting) => [setting.entrySurface, setting.value])).toEqual([
      ["menu", true],
      ["contextMenu", true],
      ["desktopDock", true],
      ["mobileDock", true],
      ["command", true],
      ["tab", true],
    ]);
  });

  it("defaults source navigation to focused question blocks", () => {
    expect(pluginMetadata.settings.find((setting) => setting.key === "sourceNavigationMode")).toMatchObject({
      type: "select",
      value: "focus",
      options: {
        focus: "lets-question-bank.sourceNavigationModeFocus",
        document: "lets-question-bank.sourceNavigationModeDocument",
      },
    });
  });

  it("declares source-answer masking as a deeply nested plugin-menu setting", () => {
    const setting = collectPluginSettings(pluginMetadata)
      .find((item) => item.key === "maskSourceAnswers");
    expect(setting).toMatchObject({ type: "checkbox", value: false, menu: true });
    expect(pluginMetadata.declarations?.[0].children?.[0].children?.[0].id)
      .toBe("sourceAnswerVisibility");
  });
});
