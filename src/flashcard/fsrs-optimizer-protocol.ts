import type { RiffReviewLogEntry } from "./review-log-export";

export const FSRS_BROWSER_VERSION = "2.0.4";
export const FSRS_PARAMETER_COUNT = 19;
export const FSRS_OPTIMIZER_PORT = 52370;
export const FSRS_OPTIMIZER_SCHEMA = 1;

export interface FsrsTrainingRecord {
  cardId: number;
  reviewTime: number;
  rating: number;
  state: number;
}

export interface FsrsTrainingDataset {
  schema: typeof FSRS_OPTIMIZER_SCHEMA;
  optimizerVersion: typeof FSRS_BROWSER_VERSION;
  parameterCount: typeof FSRS_PARAMETER_COUNT;
  records: FsrsTrainingRecord[];
  sourceRecordCount: number;
  cardCount: number;
  firstReviewedAt?: number;
  lastReviewedAt?: number;
}

export interface FsrsOptimizationResult {
  schema: typeof FSRS_OPTIMIZER_SCHEMA;
  optimizerVersion: typeof FSRS_BROWSER_VERSION;
  parameterCount: typeof FSRS_PARAMETER_COUNT;
  weights: number[];
  durationMs: number;
  sourceRecordCount: number;
  cardCount: number;
}

function assertIntegerInRange(value: number, minimum: number, maximum: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
}

export function riffStateToOptimizerState(state: number): number {
  assertIntegerInRange(state, 0, 3, "Riff review state");
  if (state <= 1) return 0;
  return state - 1;
}

export function buildFsrsTrainingDataset(entries: readonly RiffReviewLogEntry[]): FsrsTrainingDataset {
  const cardIds = new Map<string, number>();
  const sorted = [...entries].sort((left, right) => (
    left.cardId.localeCompare(right.cardId)
    || left.reviewed - right.reviewed
    || left.id.localeCompare(right.id)
  ));
  const duplicateSecondCounts = new Map<string, number>();
  const records = sorted.map((entry) => {
    assertIntegerInRange(entry.rating, 1, 4, "Riff review rating");
    assertIntegerInRange(entry.reviewed, 1, Number.MAX_SAFE_INTEGER, "Riff review timestamp");
    let cardId = cardIds.get(entry.cardId);
    if (!cardId) {
      cardId = cardIds.size + 1;
      cardIds.set(entry.cardId, cardId);
    }
    const secondKey = `${cardId}:${entry.reviewed}`;
    const sameSecondIndex = duplicateSecondCounts.get(secondKey) ?? 0;
    if (sameSecondIndex >= 1000) throw new Error(`Too many reviews in one second for card ${entry.cardId}`);
    duplicateSecondCounts.set(secondKey, sameSecondIndex + 1);
    return {
      cardId,
      reviewTime: entry.reviewed * 1000 + sameSecondIndex,
      rating: entry.rating,
      state: riffStateToOptimizerState(entry.state),
    };
  });
  return {
    schema: FSRS_OPTIMIZER_SCHEMA,
    optimizerVersion: FSRS_BROWSER_VERSION,
    parameterCount: FSRS_PARAMETER_COUNT,
    records,
    sourceRecordCount: entries.length,
    cardCount: cardIds.size,
    firstReviewedAt: records.length ? Math.min(...records.map((record) => record.reviewTime)) : undefined,
    lastReviewedAt: records.length ? Math.max(...records.map((record) => record.reviewTime)) : undefined,
  };
}

export function validateFsrsWeights(weights: readonly unknown[]): number[] {
  if (weights.length !== FSRS_PARAMETER_COUNT) {
    throw new Error(`FSRS ${FSRS_BROWSER_VERSION} must return exactly ${FSRS_PARAMETER_COUNT} parameters`);
  }
  return weights.map((value, index) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error(`FSRS parameter ${index + 1} is not finite`);
    return numeric;
  });
}

export function parseFsrsWeights(value: string): number[] {
  return validateFsrsWeights(value.split(",").map((part) => part.trim()));
}

export function formatFsrsWeights(weights: readonly unknown[]): string {
  return validateFsrsWeights(weights)
    .map((weight) => String(Number(weight.toPrecision(9))))
    .join(", ");
}

export function validateOptimizationResult(value: unknown): FsrsOptimizationResult {
  if (!value || typeof value !== "object") throw new Error("Optimizer result is not an object");
  const result = value as Partial<FsrsOptimizationResult>;
  if (result.schema !== FSRS_OPTIMIZER_SCHEMA) throw new Error("Unsupported optimizer result schema");
  if (result.optimizerVersion !== FSRS_BROWSER_VERSION) throw new Error("Unexpected optimizer version");
  if (result.parameterCount !== FSRS_PARAMETER_COUNT) throw new Error("Unexpected optimizer parameter count");
  if (!Array.isArray(result.weights)) throw new Error("Optimizer result has no weights");
  const durationMs = Number(result.durationMs);
  const sourceRecordCount = Number(result.sourceRecordCount);
  const cardCount = Number(result.cardCount);
  assertIntegerInRange(Math.round(durationMs), 0, Number.MAX_SAFE_INTEGER, "optimizer duration");
  assertIntegerInRange(sourceRecordCount, 0, Number.MAX_SAFE_INTEGER, "source record count");
  assertIntegerInRange(cardCount, 0, Number.MAX_SAFE_INTEGER, "card count");
  return {
    schema: FSRS_OPTIMIZER_SCHEMA,
    optimizerVersion: FSRS_BROWSER_VERSION,
    parameterCount: FSRS_PARAMETER_COUNT,
    weights: validateFsrsWeights(result.weights),
    durationMs,
    sourceRecordCount,
    cardCount,
  };
}
