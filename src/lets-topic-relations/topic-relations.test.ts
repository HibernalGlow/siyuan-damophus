import { describe, expect, it } from "vitest";
import {
  buildTopicRelationIndex,
  questionProgressFromAggregate,
  buildTopicRelationAttributeSql,
  buildTopicRelationSql,
  clampMobilePanelHeight,
  parsePriorityRules,
  parseTopicIds,
  type TopicRelationSqlRow,
} from "./topic-relations";

function row(overrides: Partial<TopicRelationSqlRow>): TopicRelationSqlRow {
  return {
    relation_kind: "note",
    topic_value: "civil-topic-a",
    block_id: "20260808000100-note001",
    root_id: "20260808000100-root001",
    type: "h",
    subtype: "h3",
    content: "Topic A",
    markdown: "### Topic A",
    hpath: "/Notes/Topic A",
    ...overrides,
  };
}

describe("topic relation model", () => {
  it("derives attempted, review, count, and accuracy fields", () => {
    expect(questionProgressFromAggregate(undefined)).toMatchObject({
      attempted: false,
      needsReview: false,
      attempts: 0,
      objectiveCorrect: 0,
      objectiveIncorrect: 0,
    });
    expect(questionProgressFromAggregate({
      attempts: 3,
      timedAttempts: 0,
      totalDurationMs: 0,
      objectiveAttempts: 2,
      objectiveCorrect: 1,
      objectiveIncorrect: 1,
      consecutiveReviewCount: 2,
      consecutiveAgainCount: 2,
      consecutiveHardCount: 0,
      latestRating: "again",
      lastAnsweredAt: "2026-08-19T00:00:00.000Z",
      previousDurationMs: undefined,
      lastDurationMs: undefined,
      lastAttemptId: "a1",
    }, 2)).toMatchObject({
      attempted: true,
      needsReview: true,
      attempts: 3,
      accuracy: 50,
      latestRating: "again",
    });
  });
  it("normalizes exact stable topic IDs without accepting arbitrary attribute text", () => {
    expect(parseTopicIds(" Civil-Topic-A, civil-topic-b, civil-topic-a, bad_value, ")).toEqual([
      "civil-topic-a",
      "civil-topic-b",
    ]);
  });

  it("builds a bounded exact-membership query for both relationship directions", () => {
    const sql = buildTopicRelationSql(["civil-topic-a", "civil-topic-b"]);

    expect(sql).toContain("custom-qb-note-topic-id");
    expect(sql).toContain("custom-qb-question-topic-ids");
    expect(sql).toContain("LOWER(a.value) IN ('civil-topic-a', 'civil-topic-b')");
    expect(sql).toContain("LIKE '%,civil-topic-a,%'");
    expect(sql).toContain("LIMIT 5000");
  });

  it("queries only valid SiYuan block IDs for zoomed editor roots", () => {
    const sql = buildTopicRelationAttributeSql([
      "20260808000100-note001",
      "20260808000100-note001",
      "invalid' OR 1=1",
    ]);

    expect(sql).toContain("block_id IN ('20260808000100-note001')");
    expect(sql).toContain("custom-qb-note-topic-id");
    expect(sql).toContain("custom-qb-question-topic-ids");
    expect(sql).not.toContain("OR 1=1");
  });

  it("keeps every provider, sorts configured sources first, and groups reverse questions", () => {
    const rows = [
      row({
        block_id: "20260808000100-recite1",
        content: "Recitation topic",
        hpath: "/Civil/Back/背诵卷",
      }),
      row({
        block_id: "20260808000100-detail1",
        content: "Detailed topic",
        hpath: "/Civil/Notes/精讲卷",
      }),
      row({
        relation_kind: "question",
        topic_value: "civil-topic-a,civil-topic-b",
        block_id: "20260808000100-question1",
        content: "176.",
        hpath: "/Civil/Questions",
      }),
      row({
        relation_kind: "question",
        topic_value: "civil-topic-aa",
        block_id: "20260808000100-question2",
      }),
    ];

    const index = buildTopicRelationIndex(
      ["civil-topic-a", "civil-topic-b"],
      rows,
      parsePriorityRules("精讲卷\n背诵卷"),
    );

    expect(index.get("civil-topic-a")?.notes.map((entry) => entry.blockId)).toEqual([
      "20260808000100-detail1",
      "20260808000100-recite1",
    ]);
    expect(index.get("civil-topic-a")?.label).toBe("Detailed topic");
    expect(index.get("civil-topic-a")?.questions.map((entry) => entry.blockId)).toEqual([
      "20260808000100-question1",
    ]);
    expect(index.get("civil-topic-b")?.questions.map((entry) => entry.blockId)).toEqual([
      "20260808000100-question1",
    ]);
  });

  it("clamps the mobile panel to a useful dynamic-viewport range", () => {
    expect(clampMobilePanelHeight(20)).toBe(45);
    expect(clampMobilePanelHeight("72")).toBe(72);
    expect(clampMobilePanelHeight(120)).toBe(96);
    expect(clampMobilePanelHeight("invalid")).toBe(72);
  });
});
