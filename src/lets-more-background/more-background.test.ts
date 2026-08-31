import { describe, expect, it, vi } from "vitest";
import {
  formatCoverUrl,
  isVideoUrl,
  sanitizeAssetsPath,
  templateToUrl,
  urlToTemplate,
} from "./sources";
import {
  clearCoverHistory,
  clearSeenCovers,
  filterUnusedCoverAssets,
  getCoverHistory,
  getCoverHistoryLimit,
  getLastUsedSource,
  getSeenCovers,
  getSeenCoversLimit,
  initializeCoverDedupStorage,
  recordCoverHistory,
  recordSeenCover,
  removeCoverHistoryEntry,
  setCoverHistoryLimit,
  setLastUsedSource,
  setSeenCoversLimit,
  updateAllLastUsedButtons,
  localCachePath,
  inferCoverSourceFromImage,
  parseCoverPosition,
  normalizeCoverPosition,
  serializeCoverPosition,
  selectCoverPositionFromAttrs,
} from "./more-background";

describe("more-background sources utilities", () => {
  it("normalizes and serializes persisted cover positions", () => {
    expect(parseCoverPosition('background-image:url("cover.jpg");object-position:center 37.5%;')).toBe(37.5);
    expect(parseCoverPosition("center 13.92%")).toBe(13.92);
    expect(parseCoverPosition("50% 13.92%")).toBe(13.92);
    expect(parseCoverPosition("background-position: center -12%;")).toBe(0);
    expect(parseCoverPosition("background-position:center 24px;")).toBeNull();
    expect(normalizeCoverPosition("105")).toBe(100);
    expect(normalizeCoverPosition("not-a-position")).toBeNull();
    expect(serializeCoverPosition(37.567)).toBe("37.57");
    expect(serializeCoverPosition(undefined)).toBeNull();
  });

  it("selects the cover position per platform with mobile-only fallback", () => {
    const attrs = {
      "custom-damophus-cover-position": "33",
      "custom-damophus-cover-position-mobile": "72",
      "title-img": 'background-image:url("cover.jpg");object-position:center 50%;',
    };
    expect(selectCoverPositionFromAttrs(attrs, false)).toBe(33);
    expect(selectCoverPositionFromAttrs(attrs, true)).toBe(72);
    // Without a mobile adjustment the mobile platform falls back to the
    // shared value and never invents one from an empty attribute.
    expect(selectCoverPositionFromAttrs({ "custom-damophus-cover-position": "41" }, true)).toBe(41);
    expect(selectCoverPositionFromAttrs({}, true)).toBeNull();
    // Desktop ignores the mobile attribute entirely.
    expect(selectCoverPositionFromAttrs({ "custom-damophus-cover-position-mobile": "72" }, false)).toBeNull();
    // Both attribute sources missing fall back to the legacy title-img CSS.
    expect(selectCoverPositionFromAttrs(
      { "title-img": 'background-image:url("cover.jpg");object-position:center 25%;' },
      true,
    )).toBe(25);
  });

  it("replaces width and height placeholders correctly", () => {
    const template = "https://picsum.photos/{width}/{height}";
    expect(formatCoverUrl(template, 1920, 1080)).toBe("https://picsum.photos/1920/1080");
    expect(formatCoverUrl(template, 800, 600)).toBe("https://picsum.photos/800/600");
  });

  it("handles URLs without placeholders", () => {
    const directUrl = "https://img.xjh.me/random_img.php?return=302";
    expect(formatCoverUrl(directUrl, 1920, 1080)).toBe(directUrl);
  });

  it("accurately identifies video URLs", () => {
    expect(isVideoUrl("assets/background.mp4")).toBe(true);
    expect(isVideoUrl("https://example.com/video.webm?token=123")).toBe(true);
    expect(isVideoUrl("/data/assets/clip.MOV")).toBe(true);
    expect(isVideoUrl("assets/image.png")).toBe(false);
    expect(isVideoUrl("https://example.com/photo.jpg")).toBe(false);
    expect(isVideoUrl("")).toBe(false);
    expect(isVideoUrl(null as any)).toBe(false);
  });

  it("sanitizes assets directory path consistently", () => {
    expect(sanitizeAssetsPath("assets/more-background")).toBe("/assets/more-background");
    expect(sanitizeAssetsPath("/assets/more-background/")).toBe("/assets/more-background");
    expect(sanitizeAssetsPath("assets\\more-background\\")).toBe("/assets/more-background");
  });

  it("uses a deterministic device-local WebP cache path for each source and resize mode", () => {
    const source = "https://example.com/images/cover.png?size=large";
    const context = { sourceUrl: source, maxEdge: "1920" as const, now: new Date("2026-08-22T00:00:00Z") };
    expect(localCachePath("/storage/petal/siyuan-damophus/more-background/covers", "{year}/{month}/{hash}.webp", context)).toMatch(/^\/data\/storage\/petal\/siyuan-damophus\/more-background\/covers\/2026\/08\/[a-f0-9]{8}\.webp$/);
    expect(localCachePath("/storage/petal/siyuan-damophus/more-background/covers", "{year}/{month}/{hash}.webp", context)).toBe(localCachePath("/storage/petal/siyuan-damophus/more-background/covers", "{year}/{month}/{hash}.webp", context));
    expect(localCachePath("/storage/petal/siyuan-damophus/more-background/covers", "{hash}-{maxEdge}.{ext}", { ...context, maxEdge: "1280" })).not.toBe(localCachePath("/storage/petal/siyuan-damophus/more-background/covers", "{hash}-{maxEdge}.{ext}", context));
  });

  it("infers a remote legacy cover source from the rendered image", () => {
    const image = { currentSrc: "https://safebooru.org/images/2062/faf35c8e747e9b6a5d167314db888e983c4c2cbd.jpg", src: "" } as HTMLImageElement;
    expect(inferCoverSourceFromImage(image)).toBe(image.currentSrc);
    expect(inferCoverSourceFromImage({ currentSrc: "assets/cover.webp", src: "assets/cover.webp" } as HTMLImageElement)).toBeNull();
  });

  it("converts CoverTemplateItem to booru url and back correctly", () => {
    const tpl = {
      id: "tpl-test",
      name: "Test Landscape",
      type: "booru" as const,
      site: "safebooru.org",
      aspectRatio: "landscape" as const,
      rating: "safe" as const,
      tags: "wallpaper",
      pool: ["ask_(askzy)", "blade_(galaxist)"],
    };
    const url = templateToUrl(tpl);
    expect(url).toContain("booru:safebooru.org?");
    expect(url).toContain("ratio=landscape");
    expect(url).toContain("pool=ask_%28askzy%29%2Cblade_%28galaxist%29");

    const parsed = urlToTemplate("Test Landscape", url, "tpl-test");
    expect(parsed.name).toBe("Test Landscape");
    expect(parsed.aspectRatio).toBe("landscape");
    expect(parsed.tags).toBe("wallpaper");
  });

  it("converts template with excludeTagPool and blacklist rules into query params", () => {
    const customPools = [
      {
        id: "pool-my-blacklist",
        name: "My Blacklist",
        items: [{ tag: "grayscale", zh: "黑白" }, { tag: "two_males", zh: "双男" }],
      },
    ];

    const tplWithExcludeRule = {
      id: "tpl-exclude-test",
      name: "Exclude Test",
      type: "booru" as const,
      site: "safebooru.org",
      rules: [
        { id: "r1", field: "aspectRatio" as const, operator: "equals" as const, value: "landscape" },
        { id: "r2", field: "excludeTagPool" as const, operator: "excludeAllIn" as const, value: "pool-my-blacklist" },
        { id: "r3", field: "blacklist" as const, operator: "containsNone" as const, value: "guro,gore" },
      ],
    };

    const url = templateToUrl(tplWithExcludeRule, customPools);
    expect(url).toContain("blacklist=grayscale%2Ctwo_males%2Cguro%2Cgore");
  });

  it("persists and retrieves last used source in localStorage", () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };

    const testItem = { label: "动漫唯美风景", url: "booru:safebooru.org?tags=scenery" };
    setLastUsedSource(testItem);
    const retrieved = getLastUsedSource();
    expect(retrieved).toEqual(testItem);
  });

  it("updates existing button titles and labels idempotently", () => {
    const mockSpan = { textContent: "⚡ 旧模板" };
    const mockBtn = {
      title: "旧配置",
      tagName: "BUTTON",
      innerHTML: "",
      querySelector: (sel: string) => (sel === ".damophus-last-label" ? mockSpan : null),
    };
    (globalThis as any).document = {
      querySelectorAll: (sel: string) => (sel === '[data-type="more-background-last"]' ? [mockBtn] : []),
    };

    updateAllLastUsedButtons({ label: "新画师模板", url: "booru:gelbooru.com" });
    expect(mockBtn.title).toBe("使用上次配置: 新画师模板");
    expect(mockSpan.textContent).toBe("⚡ 新画师模板");

    delete (globalThis as any).document;
  });

  it("records, retrieves, removes, and clears cover history entries", () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };

    clearCoverHistory();
    expect(getCoverHistory()).toEqual([]);

    recordCoverHistory({
      docId: "doc-123",
      docTitle: "民事诉讼法专题",
      imageUrl: "https://safebooru.org/images/1.png",
      tags: ["scenery", "night_sky"],
      templateName: "唯美风景",
    });

    const list = getCoverHistory();
    expect(list.length).toBe(1);
    expect(list[0].docTitle).toBe("民事诉讼法专题");
    expect(list[0].imageUrl).toBe("https://safebooru.org/images/1.png");
    expect(list[0].kind).toBeUndefined();

    recordCoverHistory({
      docId: "doc-123",
      docTitle: "民事诉讼法专题",
      imageUrl: "https://safebooru.org/images/2.png",
      kind: "replaced",
    });

    const nextList = getCoverHistory();
    expect(nextList.length).toBe(2);
    expect(nextList[0].kind).toBe("replaced");

    // Remove entries
    removeCoverHistoryEntry(nextList[0].id);
    removeCoverHistoryEntry(nextList[1].id);
    expect(getCoverHistory().length).toBe(0);
  });

  it("records replaced covers into the durable seen-cover deduplication store", () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };

    clearSeenCovers();
    expect(getSeenCovers()).toEqual([]);

    const seen = recordSeenCover({
      docId: "doc-123",
      docTitle: "民法专题",
      imageUrl: "https://safebooru.org/images/9/replaced.png",
      sourceUrl: "https://safebooru.org/images/9/replaced.png",
      site: "safebooru.org",
      postId: "900",
    });
    expect(seen).not.toBeNull();
    expect(getSeenCovers().length).toBe(1);

    // Same post identity should not create a duplicate seen entry.
    const duplicate = recordSeenCover({
      docId: "doc-456",
      docTitle: "刑法专题",
      imageUrl: "https://safebooru.org/images/9/replaced.png",
      site: "safebooru.org",
      postId: 900,
    });
    expect(duplicate).not.toBeNull();
    expect(getSeenCovers().length).toBe(1);

    const local = recordSeenCover({
      docId: "doc-789",
      docTitle: "行政法专题",
      imageUrl: "assets/local-only.png",
    });
    expect(local).not.toBeNull();
    expect(getSeenCovers().length).toBe(2);
  });

  it("filters previously used local assets before random selection", () => {
    const files = [
      "assets/more-background/used.webp",
      "assets/more-background/fresh.webp",
    ];
    const excluded = new Set(["asset:assets/more-background/used.webp"]);

    expect(filterUnusedCoverAssets(files, excluded)).toEqual([
      "assets/more-background/fresh.webp",
    ]);
  });

  it("respects configurable history and seen-cover limits", () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => store[k] || null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
    };

    clearCoverHistory();
    clearSeenCovers();

    setCoverHistoryLimit(2);
    setSeenCoversLimit(2);
    expect(getCoverHistoryLimit()).toBe(2);
    expect(getSeenCoversLimit()).toBe(2);

    recordCoverHistory({ docId: "doc-1", docTitle: "一", imageUrl: "https://safebooru.org/images/h1.png" });
    recordCoverHistory({ docId: "doc-2", docTitle: "二", imageUrl: "https://safebooru.org/images/h2.png" });
    recordCoverHistory({ docId: "doc-3", docTitle: "三", imageUrl: "https://safebooru.org/images/h3.png" });
    expect(getCoverHistory().length).toBe(2);

    recordSeenCover({ docId: "doc-1", docTitle: "一", imageUrl: "https://safebooru.org/images/s1.png", site: "safebooru.org", postId: "1" });
    recordSeenCover({ docId: "doc-2", docTitle: "二", imageUrl: "https://safebooru.org/images/s2.png", site: "safebooru.org", postId: "2" });
    recordSeenCover({ docId: "doc-3", docTitle: "三", imageUrl: "https://safebooru.org/images/s3.png", site: "safebooru.org", postId: "3" });
    expect(getSeenCovers().length).toBe(2);

    // Restore defaults so later tests are unaffected.
    setCoverHistoryLimit(150);
    setSeenCoversLimit(800);
    clearCoverHistory();
    clearSeenCovers();
  });

  it("migrates origin-local deduplication data into persistent plugin storage", async () => {
    const store: Record<string, string> = {};
    (globalThis as any).localStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    };
    store.damophus_more_background_seen_covers = JSON.stringify([{
      id: "legacy-seen",
      docId: "doc-legacy",
      imageUrl: "https://safebooru.org/images/legacy.jpg",
      seenAt: 10,
    }]);

    let saved: unknown;
    const storage = {
      loadData: vi.fn(async () => ({
        schemaVersion: 1,
        history: [],
        seen: [{
          id: "persistent-seen",
          docId: "doc-persistent",
          imageUrl: "https://safebooru.org/images/persistent.jpg",
          seenAt: 20,
        }],
      })),
      saveData: vi.fn(async (_name: string, value: unknown) => { saved = value; }),
    };

    await initializeCoverDedupStorage(storage);

    expect(getSeenCovers().map((entry) => entry.id)).toEqual(["persistent-seen", "legacy-seen"]);
    expect(saved).toMatchObject({
      schemaVersion: 1,
      seen: [{ id: "persistent-seen" }, { id: "legacy-seen" }],
    });

    recordSeenCover({
      docId: "doc-new",
      imageUrl: "https://safebooru.org/images/new.jpg",
    });
    await vi.waitFor(() => expect(storage.saveData).toHaveBeenCalledTimes(2));
    expect(saved).toMatchObject({
      seen: [{ docId: "doc-new" }, { id: "persistent-seen" }, { id: "legacy-seen" }],
    });
  });
});
