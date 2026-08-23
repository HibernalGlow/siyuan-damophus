import { describe, expect, it } from "vitest";
import { formatReviewAge, readReviewCardStats, reviewLapseRate } from "./review-stats";

describe("review card statistics", () => {
  it("reads common Riff aliases and nested card data", () => {
    const stats = readReviewCardStats({
      blockID: "block",
      cardID: "card",
      riffCard: { reps: 8, lapses: 2, due: 1_700_259_200, lastReview: 1_700_000_000 },
    });
    expect(stats).toEqual({ reviews: 8, lapses: 2, lastReview: 1_700_000_000, interval: 3 });
    expect(reviewLapseRate(stats)).toBe(0.25);
  });

  it("does not invent rates when the review total is unavailable", () => {
    expect(reviewLapseRate({ lapses: 1 })).toBeUndefined();
    expect(reviewLapseRate({ reviews: 0, lapses: 0 })).toBeUndefined();
  });

  it("formats seconds, milliseconds, and missing review timestamps", () => {
    const now = 1_700_000_000_000;
    expect(formatReviewAge(1_699_913_600, now)).toBe("1 天前");
    expect(formatReviewAge(now - 3_600_000, now)).toBe("1 小时前");
    expect(formatReviewAge(undefined, now)).toBe("从未复习");
  });
});
