import { describe, expect, it } from "vitest";
import { exportCustomThemes, mergeCustomThemes, removeCustomTheme } from "./library";
import { importThemesUtf8 } from "./schema";
import { BUILTIN_THEMES } from "./themes";

describe("custom theme library", () => {
  it("decodes UTF-8 theme arrays and rejects malformed bytes", () => {
    const json = JSON.stringify([BUILTIN_THEMES[0]]);
    expect(importThemesUtf8(new TextEncoder().encode(json)).themes).toHaveLength(1);
    expect(importThemesUtf8(Uint8Array.from([0xc3, 0x28])).errors[0]?.message).toContain("UTF-8");
  });

  it("adds and replaces custom themes without touching other entries", () => {
    const original = { ...BUILTIN_THEMES[0], name: "mine" };
    const updated = { ...BUILTIN_THEMES[1], name: "Mine" };
    const extra = { ...BUILTIN_THEMES[2], name: "extra" };
    const result = mergeCustomThemes([original], [updated, extra]);

    expect(result.themes).toEqual([updated, extra]);
    expect(result.replaced).toEqual(["Mine"]);
    expect(result.added).toEqual(["extra"]);
    expect(removeCustomTheme(result.themes, "extra")).toEqual([updated]);
    expect(JSON.parse(exportCustomThemes(result.themes))).toHaveLength(2);
  });
});
