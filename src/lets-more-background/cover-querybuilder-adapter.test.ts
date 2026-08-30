import { describe, expect, it } from "vitest";
import { coverRulesToQuery, queryToCoverRules } from "./cover-querybuilder-adapter";

describe("cover query-builder adapter", () => {
  it("round-trips legacy flat template rules without changing their meaning", () => {
    const rules = [
      { id: "ratio", field: "aspectRatio" as const, operator: "equals" as const, value: "landscape" },
      { id: "score", field: "minScore" as const, operator: "gte" as const, value: 10 },
      { id: "pool", field: "tagPool" as const, operator: "randomIn" as const, value: "artists" },
    ];

    const query = coverRulesToQuery(rules);

    expect(query.combinator).toBe("and");
    expect(queryToCoverRules(query)).toEqual(rules);
  });

  it("discards unsupported nested conditions instead of persisting non-executable logic", () => {
    const rules = queryToCoverRules({
      combinator: "and",
      rules: [
        { field: "tags", operator: "contains", value: "wallpaper" },
        { combinator: "or", rules: [{ field: "site", operator: "equals", value: "yande.re" }] },
      ],
    });

    expect(rules).toEqual([{ id: expect.any(String), field: "tags", operator: "contains", value: "wallpaper" }]);
  });
});
