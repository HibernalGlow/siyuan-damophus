import type { RuleGroupTypeIC, RuleType } from "svelte-querybuilder";
import {
  PRACTICE_FILTER_FIELDS,
  practiceFilterToCondition,
  type PracticeFilter,
  type PracticeFilterCombinator,
  type PracticeFilterField,
  type PracticeFilterGroup,
  type PracticeFilterOperator,
  type PracticeFilterValue,
} from "@/question-bank/core/scope";

export type PracticeQueryOperator = PracticeFilterOperator;
export type PracticeQueryRule = RuleType<PracticeFilterField, PracticeQueryOperator, PracticeFilterValue> & { disabled?: boolean };
export type PracticeQueryGroup = RuleGroupTypeIC<PracticeQueryRule, PracticeFilterCombinator> & { glue?: PracticeFilterCombinator; id?: string; name?: string; not?: boolean; disabled?: boolean };
type QueryEntry = PracticeQueryRule | PracticeQueryGroup | PracticeFilterCombinator;

function isGroup(value: QueryEntry | PracticeFilterGroup["rules"][number]): value is PracticeQueryGroup | PracticeFilterGroup {
  return typeof value === "object" && value !== null && "rules" in value;
}

function toQueryGroup(group: PracticeFilterGroup): PracticeQueryGroup {
  const connectors = group.rules.length > 1
    ? group.rules.slice(0, -1).map((_, index) => group.combinators?.[index] ?? group.glue)
    : [];
  const rules: QueryEntry[] = [];
  group.rules.forEach((rule, index) => {
    if (index > 0) rules.push(connectors[index - 1]);
    if (isGroup(rule)) rules.push(toQueryGroup(rule));
    else rules.push({ field: rule.field, operator: rule.filter ?? "equal", value: rule.value ?? "yes", ...(rule.disabled ? { disabled: true } : {}) });
  });
  return {
    glue: group.glue,
    ...(group.name ? { name: group.name } : {}),
    ...(group.not ? { not: true } : {}),
    ...(group.disabled ? { disabled: true } : {}),
    rules: rules as PracticeQueryGroup["rules"],
  };
}

export function practiceFilterToQuery(filter: PracticeFilter): PracticeQueryGroup {
  return toQueryGroup(practiceFilterToCondition(filter));
}

function isPracticeField(value: unknown): value is PracticeFilterField {
  return typeof value === "string" && PRACTICE_FILTER_FIELDS.includes(value as PracticeFilterField);
}
function isPracticeValue(value: unknown): value is PracticeFilterValue { return value === "yes" || value === "no"; }
function isPracticeOperator(value: unknown): value is PracticeFilterOperator {
  return ["greater", "less", "greaterOrEqual", "lessOrEqual", "equal", "notEqual"].includes(String(value));
}

function fromQueryGroup(group: PracticeQueryGroup): PracticeFilterGroup {
  const name = typeof group.name === "string" && group.name.trim() ? group.name.trim() : undefined;
  const rules: PracticeFilterGroup["rules"] = [];
  const connectors: PracticeFilterCombinator[] = [];
  for (const entry of group.rules as QueryEntry[]) {
    if (entry === "and" || entry === "or") { connectors.push(entry); continue; }
    if (isGroup(entry)) { rules.push(fromQueryGroup(entry as PracticeQueryGroup)); continue; }
    if (!isPracticeField(entry.field)) continue;
    // An empty value (or the explicit "any" option) means "no restriction on this
    // dimension" — the core evaluator treats value-less rules as match-all — so the
    // rule is dropped instead of being silently coerced to "yes" (attempted).
    if (!isPracticeValue(entry.value)) continue;
    rules.push({ field: entry.field, type: "tuple", filter: isPracticeOperator(entry.operator) ? entry.operator : "equal", value: entry.value, ...(entry.disabled ? { disabled: true } : {}) });
  }
  const glue = group.glue === "or" ? "or" : "and";
  const normalizedConnectors = connectors.length === Math.max(0, rules.length - 1) ? connectors : [];
  const allSame = normalizedConnectors.length > 0 && normalizedConnectors.every((item) => item === normalizedConnectors[0]);
  return {
    glue: allSame ? normalizedConnectors[0] : glue,
    ...(!allSame && normalizedConnectors.some((item) => item !== glue) ? { combinators: normalizedConnectors } : {}),
    ...(name ? { name } : {}),
    ...(group.not ? { not: true } : {}),
    ...(group.disabled ? { disabled: true } : {}),
    rules,
  };
}

export function queryToPracticeFilter(query: PracticeQueryGroup): PracticeFilterGroup { return fromQueryGroup(query); }
