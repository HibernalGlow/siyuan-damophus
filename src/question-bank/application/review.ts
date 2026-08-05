import type { AttemptAggregate } from "../core/types";

export interface QuickCardThresholds {
  again: number;
  hard: number;
}

export function shouldAutoCreateQuickCard(
  aggregate: AttemptAggregate | undefined,
  thresholds: QuickCardThresholds,
): boolean {
  if (!aggregate || !aggregate.latestRating) return false;
  const rating = aggregate.latestRating;
  if (rating !== "again" && rating !== "hard") return false;

  const threshold = thresholds[rating];
  const consecutiveCount = rating === "again"
    ? aggregate.consecutiveAgainCount
    : aggregate.consecutiveHardCount;
  return Number.isInteger(threshold)
    && threshold > 0
    && consecutiveCount === threshold;
}
