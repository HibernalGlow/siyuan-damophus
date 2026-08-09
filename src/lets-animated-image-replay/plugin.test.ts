import { describe, expect, it } from "vitest";
import metadata from "./plugin";

describe("animated image replay settings", () => {
  it("does not expose still-frame interception settings", () => {
    expect(metadata.settings?.some((setting) => setting.key === "initialFrame")).toBe(false);
  });
});
