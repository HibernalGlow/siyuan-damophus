import {
  evaluatePracticeFilterSpec,
  normalizePracticeFilterSpec,
  type PracticeFilterFacts,
  type PracticeFilterSpec,
} from "./filter-spec";
import type { AttemptAggregate, Question, TopicNode } from "./types";

/** Legacy single-choice filter values kept for settings and old persisted data. */
export type PracticeFilter = "all" | "unattempted" | "wrong" | "review" | "due" | "bookmarked";

export interface QuestionFilterInput {
  questions: readonly Question[];
  topics: readonly TopicNode[];
  rootTopicId?: string;
  filter?: PracticeFilter | PracticeFilterSpec;
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

export function questionFilterFacts(
  input: Pick<QuestionFilterInput, "aggregates" | "dueQuestionIds" | "bookmarkedQuestionIds" | "reviewThreshold">,
  question: Question,
): PracticeFilterFacts {
  const aggregate = input.aggregates?.get(question.id);
  return {
    unattempted: (aggregate?.attempts ?? 0) === 0,
    wrong: (aggregate?.objectiveIncorrect ?? 0) > 0,
    review: (aggregate?.consecutiveReviewCount ?? 0) >= (input.reviewThreshold ?? 2),
    due: input.dueQuestionIds?.has(question.id) ?? false,
    bookmarked: input.bookmarkedQuestionIds?.has(question.id) ?? false,
    "again-hard": aggregate?.latestRating === "again" || aggregate?.latestRating === "hard",
  };
}

export function filterQuestions(input: QuestionFilterInput): Question[] {
  const spec = normalizePracticeFilterSpec(input.filter ?? "all");
  const topicIds = input.rootTopicId
    ? descendantTopicIds(input.topics, input.rootTopicId)
    : undefined;
  return input.questions.filter((question) => {
    if (question.type === "group") return false;
    const questionScopeId = question.metadata.scopeTopicId ?? question.metadata.topicId;
    if (topicIds && (!questionScopeId || !topicIds.has(questionScopeId))) return false;
    return evaluatePracticeFilterSpec(spec, questionFilterFacts(input, question));
  });
}
