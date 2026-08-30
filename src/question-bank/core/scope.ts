import type { AttemptAggregate, Question, TopicNode } from "./types";

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
] as const;

export type LegacyPracticeFilter = typeof LEGACY_PRACTICE_FILTERS[number];
export type PracticeFilterField = typeof PRACTICE_FILTER_FIELDS[number];
export type PracticeFilterValue = "yes" | "no";
export type PracticeFilterOperator =
  | "greater"
  | "less"
  | "greaterOrEqual"
  | "lessOrEqual"
  | "equal"
  | "notEqual";

export interface PracticeFilterRule {
  field: PracticeFilterField;
  type?: "tuple";
  filter?: PracticeFilterOperator;
  value?: PracticeFilterValue;
  includes?: PracticeFilterValue[];
}

export interface PracticeFilterGroup {
  glue: "and" | "or";
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

function isPracticeFilterOperator(value: unknown): value is PracticeFilterOperator {
  return ["greater", "less", "greaterOrEqual", "lessOrEqual", "equal", "notEqual"].includes(String(value));
}

function normalizePracticeFilterRule(value: unknown): PracticeFilterRule | PracticeFilterGroup | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (Array.isArray(candidate.rules)) {
    return {
      glue: candidate.glue === "or" ? "or" : "and",
      rules: candidate.rules
        .map(normalizePracticeFilterRule)
        .filter((rule): rule is PracticeFilterRule | PracticeFilterGroup => Boolean(rule)),
    };
  }
  if (!isPracticeFilterField(candidate.field)) return undefined;
  const rule: PracticeFilterRule = {
    field: candidate.field,
    type: "tuple",
    filter: isPracticeFilterOperator(candidate.filter) ? candidate.filter : "equal",
  };
  if (isPracticeFilterValue(candidate.value)) rule.value = candidate.value;
  if (Array.isArray(candidate.includes)) {
    rule.includes = [...new Set(candidate.includes.filter(isPracticeFilterValue))];
  }
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

interface QuestionPracticeStates {
  attempted: boolean;
  wrong: boolean;
  review: boolean;
  due: boolean;
  bookmarked: boolean;
}

function matchesPracticeFilterRule(
  rule: PracticeFilterRule | PracticeFilterGroup,
  states: QuestionPracticeStates,
): boolean {
  if ("rules" in rule) {
    if (rule.rules.length === 0) return true;
    return rule.glue === "or"
      ? rule.rules.some((child) => matchesPracticeFilterRule(child, states))
      : rule.rules.every((child) => matchesPracticeFilterRule(child, states));
  }

  const actual = states[rule.field] ? "yes" : "no";
  if (rule.includes?.length) return rule.includes.includes(actual);
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

export function practiceFilterTargetsDueCards(filter: PracticeFilter): boolean {
  if (filter === "due") return true;
  if (typeof filter === "string") return false;
  return filter.rules.some((rule) => {
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
    });
  });
}

export function filterQuestions(input: QuestionFilterInput): Question[] {
  const filter = input.filter ?? "all";
  const topicIds = input.rootTopicId
    ? descendantTopicIds(input.topics, input.rootTopicId)
    : undefined;
  return input.questions.filter((question) => {
    if (question.type === "group") return false;
    const questionScopeId = question.metadata.scopeTopicId ?? question.metadata.topicId;
    if (topicIds && (!questionScopeId || !topicIds.has(questionScopeId))) return false;
    const aggregate = input.aggregates?.get(question.id);
    const states: QuestionPracticeStates = {
      attempted: (aggregate?.attempts ?? 0) > 0,
      wrong: (aggregate?.objectiveIncorrect ?? 0) > 0,
      review: (aggregate?.consecutiveReviewCount ?? 0) >= (input.reviewThreshold ?? 2),
      due: input.dueQuestionIds?.has(question.id) ?? false,
      bookmarked: input.bookmarkedQuestionIds?.has(question.id) ?? false,
    };
    return matchesPracticeFilterRule(practiceFilterToCondition(filter), states);
  });
}
