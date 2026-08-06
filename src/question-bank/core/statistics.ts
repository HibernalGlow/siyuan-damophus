import type { AttemptEvent, QuestionType } from "./types";

export type StatisticsRange = 7 | 30 | 90 | "all";
export type StatisticsDimension = "subject" | "category" | "year" | "question_type" | "collection";
export type StatisticsSort = "weakness" | "wrong" | "accuracy" | "recent";

export interface StatisticsQuestion {
  questionId: string;
  title?: string;
  questionType: QuestionType;
  subject?: string;
  category?: string;
  year?: string;
  collection?: string;
  topicId?: string;
  source?: string;
}

export interface StatisticsMetric {
  key: string;
  label: string;
  totalQuestions: number;
  attemptedQuestions: number;
  attempts: number;
  objectiveAttempts: number;
  correct: number;
  wrong: number;
  accuracy: number;
  averageDurationMs: number;
  totalDurationMs: number;
}

export interface StatisticsTrendPoint {
  date: string;
  attempts: number;
  correct: number;
  wrong: number;
  accuracy: number;
  averageDurationMs: number;
}

export interface StatisticsDistribution {
  dimension: StatisticsDimension;
  items: StatisticsMetric[];
}

export interface WeakQuestion {
  questionId: string;
  label: string;
  subject?: string;
  category?: string;
  topicId?: string;
  attempts: number;
  wrong: number;
  accuracy: number;
  averageDurationMs: number;
  latestRating?: AttemptEvent["mastery_rating"];
  lastAnsweredAt?: string;
  weaknessScore: number;
}

export interface StatisticsRecentAttempt {
  attemptId: string;
  questionId: string;
  answeredAt: string;
  objectiveCorrect: boolean | null;
  masteryRating: AttemptEvent["mastery_rating"];
  durationMs?: number;
}

export interface StatisticsSnapshot {
  range: StatisticsRange;
  timezone: "Asia/Shanghai";
  generatedAt: string;
  overview: StatisticsMetric;
  trend: StatisticsTrendPoint[];
  distributions: StatisticsDistribution[];
  weakQuestions: WeakQuestion[];
  recentAttempts: StatisticsRecentAttempt[];
}

const DIMENSIONS: readonly StatisticsDimension[] = [
  "subject",
  "category",
  "year",
  "question_type",
  "collection",
];

function dateParts(value: string | number): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function beijingDate(value: string | number): string {
  const parts = dateParts(value);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function metricLabel(key: string): string {
  return key || "Unclassified";
}

function questionDimension(question: StatisticsQuestion, dimension: StatisticsDimension): string {
  if (dimension === "question_type") return question.questionType;
  return question[dimension] || "Unclassified";
}

function createMetric(key: string, label = metricLabel(key)): StatisticsMetric {
  return {
    key,
    label,
    totalQuestions: 0,
    attemptedQuestions: 0,
    attempts: 0,
    objectiveAttempts: 0,
    correct: 0,
    wrong: 0,
    accuracy: 0,
    averageDurationMs: 0,
    totalDurationMs: 0,
  };
}

function finalizeMetric(metric: StatisticsMetric): StatisticsMetric {
  return {
    ...metric,
    accuracy: metric.objectiveAttempts > 0 ? Math.round((metric.correct / metric.objectiveAttempts) * 1000) / 10 : 0,
    averageDurationMs: metric.attempts > 0 ? Math.round(metric.totalDurationMs / metric.attempts) : 0,
  };
}

function applyQuestion(metric: StatisticsMetric, question: StatisticsQuestion): void {
  metric.totalQuestions += 1;
  void question;
}

function applyAttempt(metric: StatisticsMetric, attempt: AttemptEvent): void {
  metric.attempts += 1;
  if (attempt.objective_correct !== null) {
    metric.objectiveAttempts += 1;
    if (attempt.objective_correct) metric.correct += 1;
    else metric.wrong += 1;
  }
  metric.totalDurationMs += attempt.duration_ms ?? 0;
}

function rangeStart(now: number, range: StatisticsRange): number | undefined {
  if (range === "all") return undefined;
  const parts = dateParts(now);
  const beijingMidnightUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  ) - 8 * 60 * 60 * 1000;
  return beijingMidnightUtc - (range - 1) * 24 * 60 * 60 * 1000;
}

function inRange(attempt: AttemptEvent, start: number | undefined, now: number): boolean {
  const timestamp = Date.parse(attempt.answered_at);
  return Number.isFinite(timestamp) && timestamp <= now && (start === undefined || timestamp >= start);
}

function metricForQuestions(
  questions: readonly StatisticsQuestion[],
  attempts: readonly AttemptEvent[],
): StatisticsMetric {
  const metric = createMetric("all", "All");
  const questionIds = new Set(questions.map((question) => question.questionId));
  questions.forEach((question) => applyQuestion(metric, question));
  const attempted = new Set<string>();
  attempts.forEach((attempt) => {
    if (!questionIds.has(attempt.question_id)) return;
    attempted.add(attempt.question_id);
    applyAttempt(metric, attempt);
  });
  metric.attemptedQuestions = attempted.size;
  return finalizeMetric(metric);
}

export function buildStatistics(
  questions: readonly StatisticsQuestion[],
  attempts: readonly AttemptEvent[],
  range: StatisticsRange,
  now = Date.now(),
  sort: StatisticsSort = "weakness",
): StatisticsSnapshot {
  const start = rangeStart(now, range);
  const scopedAttempts = attempts.filter((attempt) => inRange(attempt, start, now));
  const questionById = new Map(questions.map((question) => [question.questionId, question]));
  const overview = metricForQuestions(questions, scopedAttempts);
  const attemptedById = new Set(scopedAttempts.map((attempt) => attempt.question_id));
  overview.attemptedQuestions = [...attemptedById].filter((id) => questionById.has(id)).length;

  const trendMap = new Map<string, StatisticsMetric>();
  scopedAttempts.forEach((attempt) => {
    const key = beijingDate(attempt.answered_at);
    const metric = trendMap.get(key) ?? createMetric(key, key);
    applyAttempt(metric, attempt);
    trendMap.set(key, metric);
  });
  const trend = [...trendMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, metric]) => {
      const finalized = finalizeMetric(metric);
      return {
        date,
        attempts: finalized.attempts,
        correct: finalized.correct,
        wrong: finalized.wrong,
        accuracy: finalized.accuracy,
        averageDurationMs: finalized.averageDurationMs,
      };
    });

  const distributions = DIMENSIONS.map((dimension) => {
    const metricMap = new Map<string, StatisticsMetric>();
    questions.forEach((question) => {
      const key = questionDimension(question, dimension);
      const metric = metricMap.get(key) ?? createMetric(key);
      applyQuestion(metric, question);
      metricMap.set(key, metric);
    });
    scopedAttempts.forEach((attempt) => {
      const question = questionById.get(attempt.question_id);
      if (!question) return;
      const key = questionDimension(question, dimension);
      const metric = metricMap.get(key) ?? createMetric(key);
      applyAttempt(metric, attempt);
      metricMap.set(key, metric);
    });
    return {
      dimension,
      items: [...metricMap.values()]
        .map((metric) => finalizeMetric(metric))
        .sort((left, right) => right.attempts - left.attempts || left.label.localeCompare(right.label))
        .slice(0, 20),
    };
  });

  const weakById = new Map<string, WeakQuestion>();
  scopedAttempts.forEach((attempt) => {
    const question = questionById.get(attempt.question_id);
    if (!question) return;
    const current = weakById.get(question.questionId) ?? {
      questionId: question.questionId,
      label: question.title || question.questionId,
      subject: question.subject,
      category: question.category,
      topicId: question.topicId,
      attempts: 0,
      wrong: 0,
      accuracy: 0,
      averageDurationMs: 0,
      latestRating: undefined,
      lastAnsweredAt: undefined,
      weaknessScore: 0,
    };
    current.attempts += 1;
    if (attempt.objective_correct === false) current.wrong += 1;
    current.averageDurationMs += attempt.duration_ms ?? 0;
    current.latestRating = attempt.mastery_rating;
    if (!current.lastAnsweredAt || attempt.answered_at > current.lastAnsweredAt) current.lastAnsweredAt = attempt.answered_at;
    weakById.set(question.questionId, current);
  });
  const weakQuestions = [...weakById.values()].map((item) => {
    const accuracy = item.attempts > 0 ? Math.round(((item.attempts - item.wrong) / item.attempts) * 1000) / 10 : 0;
    const averageDurationMs = item.attempts > 0 ? Math.round(item.averageDurationMs / item.attempts) : 0;
    const daysSince = item.lastAnsweredAt ? Math.max(0, (now - Date.parse(item.lastAnsweredAt)) / 86400000) : 0;
    const ratingWeight = item.latestRating === "again" ? 1 : item.latestRating === "hard" ? 0.65 : 0;
    const weaknessScore = Math.round((item.wrong / Math.max(1, item.attempts) * 60 + ratingWeight * 30 + Math.min(daysSince, 30) / 30 * 10) * 10) / 10;
    return { ...item, accuracy, averageDurationMs, weaknessScore };
  });
  weakQuestions.sort((left, right) => {
    if (sort === "wrong") return right.wrong - left.wrong || right.weaknessScore - left.weaknessScore;
    if (sort === "accuracy") return left.accuracy - right.accuracy || right.weaknessScore - left.weaknessScore;
    if (sort === "recent") return (right.lastAnsweredAt ?? "").localeCompare(left.lastAnsweredAt ?? "");
    return right.weaknessScore - left.weaknessScore;
  });

  const recentAttempts = [...scopedAttempts]
    .sort((left, right) => right.answered_at.localeCompare(left.answered_at))
    .slice(0, 50)
    .map((attempt) => ({
      attemptId: attempt.attempt_id,
      questionId: attempt.question_id,
      answeredAt: attempt.answered_at,
      objectiveCorrect: attempt.objective_correct,
      masteryRating: attempt.mastery_rating,
      durationMs: attempt.duration_ms,
    }));

  return {
    range,
    timezone: "Asia/Shanghai",
    generatedAt: new Date(now).toISOString(),
    overview,
    trend,
    distributions,
    weakQuestions: weakQuestions.slice(0, 50),
    recentAttempts,
  };
}
