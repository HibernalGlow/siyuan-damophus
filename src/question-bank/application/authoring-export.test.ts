import { describe, expect, it } from "vitest";
import { createQuestionAuthoringPackage, serializeQuestionAuthoringPackage } from "./authoring-export";
import type { AttemptAggregate, Question, QuestionBookmark, TopicNode } from "../core/types";
import type { QuestionCatalogEntry } from "../assembly/types";

const question: Question = {
  id: "civil-q1",
  type: "single",
  title: "抵押权",
  stemMarkdown: "甲与乙签订合同。",
  options: [{ id: "A", markdown: "A. 正确" }],
  answer: { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "解析",
  metadata: { topicPath: ["担保物权"], topicId: "civil-security" },
};

const catalog: QuestionCatalogEntry = {
  questionId: question.id,
  blockId: "20260830000000-aaaaaaa",
  documentId: "20260830000001-bbbbbbb",
  notebookId: "20260830000002-ccccccc",
  questionTitle: question.title,
  questionType: question.type,
  subject: "民法",
  topicId: "civil-security",
};

const topic: TopicNode = {
  id: "civil-security",
  title: "担保物权",
  level: 1,
  childIds: [],
  explicit: true,
};

const aggregate: AttemptAggregate = {
  questionId: question.id,
  attempts: 2,
  objectiveAttempts: 2,
  objectiveCorrect: 1,
  objectiveIncorrect: 1,
  consecutiveReviewCount: 1,
  consecutiveAgainCount: 1,
  consecutiveHardCount: 0,
  latestRating: "again",
};

const bookmark: QuestionBookmark = {
  questionId: question.id,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  tags: ["易混淆"],
  note: "注意例外",
};

describe("question authoring export", () => {
  it("creates a stable, content-complete package without leaking runtime state into questions", () => {
    const result = createQuestionAuthoringPackage({
      pluginVersion: "1.0.0",
      exportedAt: "2026-08-30T00:00:00.000Z",
      catalog: [catalog],
      questions: [question],
      topics: [topic, topic],
      attempts: [],
      aggregates: new Map([[question.id, aggregate]]),
      bookmarks: new Map([[question.id, bookmark]]),
      sourceDocuments: [],
    });

    expect(result.schema_version).toBe(1);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]).toEqual({ question, catalog });
    expect(result.topics).toEqual([topic]);
    expect(result.aggregates).toEqual([aggregate]);
    expect(result.bookmarks).toEqual([bookmark]);
    expect(result.questions[0].question).not.toHaveProperty("attempts");
    expect(result.groups).toEqual([]);
  });

  it("serializes as newline-terminated JSON", () => {
    const source = serializeQuestionAuthoringPackage({
      pluginVersion: "1.0.0",
      catalog: [],
      questions: [],
      topics: [],
      attempts: [],
      aggregates: new Map(),
      bookmarks: new Map(),
      sourceDocuments: [],
    });
    expect(source.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(source)).not.toThrow();
  });
});
