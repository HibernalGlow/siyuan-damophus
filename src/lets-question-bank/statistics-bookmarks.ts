import type { AttemptAggregate, QuestionBookmark } from "@/question-bank/core/types";

export interface StatisticsBookmarkEntry {
  questionId: string;
  title: string;
  /** Source block of the question in the bound document, when the current scan knows it. */
  blockId?: string;
  tags: string[];
  note: string;
  updatedAt: string;
  attempts: number;
  /** Objective accuracy in percent; undefined when the question has no objective attempts. */
  accuracy?: number;
  needsReview: boolean;
}

export interface StatisticsBookmarkBuilderInput {
  bookmarks: ReadonlyMap<string, QuestionBookmark>;
  aggregates: ReadonlyMap<string, AttemptAggregate>;
  /** questionId → display title; entries without a title fall back to the question ID. */
  titles: ReadonlyMap<string, string>;
  blockIdsByQuestionId?: ReadonlyMap<string, string>;
  reviewThreshold: number;
}

export function buildStatisticsBookmarkEntries(input: StatisticsBookmarkBuilderInput): StatisticsBookmarkEntry[] {
  const entries: StatisticsBookmarkEntry[] = [];
  for (const bookmark of input.bookmarks.values()) {
    if (bookmark.isArchived) continue;
    const aggregate = input.aggregates.get(bookmark.questionId);
    const objectiveAttempts = aggregate?.objectiveAttempts ?? 0;
    entries.push({
      questionId: bookmark.questionId,
      title: input.titles.get(bookmark.questionId) ?? bookmark.questionId,
      blockId: input.blockIdsByQuestionId?.get(bookmark.questionId),
      tags: [...bookmark.tags],
      note: bookmark.note,
      updatedAt: bookmark.updatedAt,
      attempts: aggregate?.attempts ?? 0,
      accuracy: objectiveAttempts > 0
        ? Math.round(((aggregate?.objectiveCorrect ?? 0) / objectiveAttempts) * 1000) / 10
        : undefined,
      needsReview: (aggregate?.consecutiveReviewCount ?? 0) >= input.reviewThreshold,
    });
  }
  return entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function countBookmarkTags(entries: readonly StatisticsBookmarkEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
