import { describe, expect, it } from "vitest";
import { nearestHeadingId, normalizeSelectedText } from "./style-brush";

describe("same-text format painter", () => {
  it("removes SiYuan zero-width separators without changing visible text", () => {
    expect(normalizeSelectedText("same\u200b text")).toBe("same text");
  });

  it("uses the selected heading or nearest breadcrumb heading", () => {
    const breadcrumbs = [
      { id: "20260812090000-aaaaaaa", type: "NodeDocument" },
      { id: "20260812090001-bbbbbbb", type: "NodeHeading" },
      { id: "20260812090002-ccccccc", type: "NodeParagraph" },
    ];
    expect(nearestHeadingId("20260812090001-bbbbbbb", true, breadcrumbs))
      .toBe("20260812090001-bbbbbbb");
    expect(nearestHeadingId("20260812090002-ccccccc", false, breadcrumbs))
      .toBe("20260812090001-bbbbbbb");
    expect(nearestHeadingId("20260812090002-ccccccc", false, [], "20260812090003-ddddddd"))
      .toBe("20260812090003-ddddddd");
  });
});
