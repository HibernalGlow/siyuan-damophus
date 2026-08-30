import type { RuleType } from "svelte-querybuilder";
import {
  PRACTICE_FILTER_FIELDS,
  practiceFilterToCondition,
  type PracticeFilter,
  type PracticeFilterField,
  type PracticeFilterGroup,
  type PracticeFilterOperator,
  type PracticeFilterValue,
} from "@/question-bank/core/scope";

export type PracticeQueryOperator = PracticeFilterOperator;
export type PracticeQueryRule = RuleType<
  PracticeFilterField,
  PracticeQueryOperator,
  PracticeFilterValue
>;

export interface PracticeQueryGroup {
  id?: string;
  combinator: "and" | "or";
  name?: string;
  rules: Array<PracticeQueryRule | PracticeQueryGroup>;
}

function isGroup(rule: PracticeQueryRule | PracticeQueryGroup): rule is PracticeQueryGroup {
  return "rules" in rule;
}

function toQueryGroup(group: PracticeFilterGroup): PracticeQueryGroup {
  return {
    combinator: group.glue,
    ...(group.name ? { name: group.name } : {}),
    rules: group.rules.map((rule) => {
      if ("rules" in rule) return toQueryGroup(rule);
      return {
        field: rule.field,
        operator: rule.filter ?? "equal",
        value: rule.value ?? "yes",
      };
    }),
  };
}

export function practiceFilterToQuery(filter: PracticeFilter): PracticeQueryGroup {
  return toQueryGroup(practiceFilterToCondition(filter));
}

function isPracticeField(value: unknown): value is PracticeFilterField {
  return typeof value === "string" && PRACTICE_FILTER_FIELDS.includes(value as PracticeFilterField);
}

function isPracticeValue(value: unknown): value is PracticeFilterValue {
  return value === "yes" || value === "no";
}

function isPracticeOperator(value: unknown): value is PracticeFilterOperator {
  return ["greater", "less", "greaterOrEqual", "lessOrEqual", "equal", "notEqual"].includes(String(value));
}

function fromQueryGroup(group: PracticeQueryGroup): PracticeFilterGroup {
  const name = typeof group.name === "string" && group.name.trim() ? group.name.trim() : undefined;
  const rules: PracticeFilterGroup["rules"] = [];
  for (const rule of group.rules) {
    if (isGroup(rule)) {
      rules.push(fromQueryGroup(rule));
      continue;
    }
    if (!isPracticeField(rule.field)) continue;
    rules.push({
      field: rule.field,
      type: "tuple",
      filter: isPracticeOperator(rule.operator) ? rule.operator : "equal",
      value: isPracticeValue(rule.value) ? rule.value : "yes",
    });
  }
  return {
    glue: group.combinator === "or" ? "or" : "and",
    ...(name ? { name } : {}),
    rules,
  };
}

export function queryToPracticeFilter(query: PracticeQueryGroup): PracticeFilterGroup {
  return fromQueryGroup(query);
}
