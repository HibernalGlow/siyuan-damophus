import type { RuleGroupType, RuleType } from "svelte-querybuilder";
import type { FilterRule } from "./sources";

export type CoverQueryRule = RuleType<FilterRule["field"], FilterRule["operator"]> & { id?: string };
export type CoverQueryGroup = RuleGroupType<CoverQueryRule>;

const fields = new Set<FilterRule["field"]>([
  "aspectRatio", "site", "rating", "tags", "minScore", "timeRange", "tagPool", "imageQuality", "excludeTagPool", "blacklist",
]);
const operators = new Set<FilterRule["operator"]>([
  "equals", "contains", "gte", "randomIn", "excludeAllIn", "containsNone",
]);

export function coverRulesToQuery(rules: FilterRule[] = []): CoverQueryGroup {
  return {
    combinator: "and",
    rules: rules.map((rule) => ({ id: rule.id, field: rule.field, operator: rule.operator, value: rule.value })),
  };
}

export function queryToCoverRules(query: CoverQueryGroup): FilterRule[] {
  return query.rules.flatMap((entry, index) => {
    if (typeof entry !== "object" || entry === null || !("field" in entry)) return [];
    const rule = entry as CoverQueryRule;
    if (!fields.has(rule.field) || !operators.has(rule.operator)) return [];
    return [{
      id: typeof rule.id === "string" && rule.id ? rule.id : `rule-${Date.now()}-${index}`,
      field: rule.field,
      operator: rule.operator,
      value: rule.field === "minScore" ? Number(rule.value) || 0 : rule.value ?? "",
    }];
  });
}
