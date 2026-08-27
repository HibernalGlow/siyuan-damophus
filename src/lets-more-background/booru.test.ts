import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBooruSource,
  parseBooruUri,
  extractBooruImageUrl,
  extractImageUrlFromPost,
  cleanArtistTag,
  matchesCondition,
  findSiteCredential,
  resolveBooruImageInfo,
  parseBooruPostUrl,
  resolveManualBooruUrl,
} from "./booru";
import { resolveSite, sites } from "@himeka/booru";
import { booruPostDedupKey } from "./cover-dedup";

describe("booru API client, condition templates & ratio filter", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses the kernel proxy for Safebooru API responses", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        code: 0,
        data: {
          status: 200,
          body: JSON.stringify([{
            id: 42,
            file_url: "https://safebooru.org/images/42/test.jpg",
            sample_url: "https://safebooru.org/samples/42/test.jpg",
            width: 1920,
            height: 1080,
            score: 50,
            tags: "scenery wallpaper",
          }],
          ),
        },
      }),
    } as Response);

    const resolved = await resolveBooruImageInfo("booru:sb?tags=scenery&ratio=wide&min_score=30");

    expect(resolved?.imageUrl).toBe("https://safebooru.org/images/42/test.jpg");
    expect(fetchMock).toHaveBeenCalledWith("/api/network/forwardProxy", expect.objectContaining({ method: "POST" }));
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.url).toContain("safebooru.org/index.php?page=dapi");
    expect(request.responseEncoding).toBe("text");
  });

  it("excludes image URLs that are already used as title covers", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        code: 0,
        data: {
          status: 200,
          body: JSON.stringify([
            {
              id: 41,
              file_url: "https://safebooru.org/images/41/used.jpg",
              width: 1920,
              height: 1080,
              score: 50,
              tags: "scenery wallpaper",
            },
            {
              id: 42,
              file_url: "https://safebooru.org/images/42/fresh.jpg",
              width: 1920,
              height: 1080,
              score: 50,
              tags: "scenery wallpaper",
            },
          ]),
        },
      }),
    } as Response);

    const resolved = await resolveBooruImageInfo(
      "booru:sb?tags=scenery&ratio=wide&min_score=30",
      undefined,
      undefined,
      new Set(["https://safebooru.org/images/41/used.jpg"]),
    );

    expect(resolved?.imageUrl).toBe("https://safebooru.org/images/42/fresh.jpg");
    expect(resolved?.diagnostic?.rejectedByDuplicate).toBe(1);
  });

  it("excludes a previously used post when its current cover is stored locally", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        code: 0,
        data: {
          status: 200,
          body: JSON.stringify([
            { id: 41, file_url: "https://safebooru.org/images/41/used.jpg", width: 1920, height: 1080, score: 50, tags: "scenery" },
            { id: 42, file_url: "https://safebooru.org/images/42/fresh.jpg", width: 1920, height: 1080, score: 50, tags: "scenery" },
          ]),
        },
      }),
    } as Response);

    const resolved = await resolveBooruImageInfo(
      "booru:sb?tags=scenery",
      undefined,
      undefined,
      new Set([booruPostDedupKey("safebooru.org", 41)!]),
    );

    expect(resolved?.postId).toBe(42);
    expect(resolved?.diagnostic?.rejectedByDuplicate).toBe(1);
  });

  it("detects booru sources accurately", () => {
    expect(isBooruSource("booru:safebooru?tags=wallpaper")).toBe(true);
    expect(isBooruSource("booru:sb?tags=wallpaper")).toBe(true);
    expect(isBooruSource("https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1")).toBe(true);
    expect(isBooruSource("https://picsum.photos/1920/1080")).toBe(false);
  });

  it("parses compatible manual Booru post links", () => {
    expect(parseBooruPostUrl("https://safebooru.org/index.php?page=post&s=view&id=123"))
      .toEqual({ site: "safebooru.org", postId: "123", postUrl: "https://safebooru.org/index.php?page=post&s=view&id=123" });
    expect(parseBooruPostUrl("https://yande.re/post/show/456")?.postId).toBe("456");
    expect(parseBooruPostUrl("https://example.com/images/123/photo.jpg")).toBeNull();
  });

  it("resolves a manual Safebooru post URL and returns metadata", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        code: 0,
        data: {
          status: 200,
          body: JSON.stringify({
            id: 123,
            file_url: "https://safebooru.org/images/1/manual.jpg",
            width: 1920,
            height: 1080,
            score: 8,
            tags: "scenery wallpaper",
          }),
        },
      }),
    } as Response);
    const resolved = await resolveManualBooruUrl("https://safebooru.org/index.php?page=post&s=view&id=123");
    expect(resolved).toMatchObject({
      imageUrl: "https://safebooru.org/images/1/manual.jpg",
      postId: 123,
      site: "safebooru.org",
      tags: ["scenery", "wallpaper"],
      width: 1920,
      height: 1080,
    });
  });

  it("cleans @ and spaces from artist tags", () => {
    expect(cleanArtistTag("@ask (askzy)")).toBe("ask_(askzy)");
    expect(cleanArtistTag("@blade (galaxist)")).toBe("blade_(galaxist)");
    expect(cleanArtistTag("gsusart")).toBe("gsusart");
  });

  it("parses ratio filter and candidate pools", () => {
    const parsed = parseBooruUri(
      "booru:sb?ratio=landscape&min_score=10&pool=@ask (askzy),blade_(galaxist),chomoran",
    );
    expect(parsed.aspectRatio).toBe("landscape");
    expect(parsed.minScore).toBe(10);
    expect(parsed.pool).toEqual(["ask_(askzy)", "blade_(galaxist)", "chomoran"]);
  });

  it("filters posts by aspect ratio condition", () => {
    const landscapePost = { width: 1920, height: 1080, score: 15 };
    const portraitPost = { width: 1080, height: 1920, score: 20 };
    const squarePost = { width: 1000, height: 1000, score: 5 };

    expect(matchesCondition(landscapePost, "landscape")).toBe(true);
    expect(matchesCondition(portraitPost, "landscape")).toBe(false);
    expect(matchesCondition(squarePost, "landscape")).toBe(true); // ratio >= 1.0

    expect(matchesCondition(landscapePost, "wide")).toBe(true); // 1.77 >= 1.33
    expect(matchesCondition(squarePost, "wide")).toBe(false); // 1.0 < 1.33

    expect(matchesCondition(landscapePost, "any", 20)).toBe(false); // score 15 < 20
    expect(matchesCondition(portraitPost, "any", 20)).toBe(true);
  });

  it("resolves aliases through @himeka/booru", () => {
    expect(resolveSite("sb")).toBe("safebooru.org");
    expect(resolveSite("db")).toBe("danbooru.donmai.us");
    expect(resolveSite("yd")).toBe("yande.re");
    expect(resolveSite("kc")).toBe("konachan.com");
    expect(resolveSite("gb")).toBe("gelbooru.com");
    expect(sites["safebooru.org"]).toBeDefined();
  });

  it("extracts image URL with ratio conditioning", () => {
    const mixed = [
      { file_url: "https://safebooru.org/images/1/portrait.png", width: 800, height: 1200 },
      { file_url: "https://safebooru.org/images/2/landscape.png", width: 1920, height: 1080 },
    ];
    const picked = extractBooruImageUrl(mixed, "https://safebooru.org", "landscape");
    expect(picked).toBe("https://safebooru.org/images/2/landscape.png");
  });

  it("extracts image URL from Post object", () => {
    const mockPost: any = {
      fileUrl: "https://safebooru.org/images/999/pic.png",
      sampleUrl: "https://safebooru.org/samples/999/sample.png",
    };
    expect(extractImageUrlFromPost(mockPost)).toBe("https://safebooru.org/images/999/pic.png");
  });

  it("matches site credential by domain or alias", () => {
    const creds = [
      { id: "1", site: "danbooru.donmai.us", login: "testuser", apiKey: "secretkey", enabled: true },
      { id: "2", site: "gelbooru.com", login: "12345", apiKey: "gelkey", enabled: false },
    ];
    const match1 = findSiteCredential("db", creds);
    expect(match1?.login).toBe("testuser");
    expect(match1?.apiKey).toBe("secretkey");

    const match2 = findSiteCredential("gelbooru.com", creds);
    expect(match2).toBeUndefined(); // disabled
  });

  it("handles Danbooru image_width and image_height properties in matchesCondition", () => {
    const danbooruWide = { image_width: 2560, image_height: 1440, score: 10 };
    const danbooruPortrait = { image_width: 1080, image_height: 1920, score: 10 };

    expect(matchesCondition(danbooruWide, "wide")).toBe(true);
    expect(matchesCondition(danbooruWide, "landscape")).toBe(true);
    expect(matchesCondition(danbooruPortrait, "wide")).toBe(false);
    expect(matchesCondition(danbooruPortrait, "landscape")).toBe(false);
    expect(matchesCondition(danbooruPortrait, "portrait")).toBe(true);
  });

  it("parses quality/preview options in parseBooruUri", () => {
    expect(parseBooruUri("booru:sb?quality=sample").quality).toBe("sample");
    expect(parseBooruUri("booru:sb?quality=preview").quality).toBe("preview");
    expect(parseBooruUri("booru:sb?preview=true").quality).toBe("preview");
    expect(parseBooruUri("booru:sb?quality=original").quality).toBe("original");
  });

  it("parses time_range and score in parseBooruUri", () => {
    const parsed = parseBooruUri("booru:safebooru.org?time_range=30d&min_score=10");
    expect(parsed.timeRange).toBe("30d");
    expect(parsed.minScore).toBe(10);
  });

  it("filters posts by time range and score in matchesCondition", () => {
    const recentPost = {
      width: 1920,
      height: 1080,
      score: 15,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    };
    const oldPost = {
      width: 1920,
      height: 1080,
      score: 15,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
    };
    const lowScoreRecentPost = {
      width: 1920,
      height: 1080,
      score: 2,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    };

    expect(matchesCondition(recentPost, "landscape", 10, "7d")).toBe(true);
    expect(matchesCondition(oldPost, "landscape", 10, "7d")).toBe(false); // too old for 7d
    expect(matchesCondition(oldPost, "landscape", 10, "90d")).toBe(true); // within 90d
    expect(matchesCondition(lowScoreRecentPost, "landscape", 10, "7d")).toBe(false); // score 2 < 10
  });

  it("handles custom user date expressions (year ranges, open-ended, absolute dates)", () => {
    const post2021 = { width: 1920, height: 1080, createdAt: new Date("2021-06-15T12:00:00Z") };
    const post2023 = { width: 1920, height: 1080, createdAt: new Date("2023-08-20T12:00:00Z") };
    const post2025 = { width: 1920, height: 1080, createdAt: new Date("2025-01-10T12:00:00Z") };

    // 1. '2023+'
    expect(matchesCondition(post2021, "any", undefined, "2023+")).toBe(false);
    expect(matchesCondition(post2023, "any", undefined, "2023+")).toBe(true);
    expect(matchesCondition(post2025, "any", undefined, "2023+")).toBe(true);

    // 2. '2022..2024'
    expect(matchesCondition(post2021, "any", undefined, "2022..2024")).toBe(false);
    expect(matchesCondition(post2023, "any", undefined, "2022..2024")).toBe(true);
    expect(matchesCondition(post2025, "any", undefined, "2022..2024")).toBe(false);

    // 3. '>= 2024-01-01'
    expect(matchesCondition(post2023, "any", undefined, ">= 2024-01-01")).toBe(false);
    expect(matchesCondition(post2025, "any", undefined, ">= 2024-01-01")).toBe(true);

    // 4. '2023'
    expect(matchesCondition(post2021, "any", undefined, "2023")).toBe(false);
    expect(matchesCondition(post2023, "any", undefined, "2023")).toBe(true);
    expect(matchesCondition(post2023, "any", undefined, "2023")).toBe(true);
    expect(matchesCondition(post2025, "any", undefined, "2023")).toBe(false);
  });

  it("parses blacklist tags from URI and filters out blacklisted posts", () => {
    const parsed = parseBooruUri("booru:sb?tags=scenery&blacklist=grayscale,gay,two_males");
    expect(parsed.blacklist).toEqual(["grayscale", "gay", "two_males"]);

    const cleanPost = {
      width: 1920,
      height: 1080,
      tags: ["scenery", "sky", "clouds", "1girl"],
    };
    const grayscalePost = {
      width: 1920,
      height: 1080,
      tags: ["scenery", "monochrome", "grayscale"],
    };
    const danbooruGayPost = {
      image_width: 1920,
      image_height: 1080,
      tag_string: "scenery 2boys gay two_males outdoors",
    };

    const blacklist = ["grayscale", "gay", "two_males"];

    expect(matchesCondition(cleanPost, "landscape", undefined, "any", blacklist)).toBe(true);
    expect(matchesCondition(grayscalePost, "landscape", undefined, "any", blacklist)).toBe(false);
    expect(matchesCondition(danbooruGayPost, "landscape", undefined, "any", blacklist)).toBe(false);
  });
});
