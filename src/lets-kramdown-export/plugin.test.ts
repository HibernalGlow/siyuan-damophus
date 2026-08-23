import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("Kramdown export settings", () => {
  it("uses portable IAL by default", () => {
    expect(pluginMetadata.settings?.find((setting) => setting.key === "ialMode")?.value).toBe("portable");
  });
});
