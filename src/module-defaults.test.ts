import { describe, expect, it } from "vitest";

const modulePlugins = import.meta.glob("./lets-*/plugin.ts", {
  eager: true,
  import: "default",
}) as Record<string, { name?: string; enabled?: boolean }>;

describe("sub-module default switches", () => {
  it("keeps every module disabled by default for fresh installs", () => {
    const entries = Object.entries(modulePlugins);
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, metadata] of entries) {
      expect(metadata.enabled, `${path} must default to disabled`).toBe(false);
    }
  });
});
