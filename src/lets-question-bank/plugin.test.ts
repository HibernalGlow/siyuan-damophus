import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("question bank plugin settings", () => {
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
});
