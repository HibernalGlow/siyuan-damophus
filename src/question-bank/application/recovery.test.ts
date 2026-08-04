import { describe, expect, it } from "vitest";
import { createAttemptArchive } from "../core/recovery";
import { createAttemptEvent } from "../core/attempts";
import { createAttemptImportPlan } from "./recovery";

function event(attemptId: string, questionId: string) {
  return createAttemptEvent({
    attemptId,
    questionId,
    sessionId: "session-1",
    answeredAt: "2026-08-04T12:00:00.000Z",
    questionType: "subjective",
    objectiveCorrect: null,
    masteryRating: "good",
  });
}

describe("attempt import planning", () => {
  it("deduplicates existing and repeated events while reporting orphans", () => {
    const archive = createAttemptArchive([
      event("existing", "question-1"),
      event("new", "missing-question"),
      event("new", "missing-question"),
    ], "0.25.3", "2026-08-04T12:30:00.000Z");
    const plan = createAttemptImportPlan(
      archive,
      new Set(["existing"]),
      new Set(["question-1"]),
    );
    expect(plan.preview).toMatchObject({
      total: 3,
      importable: 1,
      duplicateAttemptIds: ["existing", "new"],
      orphanQuestionIds: ["missing-question"],
    });
    expect(plan.events.map((item) => item.attempt_id)).toEqual(["new"]);
  });
});
