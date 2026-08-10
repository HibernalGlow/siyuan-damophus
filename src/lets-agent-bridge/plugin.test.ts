import { describe, expect, it } from "vitest";
import pluginMetadata from "./plugin";

describe("Agent Bridge metadata", () => {
  it("is disabled by default", () => {
    expect(pluginMetadata.enabled).toBe(false);
  });
});
