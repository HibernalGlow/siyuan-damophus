import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("document format settings", () => {
  it("removes empty container paragraphs by default", () => {
    expect(pluginMetadata.settings?.find((setting) => setting.key === "removeContainerParagraphs")?.value).toBe(true);
  });
});
