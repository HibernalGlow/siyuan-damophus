import type { AttemptAggregate } from "../core/types";

export function shouldAutoCreateQuickCard(
  aggregate: AttemptAggregate | undefined,
  threshold: number,
): boolean {
  return Number.isInteger(threshold)
    && threshold > 0
    && aggregate?.consecutiveReviewCount === threshold;
}
