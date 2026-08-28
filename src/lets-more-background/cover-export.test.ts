import { describe, expect, it } from "vitest";
import { groupCurrentCoverRows } from "./cover-export";

describe("cover export grouping", () => {
  it("groups current cover attributes by document block", () => {
    const entries = groupCurrentCoverRows([
      { block_id: "doc-b", name: "title-img", value: 'background-image:url("assets/b.webp")' },
      { block_id: "doc-b", name: "custom-damophus-cover-source-url", value: "https://safebooru.org/images/2/b.jpg" },
      { block_id: "doc-b", name: "custom-damophus-post-site", value: "safebooru.org" },
      { block_id: "doc-b", name: "custom-damophus-post-id", value: "202" },
      { block_id: "doc-a", name: "title-img", value: 'background-image:url("https://safebooru.org/images/1/a.jpg")' },
      { block_id: "doc-a", name: "custom-damophus-post-tags", value: "scenery night_sky" },
      { block_id: "doc-no-cover", name: "custom-damophus-post-site", value: "safebooru.org" },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].blockId).toBe("doc-a");
    expect(entries[0].titleImg).toContain("https://safebooru.org/images/1/a.jpg");
    expect(entries[0].tags).toEqual(["scenery", "night_sky"]);

    expect(entries[1].blockId).toBe("doc-b");
    expect(entries[1].sourceUrl).toBe("https://safebooru.org/images/2/b.jpg");
    expect(entries[1].site).toBe("safebooru.org");
    expect(entries[1].postId).toBe("202");
  });

  it("ignores rows without a title image attribute", () => {
    const entries = groupCurrentCoverRows([
      { block_id: "doc-a", name: "custom-damophus-post-site", value: "safebooru.org" },
      { block_id: "doc-a", name: "custom-damophus-post-id", value: "1" },
    ]);
    expect(entries).toEqual([]);
  });
});
