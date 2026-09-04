import { describe, expect, it } from "vitest";
import { gradeQuestion } from "./answer";
import { aggregateAttemptEvents, createAttemptEvent } from "./attempts";
import { QuestionSchema } from "./schema";
import { filterQuestions, normalizePracticeFilter } from "./scope";
import { restoreQuestionOptions, shuffleQuestionOptions } from "./shuffle";
import type { Question, TopicNode } from "./types";

function question(id: string, topicId = "child"): Question {
  return {
    id,
    type: "multiple",
    title: id,
    stemMarkdown: "stem",
    options: [
      { id: "A", markdown: "alpha" },
      { id: "B", markdown: "beta" },
      { id: "C", markdown: "gamma" },
    ],
    answer: { kind: "options", optionIds: ["A", "C"] },
    solutionMarkdown: "solution",
    metadata: { topicId, topicPath: ["Root", "Child"] },
  };
}

describe("portable question core", () => {
  it("grades with original IDs regardless of order and rejects partial answers", () => {
    const value = question("q1");
    expect(gradeQuestion(value, ["c", "A"])).toBe(true);
    expect(gradeQuestion(value, ["A"])).toBe(false);
    expect(gradeQuestion(value, ["A", "B", "C"])).toBe(false);
  });

  it("shuffles temporary labels and restores source order", () => {
    const value = question("q1");
    const randomValues = [0, 0];
    const shuffled = shuffleQuestionOptions(value, () => randomValues.shift() ?? 0);

    expect(shuffled.optionOrder).toEqual(["B", "C", "A"]);
    expect(shuffled.options.map((option) => option.displayLabel)).toEqual(["A", "B", "C"]);
    expect(restoreQuestionOptions(value, shuffled).map((option) => option.originalId)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("provides answer controls for true-false questions without source options", () => {
    const value: Question = {
      id: "tf1",
      type: "true-false",
      title: "Judgment",
      stemMarkdown: "Statement",
      options: [],
      answer: { kind: "boolean", value: false },
      solutionMarkdown: "False",
      metadata: { topicPath: [] },
    };

    const shuffled = shuffleQuestionOptions(value, () => 0.99);

    expect(shuffled.optionOrder).toEqual(["true", "false"]);
    expect(restoreQuestionOptions(value, shuffled).map((option) => option.originalId)).toEqual([
      "true",
      "false",
    ]);
    expect(gradeQuestion(value, ["false"])).toBe(true);
  });

  it("filters recursive topic scopes and derived review states", () => {
    const topics: TopicNode[] = [
      { id: "root", title: "Root", level: 2, childIds: ["child"], explicit: true },
      { id: "child", title: "Child", level: 3, parentId: "root", childIds: [], explicit: true },
      { id: "other", title: "Other", level: 2, childIds: [], explicit: true },
    ];
    const questions = [question("q1"), question("q2", "other")];
    questions[0].metadata = {
      topicPath: ["Root", "Child"],
      scopeTopicId: "child",
    };
    const aggregates = new Map([
      ["q1", {
        questionId: "q1",
        attempts: 2,
        objectiveAttempts: 2,
        objectiveCorrect: 0,
        objectiveIncorrect: 2,
        consecutiveReviewCount: 2,
        consecutiveAgainCount: 2,
        consecutiveHardCount: 0,
      }],
    ]);

    expect(filterQuestions({ questions, topics, rootTopicId: "root" }).map((item) => item.id)).toEqual(["q1"]);
    expect(filterQuestions({ questions, topics, filter: "unattempted", aggregates }).map((item) => item.id)).toEqual(["q2"]);
    expect(filterQuestions({ questions, topics, filter: "wrong", aggregates }).map((item) => item.id)).toEqual(["q1"]);
    expect(filterQuestions({ questions, topics, filter: "review", aggregates }).map((item) => item.id)).toEqual(["q1"]);
    expect(filterQuestions({ questions, topics, filter: "due", dueQuestionIds: new Set(["q2"]) }).map((item) => item.id)).toEqual(["q2"]);
    expect(filterQuestions({ questions, topics, filter: "bookmarked", bookmarkedQuestionIds: new Set(["q1"]) }).map((item) => item.id)).toEqual(["q1"]);
    expect(filterQuestions({
      questions,
      topics,
      filter: {
        glue: "and",
        rules: [
          { field: "bookmarked", type: "tuple", filter: "equal", value: "yes" },
          { field: "wrong", type: "tuple", filter: "equal", value: "no" },
        ],
      },
      aggregates,
      bookmarkedQuestionIds: new Set(["q1", "q2"]),
    }).map((item) => item.id)).toEqual(["q2"]);
    expect(filterQuestions({
      questions,
      topics,
      filter: {
        glue: "and",
        rules: [
          { field: "wrong", type: "tuple", filter: "equal", value: "yes" },
          { field: "review", type: "tuple", filter: "equal", value: "no" },
        ],
      },
      aggregates,
      reviewThreshold: 3,
    }).map((item) => item.id)).toEqual(["q1"]);
  });

  it("ignores bypassed rules and groups while keeping them in the tree", () => {
    const questions = [question("q1"), question("q2")];
    const aggregates = new Map([
      ["q1", { questionId: "q1", attempts: 1, objectiveAttempts: 1, objectiveCorrect: 0, objectiveIncorrect: 1, consecutiveReviewCount: 0, consecutiveAgainCount: 0, consecutiveHardCount: 0 }],
    ]);
    const filter = {
      glue: "and" as const,
      rules: [
        { field: "wrong" as const, value: "yes" as const, bypassed: true },
        { field: "wrong" as const, value: "no" as const },
      ],
    };
    // The bypassed wrong=yes rule drops out: only wrong=no remains.
    expect(filterQuestions({ questions, topics: [], filter, aggregates }).map((item) => item.id)).toEqual(["q2"]);
    // A bypassed group is skipped wholesale, so every question matches.
    const groupBypassed = {
      glue: "and" as const,
      bypassed: true,
      rules: [{ field: "wrong" as const, value: "yes" as const }],
    };
    expect(filterQuestions({ questions, topics: [], filter: groupBypassed, aggregates }).map((item) => item.id)).toEqual(["q1", "q2"]);
    // Normalization keeps the flag so it survives save/re-open.
    expect(normalizePracticeFilter(filter)).toMatchObject({ rules: [{ bypassed: true }, {}] });
  });

  it("preserves optional condition-group names without changing matching", () => {
    const filter = normalizePracticeFilter({
      glue: "and",
      name: "Saved favorites",
      rules: [{ field: "bookmarked", value: "yes" }],
    });
    expect(filter).toEqual({
      glue: "and",
      name: "Saved favorites",
      rules: [{ field: "bookmarked", type: "tuple", filter: "equal", value: "yes" }],
    });
  });

  it("evaluates mixed AND/OR connectors with normal precedence and group negation", () => {
    const questions = [question("q1"), question("q2"), question("q3")];
    const aggregates = new Map([
      ["q1", { questionId: "q1", attempts: 1, objectiveAttempts: 1, objectiveCorrect: 0, objectiveIncorrect: 1, consecutiveReviewCount: 0, consecutiveAgainCount: 0, consecutiveHardCount: 0 }],
      ["q2", { questionId: "q2", attempts: 1, objectiveAttempts: 1, objectiveCorrect: 1, objectiveIncorrect: 0, consecutiveReviewCount: 2, consecutiveAgainCount: 0, consecutiveHardCount: 0 }],
      ["q3", { questionId: "q3", attempts: 0, objectiveAttempts: 0, objectiveCorrect: 0, objectiveIncorrect: 0, consecutiveReviewCount: 0, consecutiveAgainCount: 0, consecutiveHardCount: 0 }],
    ]);
    const filter = {
      glue: "and" as const,
      combinators: ["and" as const, "or" as const],
      rules: [
        { field: "wrong" as const, value: "yes" as const },
        { field: "review" as const, value: "yes" as const },
        { field: "attempted" as const, value: "no" as const },
      ],
    };
    expect(filterQuestions({ questions, topics: [], filter, aggregates }).map((item) => item.id)).toEqual(["q3"]);
    expect(filterQuestions({ questions, topics: [], filter: { ...filter, not: true }, aggregates }).map((item) => item.id)).toEqual(["q1", "q2"]);
  });

  it("creates immutable event values and rebuilds attempt aggregates", () => {
    const first = createAttemptEvent({
      attemptId: "a1",
      questionId: "q1",
      sessionId: "s1",
      answeredAt: "2026-08-04T10:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["B", "C", "A"],
      selectedOptionIds: ["A"],
      objectiveCorrect: false,
      masteryRating: "again",
      durationMs: 40_000,
    });
    const second = createAttemptEvent({
      attemptId: "a2",
      questionId: "q1",
      sessionId: "s1",
      answeredAt: "2026-08-04T10:01:00.000Z",

      questionType: "multiple",
      optionOrder: ["A", "B", "C"],
      selectedOptionIds: ["A", "C"],
      objectiveCorrect: true,
      masteryRating: "hard",
      durationMs: 25_000,
    });
    const aggregate = aggregateAttemptEvents([second, first]).get("q1");

    expect(aggregate).toMatchObject({
      attempts: 2,
      timedAttempts: 2,
      totalDurationMs: 65_000,
      objectiveCorrect: 1,
      objectiveIncorrect: 1,
      consecutiveReviewCount: 2,
      consecutiveAgainCount: 0,
      consecutiveHardCount: 1,
      latestRating: "hard",
      lastAnsweredAt: "2026-08-04T10:01:00.000Z",
      lastAttemptId: "a2",
      lastDurationMs: 25_000,
      previousDurationMs: 40_000,
    });
  });

  it("rejects machine answers that violate question type constraints", () => {
    const invalid = question("q1");
    invalid.answer = { kind: "options", optionIds: ["A"] };
    expect(QuestionSchema.safeParse(invalid).success).toBe(false);
  });

  it("accepts an indefinite-choice question with one or more answers", () => {
    const oneAnswer = question("indefinite-one");
    oneAnswer.type = "indefinite";
    oneAnswer.answer = { kind: "options", optionIds: ["A"] };
    const severalAnswers = question("indefinite-several");
    severalAnswers.type = "indefinite";

    expect(QuestionSchema.safeParse(oneAnswer).success).toBe(true);
    expect(QuestionSchema.safeParse(severalAnswers).success).toBe(true);
  });

  it("restricts subjective scores to subjective attempts and the 0-100 range", () => {
    const base = {
      attemptId: "score-1",
      questionId: "q1",
      sessionId: "s1",
      answeredAt: "2026-08-04T10:00:00.000Z",
      questionType: "subjective" as const,
      objectiveCorrect: null,
      masteryRating: "good" as const,
    };

    expect(() => createAttemptEvent({ ...base, subjectiveScore: -1 })).toThrow();
    expect(() => createAttemptEvent({ ...base, subjectiveScore: 101 })).toThrow();
    expect(() => createAttemptEvent({
      ...base,
      questionType: "single",
      objectiveCorrect: true,
      subjectiveScore: 80,
    })).toThrow();
    expect(createAttemptEvent({ ...base, subjectiveScore: 80 }).subjective_score).toBe(80);
  });
});
