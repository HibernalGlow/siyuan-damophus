import { describe, expect, it } from "vitest";
import {
  buildDockVisibilityCss,
  isDockHiddenOn,
  normalizeDockPlatform,
  normalizeDockPlatformMap,
} from "./visibility";

describe("dock platform map", () => {
  it("falls back to 'both' for unknown platforms and drops empty keys", () => {
    expect(normalizeDockPlatform("desktop")).toBe("desktop");
    expect(normalizeDockPlatform("weird")).toBe("both");
    expect(normalizeDockPlatformMap({ outline: "mobile", "": "desktop", bad: "x" })).toEqual({
      outline: "mobile",
      bad: "both",
    });
    expect(normalizeDockPlatformMap(undefined)).toEqual({});
  });

  it("hides a dock button only on the platform it is not pinned to", () => {
    expect(isDockHiddenOn("desktop", "mobile")).toBe(true);
    expect(isDockHiddenOn("desktop", "desktop")).toBe(false);
    expect(isDockHiddenOn("mobile", "mobile")).toBe(false);
    expect(isDockHiddenOn("mobile", "desktop")).toBe(true);
    expect(isDockHiddenOn("both", "mobile")).toBe(false);
    expect(isDockHiddenOn("both", "desktop")).toBe(false);
  });

  it("builds one rule per direction and never emits :has()", () => {
    const css = buildDockVisibilityCss({
      outline: "desktop",
      inbox: "mobile",
      'weird"quote': "desktop",
    });

    expect(css).toContain('html[data-frontend="desktop"] .dock__item[data-type="inbox"]');
    expect(css).toContain('html[data-frontend="browser-desktop"] .dock__item[data-type="inbox"]');
    expect(css).toContain('html[data-frontend="desktop-window"] .dock__item[data-type="inbox"]');
    expect(css).toContain('html[data-frontend="mobile"] .dock__item[data-type="outline"]');
    expect(css).toContain('html[data-frontend="browser-mobile"] .dock__item[data-type="outline"]');
    expect(css).toContain('data-type="weird\\"quote"');
    expect(css).not.toContain("graph");
    expect(css.includes(":has(")).toBe(false);
  });
});
