import type { StatisticsMetric } from "./statistics";

export type SubjectQuestionTotals = Readonly<Record<string, number>>;

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
