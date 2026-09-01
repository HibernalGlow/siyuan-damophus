import { describe, expect, it } from "vitest";
import { normalizeDurationComparisonPosition } from "./duration-comparison-position";

describe("normalizeDurationComparisonPosition", () => {
  it.each(["answer", "rating", "header"] as const)("preserves %s", (position) => {
    expect(normalizeDurationComparisonPosition(position)).toBe(position);
  });

  it.each([undefined, null, "", "unknown"])("defaults %s to rating", (value) => {
    expect(normalizeDurationComparisonPosition(value)).toBe("rating");
  });
});
