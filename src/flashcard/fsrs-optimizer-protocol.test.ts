import { describe, expect, it } from "vitest";
import {
  buildFsrsTrainingDataset,
  formatFsrsWeights,
  parseFsrsWeights,
  riffStateToOptimizerState,
  validateOptimizationResult,
} from "./fsrs-optimizer-protocol";
import type { RiffReviewLogEntry } from "./review-log-export";

function review(overrides: Partial<RiffReviewLogEntry> = {}): RiffReviewLogEntry {
  return {
    id: "review-1",
    cardId: "20260824000000-card001",
    rating: 3,
    scheduledDays: 4,
    elapsedDays: 5,
    reviewed: 1_700_000_000,
    state: 2,
    ...overrides,
  };
}

describe("FSRS optimizer protocol", () => {
  it("maps all current SiYuan Riff states to the FSRS optimizer states", () => {
    expect([0, 1, 2, 3].map(riffStateToOptimizerState)).toEqual([0, 0, 1, 2]);
    expect(() => riffStateToOptimizerState(4)).toThrow("Riff review state");
  });

  it("creates deterministic numeric card ids and unique millisecond review ids", () => {
    const dataset = buildFsrsTrainingDataset([
      review({ id: "b", cardId: "card-b", reviewed: 20, state: 3 }),
      review({ id: "a2", cardId: "card-a", reviewed: 10, rating: 2 }),
      review({ id: "a1", cardId: "card-a", reviewed: 10, rating: 1, state: 1 }),
    ]);
    expect(dataset.records).toEqual([
      { cardId: 1, reviewTime: 10_000, rating: 1, state: 0 },
      { cardId: 1, reviewTime: 10_001, rating: 2, state: 1 },
      { cardId: 2, reviewTime: 20_000, rating: 3, state: 2 },
    ]);
    expect(dataset.cardCount).toBe(2);
    expect(dataset.optimizerVersion).toBe("2.0.4");
    expect(dataset.parameterCount).toBe(19);
  });

  it("rejects invalid review data before opening the optimizer", () => {
    expect(() => buildFsrsTrainingDataset([review({ rating: 0 })])).toThrow("Riff review rating");
    expect(() => buildFsrsTrainingDataset([review({ state: 8 })])).toThrow("Riff review state");
  });

  it("round-trips exactly nineteen finite weights", () => {
    const weights = Array.from({ length: 19 }, (_, index) => index + 0.123456789);
    expect(parseFsrsWeights(formatFsrsWeights(weights))).toHaveLength(19);
    expect(() => parseFsrsWeights("1,2,3")).toThrow("exactly 19");
    expect(() => parseFsrsWeights(`${Array(18).fill("1").join(",")},NaN`)).toThrow("not finite");
  });

  it("fails closed for a result from a newer 21-parameter optimizer", () => {
    expect(() => validateOptimizationResult({
      schema: 1,
      optimizerVersion: "3.0.0",
      parameterCount: 21,
      weights: Array(21).fill(1),
      durationMs: 100,
      sourceRecordCount: 5,
      cardCount: 2,
    })).toThrow("Unexpected optimizer version");
  });
});
