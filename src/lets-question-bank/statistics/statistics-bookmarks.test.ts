import { describe, expect, it } from "vitest";
import type { AttemptAggregate, QuestionBookmark } from "@/question-bank/core/types";
import { buildStatisticsBookmarkEntries, countBookmarkTags } from "./statistics-bookmarks";

function bookmark(questionId: string, overrides: Partial<QuestionBookmark> = {}): QuestionBookmark {
  return {
    questionId,
    createdAt: "2026-08-31T10:00:00Z",
    updatedAt: "2026-08-31T10:00:00Z",
    tags: [],
    note: "",
    ...overrides,
  };
}

function aggregate(questionId: string, overrides: Partial<AttemptAggregate> = {}): AttemptAggregate {
  return {
    questionId,
    attempts: 0,
    objectiveAttempts: 0,
    objectiveCorrect: 0,
    objectiveIncorrect: 0,
    consecutiveReviewCount: 0,
    consecutiveAgainCount: 0,
    consecutiveHardCount: 0,
    ...overrides,
  };
}

describe("buildStatisticsBookmarkEntries", () => {
  it("skips archived bookmarks and falls back to the question ID as title", () => {
    const entries = buildStatisticsBookmarkEntries({
      bookmarks: new Map([
        ["q-live", bookmark("q-live")],
        ["q-archived", bookmark("q-archived", { isArchived: true })],
      ]),
      aggregates: new Map(),
      titles: new Map(),
      reviewThreshold: 2,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].questionId).toBe("q-live");
    expect(entries[0].title).toBe("q-live");
  });

  it("derives accuracy, review state, and block ids", () => {
    const entries = buildStatisticsBookmarkEntries({
      bookmarks: new Map([
        ["q-1", bookmark("q-1", { tags: ["classic", "hard"], note: "注意陷阱" })],
        ["q-2", bookmark("q-2")],
      ]),
      aggregates: new Map([
        ["q-1", aggregate("q-1", { attempts: 3, objectiveAttempts: 3, objectiveCorrect: 2, consecutiveReviewCount: 2 })],
      ]),
      titles: new Map([["q-1", "甲题目"]]),
      blockIdsByQuestionId: new Map([["q-1", "20260820120002-aaa0001"]]),
      reviewThreshold: 2,
    });

    const first = entries.find((entry) => entry.questionId === "q-1")!;
    expect(first.title).toBe("甲题目");
    expect(first.blockId).toBe("20260820120002-aaa0001");
    expect(first.tags).toEqual(["classic", "hard"]);
    expect(first.note).toBe("注意陷阱");
    expect(first.attempts).toBe(3);
    expect(first.accuracy).toBe(66.7);
    expect(first.needsReview).toBe(true);

    const second = entries.find((entry) => entry.questionId === "q-2")!;
    expect(second.accuracy).toBeUndefined();
    expect(second.needsReview).toBe(false);
    expect(second.blockId).toBeUndefined();
  });

  it("sorts entries by updatedAt descending", () => {
    const entries = buildStatisticsBookmarkEntries({
      bookmarks: new Map([
        ["q-old", bookmark("q-old", { updatedAt: "2026-08-01T00:00:00Z" })],
        ["q-new", bookmark("q-new", { updatedAt: "2026-08-31T00:00:00Z" })],
        ["q-mid", bookmark("q-mid", { updatedAt: "2026-08-15T00:00:00Z" })],
      ]),
      aggregates: new Map(),
      titles: new Map(),
      reviewThreshold: 2,
    });
    expect(entries.map((entry) => entry.questionId)).toEqual(["q-new", "q-mid", "q-old"]);
  });
});

describe("countBookmarkTags", () => {
  it("counts tags across entries", () => {
    const entries = buildStatisticsBookmarkEntries({
      bookmarks: new Map([
        ["q-1", bookmark("q-1", { tags: ["classic", "hard"] })],
        ["q-2", bookmark("q-2", { tags: ["classic"] })],
        ["q-3", bookmark("q-3", { tags: [] })],
      ]),
      aggregates: new Map(),
      titles: new Map(),
      reviewThreshold: 2,
    });
    const counts = countBookmarkTags(entries);
    expect(counts.get("classic")).toBe(2);
    expect(counts.get("hard")).toBe(1);
    expect(counts.get("cramming")).toBeUndefined();
  });
});
