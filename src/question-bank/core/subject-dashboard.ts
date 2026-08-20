import type { StatisticsMetric } from "./statistics";

export type SubjectQuestionTotals = Readonly<Record<string, number>>;

export const statisticsCardMinHeight = 120;
export const statisticsCardMaxHeight = 720;
export const statisticsCardDefaultHeight = 240;

export interface StatisticsLayout {
  heights: Record<string, number>;
}

export const defaultStatisticsLayout: StatisticsLayout = {
  heights: {},
};

export function normalizeStatisticsLayout(value: unknown): StatisticsLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultStatisticsLayout;
  const raw = value as {heights?: unknown};
  const heights = raw.heights && typeof raw.heights === "object" && !Array.isArray(raw.heights)
    ? Object.fromEntries(Object.entries(raw.heights).flatMap(([id, height]) => {
      const normalized = Number(height);
      if (!id.trim() || !Number.isFinite(normalized) || normalized <= 0) return [];
      return [[id, Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, Math.round(normalized)))]];
    }))
    : {};
  return { heights };
}

export function normalizeSubjectQuestionTotals(value: unknown): SubjectQuestionTotals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([subjectId, total]) => {
    const normalizedId = subjectId.trim();
    const normalizedTotal = Number(total);
    if (!normalizedId || !Number.isFinite(normalizedTotal) || normalizedTotal <= 0) return [];
    return [[normalizedId, Math.floor(normalizedTotal)]];
  }));
}

export function subjectPlannedTotal(
  metric: Pick<StatisticsMetric, "totalQuestions">,
  configuredTotal: number | undefined,
): number {
  if (!configuredTotal) return metric.totalQuestions;
  return Math.max(metric.totalQuestions, configuredTotal);
}

export function subjectCompletionPercent(attemptedQuestions: number, plannedTotal: number): number {
  if (plannedTotal <= 0) return 0;
  return Math.round((Math.min(attemptedQuestions, plannedTotal) / plannedTotal) * 1000) / 10;
}
