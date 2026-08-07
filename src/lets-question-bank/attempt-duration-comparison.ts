import type { AttemptAggregate } from "@/question-bank/core/types";

export type AttemptDurationDirection = "faster" | "slower" | "same";
export type AttemptDurationBenchmark = "previous" | "average";

export interface AttemptDurationComparison {
  benchmark: AttemptDurationBenchmark;
  direction: AttemptDurationDirection;
  currentDurationMs: number;
  referenceDurationMs: number;
  deltaMs: number;
}

function comparison(
  benchmark: AttemptDurationBenchmark,
  currentDurationMs: number,
  referenceDurationMs: number | undefined,
): AttemptDurationComparison | undefined {
  if (referenceDurationMs === undefined || !Number.isFinite(referenceDurationMs)) return undefined;
  const signedDeltaMs = currentDurationMs - referenceDurationMs;
  return {
    benchmark,
    direction: signedDeltaMs < 0 ? "faster" : signedDeltaMs > 0 ? "slower" : "same",
    currentDurationMs,
    referenceDurationMs,
    deltaMs: Math.abs(signedDeltaMs),
  };
}

export function compareAttemptDuration(input: {
  currentDurationMs: number | undefined;
  aggregate: AttemptAggregate | undefined;
  currentAttemptId?: string;
}): AttemptDurationComparison[] {
  const { currentDurationMs, aggregate, currentAttemptId } = input;
  if (currentDurationMs === undefined || !Number.isFinite(currentDurationMs) || !aggregate) return [];

  const currentIncluded = Boolean(currentAttemptId && aggregate.lastAttemptId === currentAttemptId);
  const previousDurationMs = currentIncluded ? aggregate.previousDurationMs : aggregate.lastDurationMs;
  const historicalTimedAttempts = (aggregate.timedAttempts ?? 0) - (currentIncluded ? 1 : 0);
  const historicalTotalDurationMs = (aggregate.totalDurationMs ?? 0)
    - (currentIncluded ? aggregate.lastDurationMs ?? 0 : 0);
  const averageDurationMs = historicalTimedAttempts > 0
    ? historicalTotalDurationMs / historicalTimedAttempts
    : undefined;

  return [
    comparison("previous", currentDurationMs, previousDurationMs),
    comparison("average", currentDurationMs, averageDurationMs),
  ].filter((item): item is AttemptDurationComparison => Boolean(item));
}
