import { AttemptRatingEventSchema } from "./schema";
import type { AttemptEvent, AttemptRatingEvent, MasteryRating } from "./types";

export function createAttemptRatingEvent(input: {
  eventId: string;
  attemptId: string;
  masteryRating: MasteryRating;
  changedAt?: string;
}): AttemptRatingEvent {
  return AttemptRatingEventSchema.parse({
    schema_version: 1,
    event_kind: "attempt_rating_changed",
    event_id: input.eventId,
    attempt_id: input.attemptId,
    mastery_rating: input.masteryRating,
    changed_at: input.changedAt ?? new Date().toISOString(),
  }) as AttemptRatingEvent;
}

export function applyAttemptRatingEvents(
  attempts: readonly AttemptEvent[],
  corrections: readonly AttemptRatingEvent[],
): AttemptEvent[] {
  const latestByAttempt = new Map<string, AttemptRatingEvent>();
  for (const correction of [...corrections].sort((left, right) => (
    left.changed_at.localeCompare(right.changed_at) || left.event_id.localeCompare(right.event_id)
  ))) latestByAttempt.set(correction.attempt_id, correction);

  return attempts.map((attempt) => {
    const correction = latestByAttempt.get(attempt.attempt_id);
    return correction ? { ...attempt, mastery_rating: correction.mastery_rating } : attempt;
  });
}
