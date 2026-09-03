import { describe, expect, it } from "vitest";
import { conditionToVariants, templateToUrlVariants } from "./cover-condition-compile";
import type { CoverConditionGroup, CoverTemplateItem, TagPool } from "./sources";

const pools: TagPool[] = [
  { id: "artists", name: "Artists", items: ["ask_(askzy)", "blade_(galaxist)"] },
  { id: "scenery", name: "Scenery", items: [{ tag: "scenery" }, { tag: "night_sky" }] },
];

const tpl = (condition: CoverConditionGroup): CoverTemplateItem => ({
  id: "t",
  name: "t",
  type: "booru",
  condition,
  conditionSchema: 2,
});

function params(url: string): URLSearchParams {
  return new URLSearchParams(url.split("?")[1] || "");
}

describe("cover condition variant compiler", () => {
  it("keeps an AND-only tree as a single variant", () => {
    const variants = conditionToVariants({
      combinator: "and",
      rules: [
        { field: "aspectRatio", operator: "equals", value: "landscape" },
        { field: "minScore", operator: "gte", value: 30 },
      ],
    });
    expect(variants).toHaveLength(1);
    expect(variants[0].ratio).toBe("landscape");
    expect(variants[0].minScore).toBe("30");
  });

  it("splits an OR group into one variant per branch", () => {
    const variants = conditionToVariants({
      combinator: "or",
      rules: [
        { field: "tagPool", operator: "randomIn", value: "artists" },
        { field: "tagPool", operator: "randomIn", value: "scenery" },
      ],
    });
    expect(variants).toHaveLength(2);
    expect(variants.map((variant) => variant.poolId).sort()).toEqual(["artists", "scenery"]);
  });

  it("multiplies variants when AND wraps OR branches", () => {
    const variants = conditionToVariants({
      combinator: "and",
      rules: [
        { field: "minScore", operator: "gte", value: 30 },
        {
          combinator: "or",
          rules: [
            { field: "tagPool", operator: "randomIn", value: "artists" },
            { field: "tagPool", operator: "randomIn", value: "scenery" },
          ],
        },
      ],
    });
    expect(variants).toHaveLength(2);
    for (const variant of variants) {
      expect(variant.minScore).toBe("30");
    }
    expect(variants.map((variant) => variant.poolId).sort()).toEqual(["artists", "scenery"]);
  });

  it("negates leaves into their inverse parameters", () => {
    const variants = conditionToVariants({
      combinator: "and",
      not: true,
      rules: [
        { field: "minScore", operator: "gte", value: 30 },
        { field: "tags", operator: "contains", value: "wallpaper" },
        { field: "timeRange", operator: "equals", value: "2018+" },
        { field: "aspectRatio", operator: "equals", value: "landscape" },
        { field: "rating", operator: "equals", value: "questionable" },
      ],
    });
    // NOT(AND …) = OR of the negated leaves → five variants.
    expect(variants).toHaveLength(5);
    const byMaxScore = variants.find((variant) => variant.maxScore !== undefined);
    expect(byMaxScore?.maxScore).toBe("30");
    expect(variants.find((variant) => variant.blacklist.includes("wallpaper"))).toBeDefined();
    expect(variants.find((variant) => variant.notTimeRange === "2018+")).toBeDefined();
    expect(variants.find((variant) => variant.notRatio === "landscape")).toBeDefined();
    expect(variants.find((variant) => variant.notRating === "questionable")).toBeDefined();
  });

  it("pushes NOT on an OR group down as NOT(OR) = AND of negations", () => {
    const variants = conditionToVariants({
      combinator: "or",
      not: true,
      rules: [
        { field: "minScore", operator: "gte", value: 30 },
        { field: "rating", operator: "equals", value: "safe" },
      ],
    });
    // NOT(a OR b) = NOT(a) AND NOT(b) → a single merged variant.
    expect(variants).toHaveLength(1);
    expect(variants[0].maxScore).toBe("30");
    expect(variants[0].notRating).toBe("safe");
  });

  it("drops negations without a booru-query inverse (site) instead of flipping meaning", () => {
    const variants = conditionToVariants({
      combinator: "and",
      not: true,
      rules: [{ field: "site", operator: "equals", value: "danbooru.donmai.us" }],
    });
    // Everything was dropped → degrade to one unconstrained variant.
    expect(variants).toHaveLength(1);
    expect(conditionToVariants({ combinator: "and", rules: [] })).toHaveLength(1);
  });

  it("skips locked (disabled) rules", () => {
    const variants = conditionToVariants({
      combinator: "and",
      rules: [
        { field: "minScore", operator: "gte", value: 30, disabled: true },
        { field: "aspectRatio", operator: "equals", value: "portrait" },
      ],
    });
    expect(variants).toHaveLength(1);
    expect(variants[0].minScore).toBeUndefined();
    expect(variants[0].ratio).toBe("portrait");
  });

  it("truncates OR branches past the variant cap", async () => {
    const { COVER_CONDITION_MAX_VARIANTS } = await import("./cover-condition-compile");
    const variants = conditionToVariants({
      combinator: "or",
      rules: Array.from({ length: COVER_CONDITION_MAX_VARIANTS + 4 }, (_, index) => ({
        field: "minScore" as const,
        operator: "gte" as const,
        value: index + 1,
      })),
    });
    expect(variants).toHaveLength(COVER_CONDITION_MAX_VARIANTS);
  });

  it("resolves tag pools to concrete tags for exclude rules", () => {
    const url = templateToUrlVariants(tpl({
      combinator: "and",
      rules: [
        { field: "aspectRatio", operator: "equals", value: "landscape" },
        { field: "excludeTagPool", operator: "excludeAllIn", value: "scenery" },
      ],
    }), pools)[0];
    expect(params(url).get("blacklist")).toBe("scenery,night_sky");
  });

  it("emits inverse params and per-branch pools into the serialized URLs", () => {
    const urls = templateToUrlVariants(tpl({
      combinator: "or",
      rules: [
        { field: "tagPool", operator: "randomIn", value: "artists" },
        {
          combinator: "and",
          rules: [
            { field: "minScore", operator: "gte", value: 30 },
            { field: "rating", operator: "equals", value: "safe", disabled: false },
          ],
        },
        { combinator: "and", not: true, rules: [{ field: "timeRange", operator: "equals", value: "2018+" }] },
      ],
    }), pools);
    expect(urls).toHaveLength(3);
    const poolUrls = urls.filter((url) => params(url).get("pool") === "ask_(askzy),blade_(galaxist)");
    const scoreUrls = urls.filter((url) => params(url).get("min_score") === "30");
    expect(poolUrls).toHaveLength(1);
    expect(scoreUrls).toHaveLength(1);
    expect(params(urls[2]).get("not_time_range")).toBe("2018+");
    // The negated time branch has no min_score of its own.
    expect(params(urls[2]).get("min_score")).toBeNull();
  });

  it("serializes variants as booru URIs with the site param", () => {
    const urls = templateToUrlVariants(tpl({
      combinator: "and",
      rules: [{ field: "site", operator: "equals", value: "danbooru.donmai.us" }],
    }), pools);
    expect(urls[0]).toMatch(/^booru:danbooru\.donmai\.us\?/);
  });
});
