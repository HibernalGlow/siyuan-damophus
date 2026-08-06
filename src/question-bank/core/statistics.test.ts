import { describe, expect, it } from "vitest";
import { buildStatistics, beijingDate, type StatisticsQuestion } from "./statistics";
import type { AttemptEvent } from "./types";

const questions: StatisticsQuestion[] = [
  { questionId: "q-civil", questionType: "single", subject: "民法", category: "担保", year: "2025", topicId: "security" },
  { questionId: "q-criminal", questionType: "multiple", subject: "刑法", category: "总则", year: "2024", topicId: "general" },
  { questionId: "q-subjective", questionType: "subjective", subject: "民法", category: "担保", year: "2025", topicId: "security" },
];

function attempt(input: Partial<AttemptEvent> & Pick<AttemptEvent, "attempt_id" | "question_id" | "answered_at">): AttemptEvent {
  return {
    schema_version: 1,
    attempt_id: input.attempt_id,
    question_id: input.question_id,
    session_id: "session-1",
    answered_at: input.answered_at,
    question_type: input.question_type ?? "single",
    option_order: [],
    selected_option_ids: [],
    objective_correct: input.objective_correct === undefined ? false : input.objective_correct,
    mastery_rating: input.mastery_rating ?? "again",
    duration_ms: input.duration_ms,
  };
}

describe("statistics", () => {
  it("uses Beijing calendar days at the UTC boundary", () => {
    expect(beijingDate("2026-08-05T15:59:59.000Z")).toBe("2026-08-05");
    expect(beijingDate("2026-08-05T16:00:00.000Z")).toBe("2026-08-06");
  });

  it("builds all-library overview, trend and distributions", () => {
    const result = buildStatistics(questions, [
      attempt({ attempt_id: "a1", question_id: "q-civil", answered_at: "2026-08-05T15:59:59.000Z", objective_correct: true, mastery_rating: "good", duration_ms: 1000 }),
      attempt({ attempt_id: "a2", question_id: "q-civil", answered_at: "2026-08-05T16:00:00.000Z", objective_correct: false, mastery_rating: "again", duration_ms: 3000 }),
      attempt({ attempt_id: "a3", question_id: "q-subjective", answered_at: "2026-08-06T01:00:00.000Z", question_type: "subjective", objective_correct: null, mastery_rating: "hard", subjective_score: 55 }),
    ], "all", Date.parse("2026-08-06T02:00:00.000Z"));

    expect(result.overview.totalQuestions).toBe(3);
    expect(result.overview.attemptedQuestions).toBe(2);
    expect(result.overview.attempts).toBe(3);
    expect(result.overview.accuracy).toBe(50);
    expect(result.trend.map((point) => point.date)).toEqual(["2026-08-05", "2026-08-06"]);
    expect(result.distributions.find((item) => item.dimension === "subject")?.items[0]).toMatchObject({
      label: "民法",
      totalQuestions: 2,
      attempts: 3,
    });
  });

  it("filters a rolling range and ranks weak questions without mutation", () => {
    const now = Date.parse("2026-08-06T02:00:00.000Z");
    const result = buildStatistics(questions, [
      attempt({ attempt_id: "old", question_id: "q-civil", answered_at: "2026-07-01T00:00:00.000Z", objective_correct: false }),
      attempt({ attempt_id: "recent", question_id: "q-criminal", answered_at: "2026-08-05T00:00:00.000Z", objective_correct: false, mastery_rating: "again" }),
      attempt({ attempt_id: "recent-good", question_id: "q-civil", answered_at: "2026-08-05T01:00:00.000Z", objective_correct: true, mastery_rating: "good" }),
    ], 7, now, "weakness");

    expect(result.overview.attempts).toBe(2);
    expect(result.recentAttempts.map((item) => item.attemptId)).toEqual(["recent-good", "recent"]);
    expect(result.weakQuestions[0].questionId).toBe("q-criminal");
  });
});
