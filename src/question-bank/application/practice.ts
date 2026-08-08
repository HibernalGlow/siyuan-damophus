import { filterQuestions, type PracticeFilter } from "../core/scope";
import { questionOptionIds } from "../core/session-schema";
import { shuffleQuestionOptions } from "../core/shuffle";
import type { AttemptAggregate, MasteryRating, Question, TopicNode } from "../core/types";

export type PracticeOrder = "sequential" | "random";
export type PracticeOptionOrder = "source" | "random";

export interface CreatePracticeQueueInput {
  questions: readonly Question[];
  topics: readonly TopicNode[];
  rootTopicId?: string;
  filter?: PracticeFilter;
  order?: PracticeOrder;
  aggregates?: ReadonlyMap<string, AttemptAggregate>;
  dueQuestionIds?: ReadonlySet<string>;
  reviewThreshold?: number;
  random?: () => number;
}

export function createPracticeQueue(input: CreatePracticeQueueInput): Question[] {
  const questions = filterQuestions(input);
  if ((input.order ?? "sequential") === "sequential") return questions;
  const random = input.random ?? Math.random;
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function createPracticeOptionOrder(
  question: Question,
  order: PracticeOptionOrder,
  random: () => number = Math.random,
): string[] {
  return order === "source"
    ? questionOptionIds(question)
    : shuffleQuestionOptions(question, random).optionOrder;
}

export function suggestedMasteryRating(
  objectiveCorrect: boolean | null,
  subjectiveScore?: number,
): MasteryRating {
  if (objectiveCorrect === false) return "again";
  if (objectiveCorrect === true) return "good";
  if (subjectiveScore !== undefined && subjectiveScore < 60) return "again";
  return "good";
}
