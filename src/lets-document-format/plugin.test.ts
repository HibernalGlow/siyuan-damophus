import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("document format settings", () => {
  it("does not persist the container cleanup choice", () => {
    expect(pluginMetadata.settings?.some((setting) => setting.key === "removeContainerParagraphs")).toBe(false);
  });

  it("lets users toggle both cleanup tools", () => {
    expect(pluginMetadata.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "enableEmptyParagraphCleanup", value: true }),
      expect.objectContaining({ key: "enableSelfReferenceCleanup", value: true }),
    ]));
  });
});
