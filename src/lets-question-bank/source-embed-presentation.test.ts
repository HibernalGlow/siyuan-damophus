import { describe, expect, it } from "vitest";
import {
  normalizeSourceEmbedHeadingMode,
  sourceBlockEditorMode,
  sourceBlockProtyleActions,
  sourceEmbedBlockAttributes,
} from "./source-embed-presentation";

describe("source embed presentation", () => {
  it("loads the complete focused block subtree without forcing focus", () => {
    expect(sourceBlockProtyleActions).toEqual(["cb-get-all"]);
    expect(sourceBlockProtyleActions).not.toContain("cb-get-focus");
  });

  it("keeps source blocks in editable WYSIWYG mode", () => {
    expect(sourceBlockEditorMode).toBe("wysiwyg");
    expect(sourceBlockEditorMode).not.toBe("preview");
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
