import { describe, expect, it } from "vitest";
import {
  isBooruSource,
  parseBooruUri,
  extractBooruImageUrl,
  extractImageUrlFromPost,
  cleanArtistTag,
  matchesCondition,
  findSiteCredential,
} from "./booru";
import { resolveSite, sites } from "@himeka/booru";

describe("booru API client, condition templates & ratio filter", () => {
  it("detects booru sources accurately", () => {
    expect(isBooruSource("booru:safebooru?tags=wallpaper")).toBe(true);
    expect(isBooruSource("booru:sb?tags=wallpaper")).toBe(true);
    expect(isBooruSource("https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1")).toBe(true);
    expect(isBooruSource("https://picsum.photos/1920/1080")).toBe(false);
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
});

