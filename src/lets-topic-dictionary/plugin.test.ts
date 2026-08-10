import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("topic dictionary plugin metadata", () => {
  it("keeps scan-on-open opt-in disabled by default", () => {
    expect(pluginMetadata.settings?.find((setting) => setting.key === "autoScanOnOpen"))
      .toMatchObject({type: "checkbox", value: false});
  });
});
