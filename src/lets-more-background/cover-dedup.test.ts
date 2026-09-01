import { describe, expect, it } from "vitest";
import { booruPostDedupKey, collectCacheIndexCoverUrls, collectHistoryCoverUrls, collectTitleImageRows, collectUsedCoverUrls, coverDedupIdentity, normalizeCoverAssetPath, normalizeCoverUrl } from "./cover-dedup";

describe("cover deduplication", () => {
  it("normalizes direct and title image URLs", () => {
    expect(normalizeCoverUrl('background-image:url(&quot;https://Safebooru.org/images/1/a.jpg#view&quot;)'))
      .toBe("https://safebooru.org/images/1/a.jpg");
    expect(normalizeCoverUrl("background-image:url(//safebooru.org/images/1/a.jpg)"))
      .toBe("https://safebooru.org/images/1/a.jpg");
    expect(normalizeCoverUrl("assets/cover.webp")).toBeNull();
    expect(normalizeCoverAssetPath('background-image:url("/data/storage/petal/covers/a.webp")'))
      .toBe("storage/petal/covers/a.webp");
    expect(normalizeCoverAssetPath("http://127.0.0.1:6806/assets/covers/a.webp"))
      .toBe("assets/covers/a.webp");
    expect(normalizeCoverAssetPath("https://localhost:6806/data/assets/covers/a.webp"))
      .toBe("assets/covers/a.webp");
    expect(normalizeCoverAssetPath("https://0t5shl10-6806.jpe1.devtunnels.ms/assets/covers/a.webp"))
      .toBe("assets/covers/a.webp");
    expect(coverDedupIdentity("http://127.0.0.1:6806/assets/covers/a.webp"))
      .toBe(coverDedupIdentity("assets/covers/a.webp"));
    expect(coverDedupIdentity('background-image:url("/data/assets/covers/A.webp")'))
      .toBe("asset:assets/covers/a.webp");
  });

  it("canonicalizes booru aliases for post identity deduplication", () => {
    expect(booruPostDedupKey("sb", 42)).toBe(booruPostDedupKey("safebooru.org", 42));
  });

  it("extracts native title images from document IAL rows", () => {
    expect(collectTitleImageRows([
      {
        block_id: "doc-1",
        ial: '{: id="doc-1" title-img="background-image:url(&quot;assets/covers/used.webp&quot;)" type="doc"}',
      },
      { block_id: "doc-2", ial: '{: id="doc-2" custom-title-img="https://example.com/legacy.jpg"}' },
      { block_id: "doc-3", ial: '{: id="doc-3" title="No cover"}' },
    ])).toEqual([
      { block_id: "doc-1", name: "title-img", value: "background-image:url(&quot;assets/covers/used.webp&quot;)" },
      { block_id: "doc-2", name: "custom-title-img", value: "https://example.com/legacy.jpg" },
    ]);
  });

  it("collects remote and local cover identities from current and legacy attributes", () => {
    const urls = collectUsedCoverUrls([
      { name: "custom-damophus-cover-source-url", value: "https://safebooru.org/images/1/a.jpg" },
      { name: "title-img", value: "background-image:url('https://safebooru.org/images/2/b.jpg')" },
      { name: "title-img", value: "background-image:url('assets/local.webp')" },
      { name: "unrelated", value: "https://example.com/not-a-cover.jpg" },
    ]);

    expect([...urls]).toEqual([
      "https://safebooru.org/images/1/a.jpg",
      "https://safebooru.org/images/2/b.jpg",
      "asset:assets/local.webp",
    ]);
  });

  it("collects remote cover urls from history entries including removed or replaced covers", () => {
    const urls = collectHistoryCoverUrls([
      { imageUrl: "https://safebooru.org/images/3/c.jpg" },
      { imageUrl: "background-image:url('https://safebooru.org/images/4/d.jpg')" },
      { imageUrl: "https://safebooru.org/images/3/c.jpg#view" },
      { imageUrl: "/data/assets/local.webp" },
      { imageUrl: "data:image/png;base64,xxx" },
      { imageUrl: "" },
      {},
    ]);

    expect([...urls]).toEqual([
      "https://safebooru.org/images/3/c.jpg",
      "https://safebooru.org/images/4/d.jpg",
      "asset:assets/local.webp",
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
      "asset:assets/more-background/cover.webp",
      "https://safebooru.org/images/5/original.jpg",
      booruPostDedupKey("safebooru.org", "500"),
    ]));
  });

  it("normalizes loopback source URLs in history to local asset identities", () => {
    const urls = collectHistoryCoverUrls([{
      imageUrl: "assets/covers/a.webp",
      sourceUrl: "http://127.0.0.1:6806/assets/covers/a.webp",
    }]);
    expect(urls).toEqual(new Set(["asset:assets/covers/a.webp"]));
  });

  it("includes persisted post metadata from locally stored current covers", () => {
    const urls = collectUsedCoverUrls([
      { block_id: "doc-1", name: "title-img", value: "background-image:url('assets/cover.webp')" },
      { block_id: "doc-1", name: "custom-damophus-post-site", value: "safebooru.org" },
      { block_id: "doc-1", name: "custom-damophus-post-id", value: "501" },
    ]);
    expect(urls).toEqual(new Set([
      "asset:assets/cover.webp",
      booruPostDedupKey("safebooru.org", "501"),
    ]));
  });

  it("collects discarded covers from the persistent local cache index", () => {
    const urls = collectCacheIndexCoverUrls([{
      path: "/data/storage/petal/siyuan-damophus/more-background/covers/2026/08/7b43ccca.webp",
      sourceUrl: "https://safebooru.org/images/4149/fe1473f1c20f01fcf72b64bee2a209f6ec8236c7.jpg",
      site: "safebooru.org",
      postId: 6623505,
    }]);

    expect(urls).toEqual(new Set([
      "asset:storage/petal/siyuan-damophus/more-background/covers/2026/08/7b43ccca.webp",
      "https://safebooru.org/images/4149/fe1473f1c20f01fcf72b64bee2a209f6ec8236c7.jpg",
      booruPostDedupKey("safebooru.org", 6623505),
    ]));
  });
});
