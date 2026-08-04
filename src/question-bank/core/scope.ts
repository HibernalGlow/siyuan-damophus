import type { AttemptAggregate, Question, TopicNode } from "./types";

export type PracticeFilter = "all" | "wrong" | "review" | "due";

export interface QuestionFilterInput {
  questions: readonly Question[];
  topics: readonly TopicNode[];
  rootTopicId?: string;
  filter?: PracticeFilter;
  aggregates?: ReadonlyMap<string, AttemptAggregate>;
  dueQuestionIds?: ReadonlySet<string>;
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

export function filterQuestions(input: QuestionFilterInput): Question[] {
  const filter = input.filter ?? "all";
  const topicIds = input.rootTopicId
    ? descendantTopicIds(input.topics, input.rootTopicId)
    : undefined;
  return input.questions.filter((question) => {
    if (question.type === "group") return false;
    if (topicIds && (!question.metadata.topicId || !topicIds.has(question.metadata.topicId))) return false;
    const aggregate = input.aggregates?.get(question.id);
    if (filter === "wrong") return (aggregate?.objectiveIncorrect ?? 0) > 0;
    if (filter === "review") {
      return (aggregate?.consecutiveReviewCount ?? 0) >= (input.reviewThreshold ?? 2);
    }
    if (filter === "due") return input.dueQuestionIds?.has(question.id) ?? false;
    return true;
  });
}
