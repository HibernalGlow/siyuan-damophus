import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "./attempts";
import { applyAttemptRatingEvents, createAttemptRatingEvent } from "./rating-corrections";

describe("attempt rating corrections", () => {
  it("projects the latest correction without changing or duplicating the attempt", () => {
    const original = createAttemptEvent({
      attemptId: "attempt-1",
      questionId: "question-1",
      sessionId: "session-1",
      answeredAt: "2026-08-08T08:00:00.000Z",
      questionType: "single",
      objectiveCorrect: true,
      masteryRating: "good",
    });
    const corrections = [
      createAttemptRatingEvent({
        eventId: "rating-1",
        attemptId: original.attempt_id,
        masteryRating: "hard",
        changedAt: "2026-08-08T08:01:00.000Z",
      }),
      createAttemptRatingEvent({
        eventId: "rating-2",
        attemptId: original.attempt_id,
        masteryRating: "easy",
        changedAt: "2026-08-08T08:02:00.000Z",
      }),
    ];

    const projected = applyAttemptRatingEvents([original], corrections);
    expect(projected).toHaveLength(1);
    expect(projected[0]).toMatchObject({attempt_id: "attempt-1", mastery_rating: "easy"});
    expect(original.mastery_rating).toBe("good");
  });
});
