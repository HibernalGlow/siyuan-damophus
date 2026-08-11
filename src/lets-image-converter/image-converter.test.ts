import { describe, expect, it } from "vitest";
import {
  clampQuality,
  DEFAULT_FORMAT,
  DEFAULT_QUALITY,
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
  });
});
