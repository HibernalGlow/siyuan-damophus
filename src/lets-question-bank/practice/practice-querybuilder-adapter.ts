import type { RuleGroupTypeIC, RuleType } from "svelte-querybuilder";
import {
  PRACTICE_FILTER_FIELDS,
  practiceFilterToCondition,
  type PracticeFilter,
  type PracticeFilterCombinator,
  type PracticeFilterField,
  type PracticeFilterGroup,
  type PracticeFilterOperator,
  type PracticeFilterRule,
  type PracticeFilterValue,
  type PracticeLastResult,
} from "@/question-bank/core/scope";
import type { MasteryRating } from "@/question-bank/core/types";

export type PracticeQueryOperator = PracticeFilterOperator;
/** Builder-side value: the core's yes/no plus the explicit 全部题 (no restriction) option. */
export type PracticeQueryValue = PracticeFilterValue | "any" | PracticeLastResult | MasteryRating | number | MasteryRating[];
export type PracticeQueryRule = RuleType<PracticeFilterField, PracticeQueryOperator, PracticeQueryValue> & { disabled?: boolean; bypassed?: boolean };
export type PracticeQueryGroup = RuleGroupTypeIC<PracticeQueryRule, PracticeFilterCombinator> & { glue?: PracticeFilterCombinator; id?: string; name?: string; not?: boolean; disabled?: boolean; bypassed?: boolean };
type QueryEntry = PracticeQueryRule | PracticeQueryGroup | PracticeFilterCombinator;

const RATING_VALUES: readonly MasteryRating[] = ["again", "hard", "good", "easy"];
const LAST_RESULT_VALUES: readonly PracticeLastResult[] = ["correct", "wrong", "unattempted"];
const COUNT_FIELDS: readonly PracticeFilterField[] = ["wrong_count", "attempt_count", "last_answered_days"];

function isRatingValue(value: unknown): value is MasteryRating {
  return RATING_VALUES.includes(value as MasteryRating);
}
function isLastResultValue(value: unknown): value is PracticeLastResult {
  return LAST_RESULT_VALUES.includes(value as PracticeLastResult);
}
function isCountField(field: PracticeFilterField): boolean {
  return COUNT_FIELDS.includes(field);
}

function isGroup(value: QueryEntry | PracticeFilterGroup["rules"][number]): value is PracticeQueryGroup | PracticeFilterGroup {
  return typeof value === "object" && value !== null && "rules" in value;
}

// A value-less rule restricts nothing in the core evaluator; the builder surfaces
// that state as the explicit 全部题 option (empty multi-select) so it survives
// save/re-open. The legacy includes form maps back to a single token when it
// carries one; rating selections round-trip as arrays.
function queryValue(rule: PracticeFilterRule): PracticeQueryValue {
  if (rule.field === "latest_rating") {
    if (rule.includes?.length) return [...rule.includes].filter(isRatingValue);
    if (isRatingValue(rule.value)) return [rule.value];
    return "any";
  }
  if (rule.value !== undefined) return rule.value;
  if (rule.includes?.length === 1) return rule.includes[0];
  return "any";
}

function toQueryGroup(group: PracticeFilterGroup): PracticeQueryGroup {
  const connectors = group.rules.length > 1
    ? group.rules.slice(0, -1).map((_, index) => group.combinators?.[index] ?? group.glue)
    : [];
  const rules: QueryEntry[] = [];
  group.rules.forEach((rule, index) => {
    if (index > 0) rules.push(connectors[index - 1]);
    if (isGroup(rule)) rules.push(toQueryGroup(rule));
    else rules.push({ field: rule.field, operator: rule.filter ?? "equal", value: queryValue(rule), ...(rule.disabled ? { disabled: true } : {}), ...(rule.bypassed ? { bypassed: true } : {}) });
  });
  return {
    glue: group.glue,
    ...(group.name ? { name: group.name } : {}),
    ...(group.not ? { not: true } : {}),
    ...(group.disabled ? { disabled: true } : {}),
    ...(group.bypassed ? { bypassed: true } : {}),
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

/** Coerces builder-side values into the core rule payload; invalid shapes fall back to a value-less (match-all) rule. */
function coreRuleValue(field: PracticeFilterField, value: unknown): Pick<PracticeFilterRule, "value" | "includes"> {
  if (field === "latest_rating") {
    const ratings = (Array.isArray(value) ? value : [value]).filter(isRatingValue);
    return ratings.length ? { includes: ratings } : {};
  }
  if (isLastResultValue(value) || isPracticeValue(value)) return { value };
  if (isCountField(field)) {
    const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
    return Number.isFinite(numeric) ? { value: numeric } : {};
  }
  return {};
}

function fromQueryGroup(group: PracticeQueryGroup): PracticeFilterGroup {
  const name = typeof group.name === "string" && group.name.trim() ? group.name.trim() : undefined;
  const rules: PracticeFilterGroup["rules"] = [];
  const connectors: PracticeFilterCombinator[] = [];
  for (const entry of group.rules as QueryEntry[]) {
    if (entry === "and" || entry === "or") { connectors.push(entry); continue; }
    if (isGroup(entry)) { rules.push(fromQueryGroup(entry as PracticeQueryGroup)); continue; }
    if (!isPracticeField(entry.field)) continue;
    const filter = isPracticeOperator(entry.operator) ? entry.operator : "equal";
    const flags = { ...(entry.disabled ? { disabled: true } : {}), ...(entry.bypassed ? { bypassed: true } : {}) };
    // The explicit 全部题 option (or a cleared value) means "no restriction on this
    // dimension": keep the rule value-less — the core evaluator treats that as
    // match-all — so it survives save/re-open instead of silently disappearing.
    rules.push({ field: entry.field, type: "tuple", filter, ...coreRuleValue(entry.field, entry.value), ...flags });
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
    ...(group.bypassed ? { bypassed: true } : {}),
    rules,
  };
}

export function queryToPracticeFilter(query: PracticeQueryGroup): PracticeFilterGroup { return fromQueryGroup(query); }
