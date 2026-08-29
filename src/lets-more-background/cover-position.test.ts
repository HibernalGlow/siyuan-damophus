import { describe, expect, it } from "vitest";
import {
  buildTitleImgAttr,
  normalizeCoverPositionValue,
  parseTitleImg,
} from "./more-background";

describe("parseTitleImg", () => {
  it("parses the plugin save format with a trailing semicolon", () => {
    const parsed = parseTitleImg(
      `background-image:url("https://example.com/a.webp");object-position:center 42.50%;`,
    );
    expect(parsed.url).toBe("https://example.com/a.webp");
    expect(parsed.urlKind).toBe("remote");
    expect(parsed.positionPercent).toBe(42.5);
    expect(parsed.positionRaw).toBe("center 42.50%");
  });

  it("parses the native confirm format without a trailing semicolon", () => {
    const parsed = parseTitleImg(`background-image:url("assets/a.png");object-position:center 30%`);
    expect(parsed.url).toBe("assets/a.png");
    expect(parsed.urlKind).toBe("asset");
    expect(parsed.positionPercent).toBe(30);
  });

  it("detects session blob urls as unstable", () => {
    const parsed = parseTitleImg(
      `background-image:url("blob:http://127.0.0.1:6806/uuid");object-position:center 20%;`,
    );
    expect(parsed.urlKind).toBe("blob");
    expect(parsed.positionPercent).toBe(20);
  });

  it("detects data urls", () => {
    const parsed = parseTitleImg(`background-image:url("data:image/png;base64,AAAA");object-position:center 10%;`);
    expect(parsed.urlKind).toBe("data");
    expect(parsed.positionPercent).toBe(10);
  });

  it("keeps legacy px positions as raw without a percent", () => {
    const parsed = parseTitleImg(
      `background-image:url("assets/old.jpeg"); background-position: center -254px; background-size: cover;`,
    );
    expect(parsed.url).toBe("assets/old.jpeg");
    expect(parsed.urlKind).toBe("asset");
    expect(parsed.positionPercent).toBeNull();
    expect(parsed.positionRaw).toBe("center -254px");
  });

  it("decodes html entities around the url", () => {
    const parsed = parseTitleImg(`background-image:url(&quot;https://example.com/a.png&quot;);object-position:center 10%;`);
    expect(parsed.url).toBe("https://example.com/a.png");
    expect(parsed.urlKind).toBe("remote");
  });

  it("clamps out-of-range percents", () => {
    expect(parseTitleImg(`background-image:url("a.png");object-position:center 150%;`).positionPercent).toBe(100);
    expect(parseTitleImg(`background-image:url("a.png");object-position:center -10%;`).positionPercent).toBe(0);
  });

  it("returns nulls for empty or url-less values", () => {
    expect(parseTitleImg("")).toEqual({ url: null, urlKind: null, positionPercent: null, positionRaw: null });
    expect(parseTitleImg(null)).toEqual({ url: null, urlKind: null, positionPercent: null, positionRaw: null });
    const noUrl = parseTitleImg("object-position:center 10%;");
    expect(noUrl.url).toBeNull();
    expect(noUrl.urlKind).toBeNull();
    expect(noUrl.positionPercent).toBe(10);
  });
});

describe("buildTitleImgAttr", () => {
  it("builds the attr with a percent position", () => {
    expect(buildTitleImgAttr("assets/a.png", 33.333)).toBe(
      `background-image:url("assets/a.png");object-position:center 33.33%`,
    );
  });

  it("clamps percents into 0-100", () => {
    expect(buildTitleImgAttr("a.png", 150)).toContain("object-position:center 100%");
    expect(buildTitleImgAttr("a.png", -5)).toContain("object-position:center 0%");
  });

  it("falls back to the raw position declaration", () => {
    expect(buildTitleImgAttr("a.png", null, "center -254px")).toBe(
      `background-image:url("a.png");object-position:center -254px`,
    );
  });

  it("omits the position when none is given", () => {
    expect(buildTitleImgAttr("a.png", null)).toBe(`background-image:url("a.png")`);
    expect(buildTitleImgAttr("a.png", null, null)).toBe(`background-image:url("a.png")`);
  });

  it("escapes double quotes in urls", () => {
    expect(buildTitleImgAttr('a"b.png')).toBe(`background-image:url("a%22b.png")`);
  });
});

describe("normalizeCoverPositionValue", () => {
  it("parses numeric strings and numbers", () => {
    expect(normalizeCoverPositionValue("42.5")).toBe(42.5);
    expect(normalizeCoverPositionValue(88)).toBe(88);
  });

  it("clamps into 0-100 and rejects junk", () => {
    expect(normalizeCoverPositionValue("120")).toBe(100);
    expect(normalizeCoverPositionValue("-3")).toBe(0);
    expect(normalizeCoverPositionValue("abc")).toBeNull();
    expect(normalizeCoverPositionValue(undefined)).toBeNull();
    expect(normalizeCoverPositionValue("")).toBeNull();
  });
});
