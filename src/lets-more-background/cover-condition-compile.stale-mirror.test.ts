import { describe, expect, it } from "vitest";
import { templateToUrlVariants } from "./cover-condition-compile";
import type { CoverTemplateItem, TagPool } from "./sources";

const pools: TagPool[] = [
  { id: "pool-a", name: "PoolA", items: ["artist_a"] },
  { id: "pool-b", name: "PoolB", items: ["artist_b"] },
];

/** 树 + 陈旧扁平镜像的模板：模拟「编辑器里删掉了画师库条件」后的对象状态。 */
function staleTemplate(conditionRules: CoverTemplateItem["condition"] extends undefined ? never : any): CoverTemplateItem {
  return {
    id: "t1",
    name: "stale",
    type: "booru",
    site: "safebooru.org",
    condition: conditionRules,
    // 旧版扁平镜像：应被条件树完全取代，不得再注入查询
    poolId: "pool-a",
    pool: ["artist_legacy"],
    blacklist: "legacy_blacklist_tag",
    tags: "legacy_tags",
  } as unknown as CoverTemplateItem;
}

describe("templateToUrlVariants stale-mirror isolation", () => {
  it("ignores stale template.pool/poolId/blacklist/tags mirrors once a condition tree exists", () => {
    const url = templateToUrlVariants(
      staleTemplate({
        combinator: "and",
        rules: [
          { field: "aspectRatio", operator: "equals", value: "landscape" },
          { field: "rating", operator: "equals", value: "safe" },
        ],
      }),
      pools,
    )[0];
    expect(url).not.toContain("pool=");
    expect(url).not.toContain("artist_legacy");
    expect(url).not.toContain("legacy_blacklist_tag");
    expect(url).not.toContain("legacy_tags");
  });

  it("still injects the pool referenced by an actual tagPool rule in the tree", () => {
    const url = templateToUrlVariants(
      staleTemplate({
        combinator: "and",
        rules: [
          { field: "aspectRatio", operator: "equals", value: "landscape" },
          { field: "tagPool", operator: "randomIn", value: "pool-b" },
        ],
      }),
      pools,
    )[0];
    expect(url).toContain("artist_b");
    expect(url).not.toContain("artist_a");
    expect(url).not.toContain("artist_legacy");
  });

  it("keeps the legacy flat-field path for tree-less templates", () => {
    const url = templateToUrlVariants(
      {
        id: "t2",
        name: "legacy",
        type: "booru",
        site: "safebooru.org",
        aspectRatio: "wide",
        poolId: "pool-a",
      } as unknown as CoverTemplateItem,
      pools,
    )[0];
    expect(url).toContain("pool=artist_a");
    expect(url).toContain("ratio=wide");
  });
});
