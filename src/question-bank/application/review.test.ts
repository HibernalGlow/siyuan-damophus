import { describe, expect, it } from "vitest";
import { shouldAutoCreateQuickCard } from "./review";

describe("Riff review application policy", () => {
  it("uses independent Again and Hard thresholds for quick-card creation", () => {
    const aggregate = {
      questionId: "q1", attempts: 2, objectiveAttempts: 2, objectiveCorrect: 0,
      objectiveIncorrect: 2, consecutiveReviewCount: 2, consecutiveAgainCount: 2,
      consecutiveHardCount: 0, latestRating: "again" as const,
    };
    const thresholds = { again: 2, hard: 1 };
    expect(shouldAutoCreateQuickCard(aggregate, thresholds)).toBe(true);
    expect(shouldAutoCreateQuickCard({
      ...aggregate, consecutiveAgainCount: 1, consecutiveHardCount: 1, latestRating: "hard",
    }, thresholds)).toBe(true);
    expect(shouldAutoCreateQuickCard({ ...aggregate, consecutiveAgainCount: 3 }, thresholds)).toBe(false);
    expect(shouldAutoCreateQuickCard({ ...aggregate, latestRating: "good" }, thresholds)).toBe(false);
  });
});
