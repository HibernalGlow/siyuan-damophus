import type { RiffCardRecord } from "./siyuan-adapter";
import type { FlashcardReviewStatKey } from "./types";

export interface ReviewCardStats {
  reviews?: number;
  lapses?: number;
  lastReview?: number | string;
  interval?: number;
}

export interface ReviewStatDisplay {
  label: string;
  value: string;
}

function nestedCard(card: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = card.riffCard;
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function firstValue(card: Record<string, unknown>, nested: Record<string, unknown> | undefined, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (card[key] !== undefined && card[key] !== null && card[key] !== "") return card[key];
    if (nested?.[key] !== undefined && nested[key] !== null && nested[key] !== "") return nested[key];
  }
  return undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export function readReviewCardStats(card: RiffCardRecord | Record<string, unknown>): ReviewCardStats {
  const record = card as Record<string, unknown>;
  const nested = nestedCard(record);
  const lastReview = firstValue(record, nested, ["lastReview", "last_review", "latestReview", "lastReviewedAt", "last_review_time"]) as number | string | undefined;
  const explicitInterval = finiteNumber(firstValue(record, nested, ["interval", "ivl", "intervalDays", "interval_days"]));
  const due = firstValue(record, nested, ["due"]);
  const dueTimestamp = normalizeReviewTimestamp(due as number | string | undefined);
  const lastReviewTimestamp = normalizeReviewTimestamp(lastReview);
  const derivedInterval = dueTimestamp !== undefined && lastReviewTimestamp !== undefined
    ? Math.max(0, Math.round((dueTimestamp - lastReviewTimestamp) / 86_400_000))
    : undefined;
  return {
    reviews: finiteNumber(firstValue(record, nested, ["reps", "reviewCount", "reviews", "review_count"])),
    lapses: finiteNumber(firstValue(record, nested, ["lapses", "lapseCount", "failures", "errorCount", "lapse_count"])),
    lastReview,
    interval: explicitInterval ?? derivedInterval,
  };
}

export function reviewLapseRate(stats: ReviewCardStats): number | undefined {
  if (stats.reviews === undefined || stats.reviews <= 0 || stats.lapses === undefined) return undefined;
  return Math.max(0, Math.min(1, stats.lapses / stats.reviews));
}

export function normalizeReviewTimestamp(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  const timestamp = Number.isFinite(parsed) && parsed > 0
    ? parsed < 1_000_000_000_000 ? parsed * 1000 : parsed
    : Date.parse(String(value));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

export function formatReviewAge(value: number | string | undefined, now = Date.now()): string {
  const timestamp = normalizeReviewTimestamp(value);
  if (timestamp === undefined) return "从未复习";
  const elapsed = Math.max(0, now - timestamp);
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  if (elapsed < 30 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return `${Math.floor(elapsed / (30 * 86_400_000))} 个月前`;
}

export function reviewStatDisplay(key: FlashcardReviewStatKey, stats: ReviewCardStats, now = Date.now()): ReviewStatDisplay {
  if (key === "reviews") return { label: "复习", value: stats.reviews === undefined ? "—" : `${stats.reviews} 次` };
  if (key === "lastReview") return { label: "上次", value: formatReviewAge(stats.lastReview, now) };
  if (key === "lapses") return { label: "遗忘", value: stats.lapses === undefined ? "—" : `${stats.lapses} 次` };
  if (key === "lapseRate") {
    const value = reviewLapseRate(stats);
    return { label: "遗忘率", value: value === undefined ? "—" : `${Math.round(value * 100)}%` };
  }
  return { label: "间隔", value: stats.interval === undefined ? "—" : `${stats.interval} 天` };
}

export function formatReviewStat(key: FlashcardReviewStatKey, stats: ReviewCardStats, now = Date.now()): string {
  const display = reviewStatDisplay(key, stats, now);
  return `${display.label} ${display.value}`;
}
