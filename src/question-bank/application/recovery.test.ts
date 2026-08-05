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
      new Map([["question-1", "20260804120000-quest01"]]),
    );
    expect(plan.preview).toMatchObject({
      total: 3,
      importable: 1,
      duplicateAttemptIds: ["existing", "new"],
      orphanQuestionIds: ["missing-question"],
    });
    expect(plan.events.map((item) => item.attempt_id)).toEqual(["new"]);
  });

  it("rebuilds current question relations and clears stale relations for orphans", () => {
    const known = { ...event("known", "question-1"), question_relation: "20250101000000-oldold1" };
    const orphan = { ...event("orphan", "missing-question"), question_relation: "20250101000001-oldold2" };
    const archive = createAttemptArchive(
      [known, orphan],
      "0.25.3",
      "2026-08-04T12:30:00.000Z",
    );

    const plan = createAttemptImportPlan(
      archive,
      new Set(),
      new Map([["question-1", "20260804120000-current"]]),
    );

    expect(plan.events[0].question_relation).toBe("20260804120000-current");
    expect(plan.events[1].question_relation).toBeUndefined();
    expect(plan.preview.orphanQuestionIds).toEqual(["missing-question"]);
  });
});
