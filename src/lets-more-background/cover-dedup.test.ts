import { describe, expect, it } from "vitest";
import { booruPostDedupKey, collectHistoryCoverUrls, collectUsedCoverUrls, normalizeCoverAssetPath, normalizeCoverUrl } from "./cover-dedup";

describe("cover deduplication", () => {
  it("normalizes direct and title image URLs", () => {
    expect(normalizeCoverUrl('background-image:url(&quot;https://Safebooru.org/images/1/a.jpg#view&quot;)'))
      .toBe("https://safebooru.org/images/1/a.jpg");
    expect(normalizeCoverUrl("background-image:url(//safebooru.org/images/1/a.jpg)"))
      .toBe("https://safebooru.org/images/1/a.jpg");
    expect(normalizeCoverUrl("assets/cover.webp")).toBeNull();
    expect(normalizeCoverAssetPath('background-image:url("/data/storage/petal/covers/a.webp")'))
      .toBe("storage/petal/covers/a.webp");
  });

  it("canonicalizes booru aliases for post identity deduplication", () => {
    expect(booruPostDedupKey("sb", 42)).toBe(booruPostDedupKey("safebooru.org", 42));
  });

  it("collects remote cover sources from current and legacy attributes", () => {
    const urls = collectUsedCoverUrls([
      { name: "custom-damophus-cover-source-url", value: "https://safebooru.org/images/1/a.jpg" },
      { name: "title-img", value: "background-image:url('https://safebooru.org/images/2/b.jpg')" },
      { name: "title-img", value: "background-image:url('assets/local.webp')" },
      { name: "unrelated", value: "https://example.com/not-a-cover.jpg" },
    ]);

    expect([...urls]).toEqual([
      "https://safebooru.org/images/1/a.jpg",
      "https://safebooru.org/images/2/b.jpg",
    ]);
  });

  it("collects remote cover urls from history entries including removed or replaced covers", () => {
    const urls = collectHistoryCoverUrls([
      { imageUrl: "https://safebooru.org/images/3/c.jpg" },
      { imageUrl: "background-image:url('https://safebooru.org/images/4/d.jpg')" },
      { imageUrl: "https://safebooru.org/images/3/c.jpg#view" },
      { imageUrl: "assets/local.webp" },
      { imageUrl: "data:image/png;base64,xxx" },
      { imageUrl: "" },
      {},
    ]);

    expect([...urls]).toEqual([
      "https://safebooru.org/images/3/c.jpg",
      "https://safebooru.org/images/4/d.jpg",
    ]);
  });

  it("retains original sources and post identities when a cover is stored locally", () => {
    const urls = collectHistoryCoverUrls([
      {
        imageUrl: "assets/more-background/cover.webp",
        sourceUrl: "https://safebooru.org/images/5/original.jpg",
        site: "safebooru.org",
        postId: "500",
      },
    ]);
    expect(urls).toEqual(new Set([
      "https://safebooru.org/images/5/original.jpg",
      booruPostDedupKey("safebooru.org", "500"),
    ]));
  });

  it("includes persisted post metadata from locally stored current covers", () => {
    const urls = collectUsedCoverUrls([
      { block_id: "doc-1", name: "title-img", value: "background-image:url('assets/cover.webp')" },
      { block_id: "doc-1", name: "custom-damophus-post-site", value: "safebooru.org" },
      { block_id: "doc-1", name: "custom-damophus-post-id", value: "501" },
    ]);
    expect(urls).toEqual(new Set([booruPostDedupKey("safebooru.org", "501")]));
  });
});
