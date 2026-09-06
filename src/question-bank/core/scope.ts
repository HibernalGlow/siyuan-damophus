import type { AttemptAggregate, MasteryRating, Question, TopicNode } from "./types";

export const LEGACY_PRACTICE_FILTERS = [
  "all",
  "unattempted",
  "wrong",
  "review",
  "due",
  "bookmarked",
] as const;

export const PRACTICE_FILTER_FIELDS = [
  "attempted",
  "wrong",
  "review",
  "due",
  "bookmarked",
  "latest_rating",
  "last_result",
  "wrong_count",
  "attempt_count",
  "last_answered_days",
] as const;

export const PRACTICE_BOOLEAN_FILTER_FIELDS = [
  "attempted",
  "wrong",
  "review",
  "due",
  "bookmarked",
] as const;

export type LegacyPracticeFilter = typeof LEGACY_PRACTICE_FILTERS[number];
export type PracticeFilterField = typeof PRACTICE_FILTER_FIELDS[number];
export type PracticeBooleanFilterField = typeof PRACTICE_BOOLEAN_FILTER_FIELDS[number];
export type PracticeFilterValue = "yes" | "no";
export type PracticeLastResult = "correct" | "wrong" | "unattempted";
/** Widen the rule payload beyond the yes/no tokens: single last-result value, single rating, or a count/day threshold. */
export type PracticeFilterRuleValue = PracticeFilterValue | PracticeLastResult | MasteryRating | number;
export type PracticeFilterOperator =
  | "greater"
  | "less"
  | "greaterOrEqual"
  | "lessOrEqual"
  | "equal"
  | "notEqual";

export type PracticeFilterCombinator = "and" | "or";

export interface PracticeFilterRule {
  field: PracticeFilterField;
  type?: "tuple";
  filter?: PracticeFilterOperator;
  value?: PracticeFilterRuleValue;
  includes?: Array<PracticeFilterValue | MasteryRating>;
  /** Query-builder lock state. It does not remove the rule from evaluation. */
  disabled?: boolean;
  /** Manual bypass: the rule stays editable but is ignored during evaluation. */
  bypassed?: boolean;
}

export interface PracticeFilterGroup {
  glue: PracticeFilterCombinator;
  /** Connectors between adjacent rules, when they differ from `glue`. */
  combinators?: PracticeFilterCombinator[];
  name?: string;
  not?: boolean;
  /** Query-builder lock state. It does not remove the group from evaluation. */
  disabled?: boolean;
  /** Manual bypass: the group stays editable but is ignored during evaluation. */
  bypassed?: boolean;
  rules: Array<PracticeFilterRule | PracticeFilterGroup>;
}

export type PracticeFilter = LegacyPracticeFilter | PracticeFilterGroup;

export interface QuestionFilterInput {
  questions: readonly Question[];
  topics: readonly TopicNode[];
  rootTopicId?: string;
  filter?: PracticeFilter;
  aggregates?: ReadonlyMap<string, AttemptAggregate>;
  dueQuestionIds?: ReadonlySet<string>;
  bookmarkedQuestionIds?: ReadonlySet<string>;
  reviewThreshold?: number;
  /** Reference clock for the relative "days since last attempt" comparisons. */
  now?: number;
}

function descendantTopicIds(topics: readonly TopicNode[], rootTopicId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const topic of topics) {
    if (!topic.parentId) continue;
    children.set(topic.parentId, [...(children.get(topic.parentId) ?? []), topic.id]);
  }
  const ids = new Set<string>();
  const queue = [rootTopicId];
  while (queue.length) {
    const id = queue.shift()!;
    if (ids.has(id)) continue;
    ids.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return ids;
}

function isLegacyPracticeFilter(value: unknown): value is LegacyPracticeFilter {
  return typeof value === "string" && LEGACY_PRACTICE_FILTERS.includes(value as LegacyPracticeFilter);
}

function isPracticeFilterField(value: unknown): value is PracticeFilterField {
  return typeof value === "string" && PRACTICE_FILTER_FIELDS.includes(value as PracticeFilterField);
}

function isPracticeFilterValue(value: unknown): value is PracticeFilterValue {
  return value === "yes" || value === "no";
}

function isPracticeLastResult(value: unknown): value is PracticeLastResult {
  return value === "correct" || value === "wrong" || value === "unattempted";
}

function isMasteryRating(value: unknown): value is MasteryRating {
  return value === "again" || value === "hard" || value === "good" || value === "easy";
}

function isPracticeFilterOperator(value: unknown): value is PracticeFilterOperator {
  return ["greater", "less", "greaterOrEqual", "lessOrEqual", "equal", "notEqual"].includes(String(value));
}

/** Accepts the widened rule payloads: yes/no tokens, last-result tokens, and finite numbers (numeric strings coerce). */
function isPracticeFilterRuleValue(value: unknown): value is PracticeFilterRuleValue {
  if (isPracticeFilterValue(value) || isPracticeLastResult(value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim() !== "") return Number.isFinite(Number(value));
  return false;
}

function normalizePracticeFilterRule(value: unknown): PracticeFilterRule | PracticeFilterGroup | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (Array.isArray(candidate.rules)) {
    const name = typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : undefined;
    const rules = candidate.rules
      .map(normalizePracticeFilterRule)
      .filter((rule): rule is PracticeFilterRule | PracticeFilterGroup => Boolean(rule));
    const glue: PracticeFilterCombinator = candidate.glue === "or" ? "or" : "and";
    const rawCombinators = Array.isArray(candidate.combinators)
      ? candidate.combinators.filter((item): item is PracticeFilterCombinator => item === "and" || item === "or")
      : [];
    const combinators = rawCombinators.length === Math.max(0, rules.length - 1)
      ? rawCombinators
      : undefined;
    return {
      glue,
      ...(combinators && combinators.some((item) => item !== glue) ? { combinators } : {}),
      ...(name ? { name } : {}),
      ...(candidate.not === true ? { not: true } : {}),
      ...(candidate.disabled === true ? { disabled: true } : {}),
      ...(candidate.bypassed === true ? { bypassed: true } : {}),
      rules,
    };
  }
  if (!isPracticeFilterField(candidate.field)) return undefined;
  const rule: PracticeFilterRule = {
    field: candidate.field,
    type: "tuple",
    filter: isPracticeFilterOperator(candidate.filter) ? candidate.filter : "equal",
  };
  if (isPracticeFilterRuleValue(candidate.value)) {
    rule.value = typeof candidate.value === "string" && !isPracticeFilterValue(candidate.value) && !isPracticeLastResult(candidate.value)
      ? Number(candidate.value)
      : candidate.value;
  }
  if (Array.isArray(candidate.includes)) {
    rule.includes = [...new Set(candidate.includes.filter(
      (item): item is PracticeFilterValue | MasteryRating => isPracticeFilterValue(item) || isMasteryRating(item),
    ))];
  }
  if (candidate.disabled === true) rule.disabled = true;
  if (candidate.bypassed === true) rule.bypassed = true;
  return rule;
}

export function normalizePracticeFilter(
  value: unknown,
  fallback: PracticeFilter = "all",
): PracticeFilter {
  if (isLegacyPracticeFilter(value)) return value;
  const normalized = normalizePracticeFilterRule(value);
  return normalized && "rules" in normalized ? normalized : fallback;
}

export function practiceFilterToCondition(filter: PracticeFilter): PracticeFilterGroup {
  if (typeof filter !== "string") {
    const normalized = normalizePracticeFilter(filter);
    return typeof normalized === "string" ? practiceFilterToCondition(normalized) : normalized;
  }
  const field = filter === "unattempted" ? "attempted" : filter;
  if (field === "all") return { glue: "and", rules: [] };
  return {
    glue: "and",
    rules: [{
      field,
      type: "tuple",
      filter: "equal",
      value: filter === "unattempted" ? "no" : "yes",
    }],
  };
}

/** Per-question facts the filter rules evaluate against. */
export interface QuestionFilterFacts {
  attempted: boolean;
  wrong: boolean;
  review: boolean;
  due: boolean;
  bookmarked: boolean;
  latestRating?: MasteryRating;
  lastResult: PracticeLastResult;
  wrongCount: number;
  attemptCount: number;
  daysSinceLastAnswered?: number;
}

function isBooleanFilterField(field: PracticeFilterField): field is PracticeBooleanFilterField {
  return (PRACTICE_BOOLEAN_FILTER_FIELDS as readonly string[]).includes(field);
}

function compareFilterNumber(actual: number, rule: PracticeFilterRule): boolean {
  const expected = typeof rule.value === "number" ? rule.value : Number(rule.value);
  if (!Number.isFinite(expected)) return true;
  switch (rule.filter ?? "equal") {
    case "notEqual": return actual !== expected;
    case "greater": return actual > expected;
    case "less": return actual < expected;
    case "greaterOrEqual": return actual >= expected;
    case "lessOrEqual": return actual <= expected;
    default: return actual === expected;
  }
}

function matchesPracticeFilterRule(
  rule: PracticeFilterRule | PracticeFilterGroup,
  facts: QuestionFilterFacts,
): boolean {
  if (rule.bypassed === true) return true;
  if ("rules" in rule) {
    if (rule.rules.length === 0) return rule.not !== true;
    const results = rule.rules.map((child) => matchesPracticeFilterRule(child, facts));
    const combinators = rule.rules.length > 1
      ? rule.rules.slice(0, -1).map((_, index) => rule.combinators?.[index] ?? rule.glue)
      : [];
    // Independent-combinator queries use normal boolean precedence: AND binds tighter than OR.
    const chains: boolean[] = [];
    let chain = results[0];
    for (let index = 1; index < results.length; index += 1) {
      if (combinators[index - 1] === "and") {
        chain = chain && results[index];
      } else {
        chains.push(chain);
        chain = results[index];
      }
    }
    chains.push(chain);
    const value = chains.some(Boolean);
    return rule.not === true ? !value : value;
  }

  if (isBooleanFilterField(rule.field)) {
    const actual = facts[rule.field] ? "yes" : "no";
    if (rule.includes?.length) return rule.includes.includes(actual as PracticeFilterValue);
    if (!rule.value) return true;
    const actualNumber = actual === "yes" ? 1 : 0;
    const expectedNumber = rule.value === "yes" ? 1 : 0;
    switch (rule.filter ?? "equal") {
      case "notEqual": return actual !== rule.value;
      case "greater": return actualNumber > expectedNumber;
      case "less": return actualNumber < expectedNumber;
      case "greaterOrEqual": return actualNumber >= expectedNumber;
      case "lessOrEqual": return actualNumber <= expectedNumber;
      default: return actual === rule.value;
    }
  }

  switch (rule.field) {
    case "latest_rating": {
      const ratings = [
        ...(rule.includes ?? []).filter(isMasteryRating),
        ...(isMasteryRating(rule.value) ? [rule.value] : []),
      ];
      if (!ratings.length) return true;
      // Unrated questions have no rating to compare against either side.
      if (facts.latestRating === undefined) return false;
      const contained = ratings.includes(facts.latestRating);
      return rule.filter === "notEqual" ? !contained : contained;
    }
    case "last_result": {
      if (!isPracticeLastResult(rule.value)) return true;
      const equal = facts.lastResult === rule.value;
      return rule.filter === "notEqual" ? !equal : equal;
    }
    case "wrong_count":
      return compareFilterNumber(facts.wrongCount, rule);
    case "attempt_count":
      return compareFilterNumber(facts.attemptCount, rule);
    case "last_answered_days": {
      const expected = typeof rule.value === "number" ? rule.value : Number(rule.value);
      if (!Number.isFinite(expected)) return true;
      // "Answered more than N days ago" presumes a previous attempt; never-attempted questions match neither side.
      if (facts.daysSinceLastAnswered === undefined) return false;
      return compareFilterNumber(facts.daysSinceLastAnswered, rule);
    }
    default:
      return true;
  }
}

export function practiceFilterTargetsDueCards(filter: PracticeFilter): boolean {
  if (filter === "due") return true;
  if (typeof filter === "string") return false;
  return filter.rules.some((rule) => {
    if (rule.bypassed === true) return false;
    if ("rules" in rule) return practiceFilterTargetsDueCards(rule);
    if (rule.field !== "due") return false;
    if (rule.includes?.length) return rule.includes.includes("yes");
    if (!rule.value) return false;
    return matchesPracticeFilterRule(rule, {
      attempted: false,
      wrong: false,
      review: false,
      due: true,
      bookmarked: false,
      lastResult: "unattempted",
      wrongCount: 0,
      attemptCount: 0,
    });
  });
}

export function filterQuestions(input: QuestionFilterInput): Question[] {
  const filter = input.filter ?? "all";
  const topicIds = input.rootTopicId
    ? descendantTopicIds(input.topics, input.rootTopicId)
    : undefined;
  const nowMs = input.now ?? Date.now();
  return input.questions.filter((question) => {
    if (question.type === "group") return false;
    const questionScopeId = question.metadata.scopeTopicId ?? question.metadata.topicId;
    if (topicIds && (!questionScopeId || !topicIds.has(questionScopeId))) return false;
    const aggregate = input.aggregates?.get(question.id);
    const answeredAtMs = aggregate?.lastAnsweredAt ? Date.parse(aggregate.lastAnsweredAt) : undefined;
    const facts: QuestionFilterFacts = {
      attempted: (aggregate?.attempts ?? 0) > 0,
      wrong: (aggregate?.objectiveIncorrect ?? 0) > 0,
      review: (aggregate?.consecutiveReviewCount ?? 0) >= (input.reviewThreshold ?? 2),
      due: input.dueQuestionIds?.has(question.id) ?? false,
      bookmarked: input.bookmarkedQuestionIds?.has(question.id) ?? false,
      latestRating: aggregate?.latestRating,
      lastResult: aggregate?.latestObjectiveCorrect === undefined
        ? "unattempted"
        : aggregate.latestObjectiveCorrect ? "correct" : "wrong",
      wrongCount: aggregate?.objectiveIncorrect ?? 0,
      attemptCount: aggregate?.attempts ?? 0,
      daysSinceLastAnswered: answeredAtMs !== undefined && Number.isFinite(answeredAtMs)
        ? Math.max(0, (nowMs - answeredAtMs) / 86400000)
        : undefined,
    };
    return matchesPracticeFilterRule(practiceFilterToCondition(filter), facts);
  });
}
