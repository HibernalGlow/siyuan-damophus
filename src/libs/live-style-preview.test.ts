import { describe, expect, it } from "vitest";
import { mergeLivePreviewValues, updateLivePreviewOverride } from "./live-style-preview";

describe("live style preview state", () => {
  it("keeps persisted values immutable while applying transient overrides", () => {
    const items = [{ key: "radius", value: 3 }];
    const overrides = updateLivePreviewOverride({}, { key: "radius", value: 8 });
    expect(mergeLivePreviewValues(items, overrides)).toEqual({ radius: 8 });
    expect(items[0].value).toBe(3);
  });
});
