import { describe, expect, it } from "vitest";
import {
  formatCoverUrl,
  isVideoUrl,
  sanitizeAssetsPath,
  templateToUrl,
  urlToTemplate,
} from "./sources";
import {
  getLastUsedSource,
  setLastUsedSource,
  updateAllLastUsedButtons,
} from "./more-background";

describe("more-background sources utilities", () => {
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
});

