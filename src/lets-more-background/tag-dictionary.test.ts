import { describe, expect, it } from "vitest";
import { getDetailedTagInfo, parseTagLine, formatTagLine } from "./tag-dictionary";

describe("tag-dictionary", () => {
  it("translates known scenery and anime tags to Chinese", () => {
    const scenery = getDetailedTagInfo("scenery");
    expect(scenery.zh).toContain("风景");
    expect(scenery.category).toBe("scenery");

    const nightSky = getDetailedTagInfo("night_sky");
    expect(nightSky.zh).toContain("夜空");
    expect(nightSky.category).toBe("scenery");

    const genshin = getDetailedTagInfo("genshin_impact");
    expect(genshin.zh).toContain("原神");
    expect(genshin.category).toBe("copyright");

    const girl = getDetailedTagInfo("1girl");
    expect(girl.zh).toContain("少女");
    expect(girl.category).toBe("character");
  });

  it("resolves artist tags correctly from dictionary and heuristics", () => {
    const ask = getDetailedTagInfo("ask_(askzy)");
    expect(ask.zh).toContain("Ask");
    expect(ask.category).toBe("artist");

    const kedama = getDetailedTagInfo("kedama_milk");
    expect(kedama.zh).toContain("毛玉牛乳");
    expect(kedama.category).toBe("artist");

    const circle = getDetailedTagInfo("someartist_(circle)");
    expect(circle.category).toBe("artist");
  });

  it("resolves official translations from 33,600+ EhTagTranslation database", () => {
    const codeGeass = getDetailedTagInfo("code_geass");
    expect(codeGeass.zh).toContain("鲁");
    expect(codeGeass.category).toBe("copyright");

    const urusei = getDetailedTagInfo("urusei_yatsura");
    expect(urusei.zh).toContain("福星小子");
    expect(urusei.category).toBe("copyright");

    const cc = getDetailedTagInfo("c.c.");
    expect(cc.zh.toUpperCase()).toContain("CC");
    expect(cc.category).toBe("character");
  });

  it("parses user tag line correctly", () => {
    const parsed1 = parseTagLine("rella # Rella (画师)");
    expect(parsed1).toEqual({ tag: "rella", zh: "Rella (画师)" });

    const parsed2 = parseTagLine("night_sky");
    expect(parsed2?.tag).toBe("night_sky");
    expect(parsed2?.zh).toContain("夜空");
  });

  it("formats tag lines with comments", () => {
    expect(formatTagLine("kantoku", "监督 (画师)")).toBe("kantoku # 监督 (画师)");
    expect(formatTagLine("landscape")).toBe("landscape");
  });
});
