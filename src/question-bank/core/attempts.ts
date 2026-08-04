import { AttemptEventSchema } from "./schema";
import type { AttemptAggregate, AttemptEvent, MasteryRating, QuestionType } from "./types";

export interface NewAttemptInput {
  attemptId: string;
  questionId: string;
  questionRelation?: string;
  sessionId: string;
  answeredAt?: string;
  questionType: QuestionType;
  optionOrder?: string[];
  selectedOptionIds?: string[];
  objectiveCorrect: boolean | null;
  masteryRating: MasteryRating;
  subjectiveScore?: number;
  durationMs?: number;
}

export function createAttemptEvent(input: NewAttemptInput): AttemptEvent {
  return AttemptEventSchema.parse({
    schema_version: 1,
    attempt_id: input.attemptId,
    question_id: input.questionId,
    question_relation: input.questionRelation,
    session_id: input.sessionId,
    answered_at: input.answeredAt ?? new Date().toISOString(),
    question_type: input.questionType,
    option_order: input.optionOrder ?? [],
    selected_option_ids: input.selectedOptionIds ?? [],
    objective_correct: input.objectiveCorrect,
    mastery_rating: input.masteryRating,
    subjective_score: input.subjectiveScore,
    duration_ms: input.durationMs,
  }) as AttemptEvent;
}

export function aggregateAttemptEvents(events: readonly AttemptEvent[]): Map<string, AttemptAggregate> {
  const ordered = [...events].sort((left, right) => left.answered_at.localeCompare(right.answered_at));
  const result = new Map<string, AttemptAggregate>();
  for (const event of ordered) {
    const aggregate = result.get(event.question_id) ?? {
      questionId: event.question_id,
      attempts: 0,
      objectiveAttempts: 0,
      objectiveCorrect: 0,
      objectiveIncorrect: 0,
      consecutiveReviewCount: 0,
    };
    aggregate.attempts += 1;
    if (event.objective_correct !== null) {
      aggregate.objectiveAttempts += 1;
      if (event.objective_correct) aggregate.objectiveCorrect += 1;
      else aggregate.objectiveIncorrect += 1;
    }
    aggregate.consecutiveReviewCount = ["again", "hard"].includes(event.mastery_rating)
      ? aggregate.consecutiveReviewCount + 1
      : 0;
    aggregate.latestRating = event.mastery_rating;
    aggregate.lastAnsweredAt = event.answered_at;
    result.set(event.question_id, aggregate);
  }
  return result;
}
