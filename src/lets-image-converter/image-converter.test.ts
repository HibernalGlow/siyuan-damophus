import { describe, expect, it } from "vitest";
import {
  clampQuality,
  DEFAULT_FORMAT,
  DEFAULT_QUALITY,
  isAnimatedImageBytes,
  isImageAssetPath,
  outputFileName,
  parseImageFormat,
} from "./image-converter";

describe("image converter settings", () => {
  it("uses avifq60 as the default format", () => {
    expect(DEFAULT_FORMAT).toBe("avifq60");
    expect(DEFAULT_QUALITY).toBe(60);
    expect(parseImageFormat(DEFAULT_FORMAT)).toEqual({ format: "avif", presetQuality: 60 });
  });

  it("normalizes invalid formats and clamps quality", () => {
    expect(parseImageFormat("png")).toEqual({ format: "avif", presetQuality: 60 });
    expect(clampQuality(0)).toBe(1);
    expect(clampQuality(140)).toBe(100);
    expect(clampQuality("invalid")).toBe(60);
  });

  it("keeps a legal extension while retaining the source basename", () => {
    expect(outputFileName("scan.page.png", "avif")).toBe("scan.page.avif");
    expect(isImageAssetPath("assets/scan.page.png?x=1")).toBe(true);
    expect(isImageAssetPath("assets/manual.pdf")).toBe(false);
  });

  it("detects GIF, animated WebP, APNG, and animated AVIF", () => {
    const gif = new TextEncoder().encode("GIF89a");
    const webp = new Uint8Array([
      ...new TextEncoder().encode("RIFF"), 12, 0, 0, 0,
      ...new TextEncoder().encode("WEBP"),
      ...new TextEncoder().encode("ANIM"), 0, 0, 0, 0,
    ]);
    const apng = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0, 0, 0, 0, ...new TextEncoder().encode("acTL"), 0, 0, 0, 0,
    ]);
    const avif = new Uint8Array([
      0, 0, 0, 20, ...new TextEncoder().encode("ftyp"),
      ...new TextEncoder().encode("avis"), 0, 0, 0, 0,
      ...new TextEncoder().encode("avif"),
    ]);

    expect(isAnimatedImageBytes(gif)).toBe(true);
    expect(isAnimatedImageBytes(webp)).toBe(true);
    expect(isAnimatedImageBytes(apng)).toBe(true);
    expect(isAnimatedImageBytes(avif, "image/avif")).toBe(true);
    expect(isAnimatedImageBytes(new TextEncoder().encode("RIFF\0\0\0\0WEBP"))).toBe(false);
  });
});
