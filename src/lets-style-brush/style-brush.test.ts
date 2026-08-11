import { describe, expect, it } from "vitest";
import {
  matchingStyleBrushTargetIds,
  nearestHeadingId,
  sourceBlockId,
  styleBrushBlockAttrs,
} from "./style-brush";

const source = {
  id: "20260811090000-aaaaaaa",
  type: "p",
  subtype: "",
};

describe("style brush", () => {
  it("requires exactly one explicit source block", () => {
    const element = { dataset: { nodeId: source.id } } as unknown as HTMLElement;

    expect(sourceBlockId([element])).toBe(source.id);
    expect(sourceBlockId([])).toBeUndefined();
    expect(sourceBlockId([element, element])).toBeUndefined();
  });

  it("uses the source heading or the nearest breadcrumb heading", () => {
    const heading = { id: "20260811090001-bbbbbbb", type: "h", subtype: "h2" };
    const nested = { id: "20260811090002-ccccccc", type: "NodeHeading", subtype: "h3" };

    expect(nearestHeadingId(heading, [])).toBe(heading.id);
    expect(nearestHeadingId(source, [heading, nested, source])).toBe(nested.id);
    expect(nearestHeadingId(source, [source])).toBeUndefined();
  });

  it("matches only the same block type and subtype inside the scope", () => {
    const candidates = [
      source,
      { id: "20260811090003-ddddddd", type: "p", subtype: "" },
      { id: "20260811090004-eeeeeee", type: "p", subtype: "quote" },
      { id: "20260811090005-fffffff", type: "h", subtype: "h2" },
      { id: "invalid", type: "p", subtype: "" },
    ];

    expect(matchingStyleBrushTargetIds(source, candidates)).toEqual([
      "20260811090003-ddddddd",
    ]);
    expect(matchingStyleBrushTargetIds(
      source,
      candidates,
      new Set(["20260811090004-eeeeeee"]),
    )).toEqual([]);
  });

  it("builds one batch update without changing the captured style", () => {
    expect(styleBrushBlockAttrs(
      ["20260811090000-aaaaaaa", "20260811090001-bbbbbbb"],
      "color: red;",
    )).toEqual([
      { id: "20260811090000-aaaaaaa", attrs: { style: "color: red;" } },
      { id: "20260811090001-bbbbbbb", attrs: { style: "color: red;" } },
    ]);
  });
});
