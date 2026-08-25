import { describe, expect, it } from "vitest";
import { collectHistoryCoverUrls, collectUsedCoverUrls, normalizeCoverUrl } from "./cover-dedup";

describe("cover deduplication", () => {
  it("normalizes direct and title image URLs", () => {
    expect(normalizeCoverUrl('background-image:url(&quot;https://Safebooru.org/images/1/a.jpg#view&quot;)'))
      .toBe("https://safebooru.org/images/1/a.jpg");
    expect(normalizeCoverUrl("assets/cover.webp")).toBeNull();
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
});
