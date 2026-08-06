import { describe, expect, it } from "vitest";
import {
  sourceBlockProtyleActions,
  sourceEmbedBlockAttributes,
} from "./source-embed-presentation";

describe("source embed presentation", () => {
  it("loads only the focused source block instead of all sibling blocks", () => {
    expect(sourceBlockProtyleActions).toEqual(["cb-get-focus"]);
    expect(sourceBlockProtyleActions).not.toContain("cb-get-all");
  });

  it("hides per-result breadcrumbs and keeps heading content visible", () => {
    expect(sourceEmbedBlockAttributes()).toEqual({
      breadcrumb: "false",
      "custom-heading-mode": "0",
    });
  });
});
