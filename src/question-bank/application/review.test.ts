import { describe, expect, it } from "vitest";
import { shouldAutoCreateQuickCard } from "./review";

describe("Riff review application policy", () => {
  it("creates a quick card only when the configured threshold is reached", () => {
    const aggregate = {
      questionId: "q1",
      attempts: 2,
      objectiveAttempts: 2,
      objectiveCorrect: 0,
      objectiveIncorrect: 2,
      consecutiveReviewCount: 2,
    };
    expect(shouldAutoCreateQuickCard(aggregate, 2)).toBe(true);
    expect(shouldAutoCreateQuickCard(aggregate, 1)).toBe(false);
    expect(shouldAutoCreateQuickCard(aggregate, 0)).toBe(false);
  });
});
