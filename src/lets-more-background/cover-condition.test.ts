import { describe, expect, it } from "vitest";
import { migrateLegacyCoverRules, needsConditionMigration, templateToUrl, type CoverTemplateItem, type FilterRule } from "./sources";

const legacyRules: FilterRule[] = [
  { id: "ratio", field: "aspectRatio", operator: "equals", value: "landscape" },
  { id: "pool", field: "tagPool", operator: "randomIn", value: "artists" },
  { id: "score", field: "minScore", operator: "gte", value: 10 },
];

describe("cover condition model migration", () => {
  it("migrates legacy flat rules into an AND root group preserving order", () => {
    const tree = migrateLegacyCoverRules(legacyRules);
    expect(tree.combinator).toBe("and");
    expect(tree.rules).toHaveLength(3);
    expect(tree.rules[0]).toMatchObject({ field: "aspectRatio", operator: "equals", value: "landscape" });
    expect(tree.rules[2]).toMatchObject({ field: "minScore", value: 10 });
  });

  it("produces the same fetch URL from legacy and migrated conditions", () => {
    const legacy: CoverTemplateItem = { id: "t", name: "t", type: "booru", rules: legacyRules };
    const migrated: CoverTemplateItem = {
      id: "t",
      name: "t",
      type: "booru",
      condition: migrateLegacyCoverRules(legacyRules),
      conditionSchema: 2,
    };
    expect(templateToUrl(migrated)).toBe(templateToUrl(legacy));
  });

  it("keeps nested groups equivalent to their flattened rules", () => {
    const grouped: CoverTemplateItem = {
      id: "t",
      name: "t",
      type: "booru",
      condition: {
        combinator: "and",
        rules: [
          { field: "aspectRatio", operator: "equals", value: "landscape" },
          { combinator: "and", rules: [{ field: "rating", operator: "equals", value: "safe" }, { field: "minScore", operator: "gte", value: 10 }] },
        ],
      },
    };
    const flat: CoverTemplateItem = {
      id: "t",
      name: "t",
      type: "booru",
      rules: [
        { id: "a", field: "aspectRatio", operator: "equals", value: "landscape" },
        { id: "b", field: "rating", operator: "equals", value: "safe" },
        { id: "c", field: "minScore", operator: "gte", value: 10 },
      ],
    };
    expect(templateToUrl(grouped)).toBe(templateToUrl(flat));
  });

  it("flags only legacy templates for migration", () => {
    expect(needsConditionMigration({ id: "a", name: "a", type: "booru", rules: legacyRules })).toBe(true);
    expect(needsConditionMigration({ id: "b", name: "b", type: "booru", condition: { combinator: "and", rules: [] } })).toBe(false);
    expect(needsConditionMigration({ id: "c", name: "c", type: "booru" })).toBe(false);
  });
});
