import { describe, expect, it } from "vitest";
import {
  normalizeSourceEmbedHeadingMode,
  sourceBlockProtyleActions,
  sourceEmbedBlockAttributes,
} from "./source-embed-presentation";

describe("source embed presentation", () => {
  it("does not request Protyle focus actions or load all sibling blocks", () => {
    expect(sourceBlockProtyleActions).toEqual([]);
    expect(sourceBlockProtyleActions).not.toContain("cb-get-focus");
    expect(sourceBlockProtyleActions).not.toContain("cb-get-all");
  });

  it("hides per-result breadcrumbs and keeps heading content visible", () => {
    expect(sourceEmbedBlockAttributes()).toEqual({
      breadcrumb: "false",
      "custom-heading-mode": "0",
    });
  });

  it("maps configurable breadcrumb and heading modes to native block attributes", () => {
    expect(sourceEmbedBlockAttributes({ breadcrumb: true, headingMode: "2" })).toEqual({
      breadcrumb: "true",
      "custom-heading-mode": "2",
    });
    expect(normalizeSourceEmbedHeadingMode("invalid")).toBe("0");
  });
});
