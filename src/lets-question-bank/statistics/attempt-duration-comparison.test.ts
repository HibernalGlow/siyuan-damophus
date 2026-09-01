import { describe, expect, it } from "vitest";
import type { AttemptAggregate } from "@/question-bank/core/types";
import { compareAttemptDuration } from "./attempt-duration-comparison";

function aggregate(overrides: Partial<AttemptAggregate> = {}): AttemptAggregate {
  return {
    questionId: "q1",
    attempts: 2,
    timedAttempts: 2,
    totalDurationMs: 70_000,
    objectiveAttempts: 2,
    objectiveCorrect: 1,
    objectiveIncorrect: 1,
    consecutiveReviewCount: 0,
    consecutiveAgainCount: 0,
    consecutiveHardCount: 0,
    lastAttemptId: "previous-attempt",
    lastDurationMs: 30_000,
    previousDurationMs: 40_000,
    ...overrides,
  };
}

describe("compareAttemptDuration", () => {
  it("returns no comparison without a timed historical attempt", () => {
    expect(compareAttemptDuration({ currentDurationMs: 20_000, aggregate: undefined })).toEqual([]);
    expect(compareAttemptDuration({
      currentDurationMs: 20_000,
      aggregate: aggregate({ attempts: 1, timedAttempts: 0, totalDurationMs: 0, lastDurationMs: undefined }),
    })).toEqual([]);
  });

  it("compares a new reveal with the previous attempt and historical average", () => {
    expect(compareAttemptDuration({ currentDurationMs: 20_000, aggregate: aggregate() })).toEqual([
      expect.objectContaining({ benchmark: "previous", direction: "faster", deltaMs: 10_000 }),
      expect.objectContaining({ benchmark: "average", direction: "faster", deltaMs: 15_000, referenceDurationMs: 35_000 }),
    ]);
  });

  it("reports slower and equal comparisons", () => {
    expect(compareAttemptDuration({ currentDurationMs: 40_000, aggregate: aggregate() })).toEqual([
      expect.objectContaining({ benchmark: "previous", direction: "slower", deltaMs: 10_000 }),
      expect.objectContaining({ benchmark: "average", direction: "slower", deltaMs: 5_000 }),
    ]);
    expect(compareAttemptDuration({
      currentDurationMs: 30_000,
      aggregate: aggregate({ timedAttempts: 1, totalDurationMs: 30_000 }),
    })).toEqual([
      expect.objectContaining({ benchmark: "previous", direction: "same", deltaMs: 0 }),
      expect.objectContaining({ benchmark: "average", direction: "same", deltaMs: 0 }),
    ]);
  });

  it("excludes the current persisted attempt when a session is resumed", () => {
    expect(compareAttemptDuration({
      currentDurationMs: 20_000,
      currentAttemptId: "current-attempt",
      aggregate: aggregate({
        attempts: 3,
        timedAttempts: 3,
        totalDurationMs: 90_000,
        lastAttemptId: "current-attempt",
        lastDurationMs: 20_000,
        previousDurationMs: 30_000,
      }),
    })).toEqual([
      expect.objectContaining({ benchmark: "previous", direction: "faster", deltaMs: 10_000 }),
      expect.objectContaining({ benchmark: "average", direction: "faster", deltaMs: 15_000, referenceDurationMs: 35_000 }),
    ]);
  });
});
