import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "../../core/attempts";
import { confirmQuestionIndexSync, previewQuestionIndexSync } from "../../application/indexing";
import { appendAttemptEvent, readAttemptEvents } from "./attempt-store";
import { relationCells } from "./cells";
import {
  confirmTopicRelationSync,
  migrateTopicRelationsFromIal,
  previewTopicRelationSync,
  persistQuestionTopicResource,
  readTopicIndex,
  rebuildTopicStatistics,
  resolveQuestionTopicResources,
} from "./topic-index";
import { fixture, initialized, questionAvRowId } from "./siyuan-adapter.fixtures";
import type { QuestionBankBinding } from "./binding";
import type { MockKernelClient } from "./siyuan-adapter.fixtures";

async function addTopic(
  client: MockKernelClient,
  binding: QuestionBankBinding,
  itemId: string,
  input: {
    topicId: string;
    name: string;
    status?: "active" | "archived";
    resources?: Array<{ content: string; name: string; type: "file" | "image" }>;
  },
): Promise<void> {
  await client.request("/api/av/addAttributeViewBlocks", {
    avID: binding.topicIndex.avId,
    blockID: binding.topicIndex.blockId,
    viewID: "",
    groupID: "",
    previousID: "",
    srcs: [{ itemID: itemId, isDetached: true, content: input.name }],
    ignoreDefaultFill: true,
  });
  const values = {
    topic_id: { type: "text", text: { content: input.topicId } },
    name: { type: "text", text: { content: input.name } },
    status: { type: "select", text: null, mSelect: [{ content: input.status ?? "active", color: "6" }] },
    resource: { type: "mAsset", text: null, mAsset: input.resources ?? [] },
  } as const;
  for (const [field, value] of Object.entries(values)) {
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.topicIndex.avId,
      keyID: binding.topicIndex.keys[field as keyof typeof values],
      itemID: itemId,
      value,
    });
  }
}

async function syncFixtureQuestion(client: MockKernelClient, binding: QuestionBankBinding): Promise<void> {
  const documentId = "20260804120000-sourced";
  client.documents.set(documentId, fixture("siyuan-kramdown"));
  client.blockRoots.set("20260804000200-quest01", documentId);
  const preview = await previewQuestionIndexSync(client, binding, documentId);
  await confirmQuestionIndexSync(client, binding, documentId, preview.token);
}

describe("Topic Index adapter", () => {
  it("reads detached Topic Index rows using the native row identity", async () => {
    const { client, binding } = await initialized();
    const detachedItemId = "20260807181345-aaccrou";
    await addTopic(client, binding, detachedItemId, {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    const topicAv = client.attributeViews.get(binding.topicIndex.avId)!;
    const primary = topicAv.keyValues.find(
      (entry) => entry.key.id === binding.topicIndex.keys.entry,
    )!.values.find((value) => value.blockID === detachedItemId)!;
    const nativeRowId = "20260807181345-0seul9r";
    primary.id = nativeRowId;
    for (const keyValues of topicAv.keyValues) {
      if (keyValues.key.id === binding.topicIndex.keys.entry) continue;
      for (const value of keyValues.values) {
        if (value.blockID === detachedItemId) value.blockID = nativeRowId;
      }
    }

    const result = await readTopicIndex(client, binding);

    expect(result.issues).toEqual([]);
    expect(result.topics).toEqual([
      expect.objectContaining({
        itemId: nativeRowId,
        topicId: "civil-security-flow-clause",
        name: "Flow clause",
      }),
    ]);
  });

  it("seeds Topic relations from portable IDs when a question is first indexed", async () => {
    const { client, binding } = await initialized();
    await addTopic(client, binding, "20260807120000-topic15", {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    await addTopic(client, binding, "20260807120000-topic16", {
      topicId: "civil-guarantee-contract",
      name: "Guarantee contract",
    });
    const documentId = "20260804120000-topseed";
    client.documents.set(documentId, fixture("siyuan-kramdown").replace(
      'custom-qb-type="multiple"',
      'custom-qb-type="multiple" custom-qb-question-topic-ids="civil-security-flow-clause,civil-guarantee-contract"',
    ));
    client.blockRoots.set("20260804000200-quest01", documentId);

    const preview = await previewQuestionIndexSync(client, binding, documentId);
    await confirmQuestionIndexSync(client, binding, documentId, preview.token);

    const topics = await readTopicIndex(client, binding);
    expect(topics.issues).toEqual([]);
    expect(topics.topics.map((topic) => ({
      topicId: topic.topicId,
      questionIds: topic.questionIds,
      snapshot: topic.questionIdSnapshot,
    }))).toEqual([
      {
        topicId: "civil-security-flow-clause",
        questionIds: ["civil-kramdown-108"],
        snapshot: ["civil-kramdown-108"],
      },
      {
        topicId: "civil-guarantee-contract",
        questionIds: ["civil-kramdown-108"],
        snapshot: ["civil-kramdown-108"],
      },
    ]);
  });

  it("backfills only empty historical Topic relations once", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    await addTopic(client, binding, "20260807120000-topic17", {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    client.blockAttrs.set("20260804000200-quest01", {
      "custom-qb-question-topic-ids": "civil-security-flow-clause",
    });

    const first = await migrateTopicRelationsFromIal(client, binding);
    expect(first).toMatchObject({
      alreadyCompleted: false,
      scannedQuestions: 1,
      candidateQuestions: 1,
      linkedQuestions: 1,
      issues: [],
    });
    expect(client.blockAttrs.get(binding.systemDocumentId)?.[
      "custom-damophus-topic-relation-ial-migration-v1"
    ]).toBe("completed");

    const second = await migrateTopicRelationsFromIal(client, binding);
    expect(second.alreadyCompleted).toBe(true);
  });

  it("previews merge and diff relation changes before writing", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    await addTopic(client, binding, "20260807120000-topic01", {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    await addTopic(client, binding, "20260807120000-topic02", {
      topicId: "civil-guarantee-contract",
      name: "Guarantee contract",
    });

    const first = await previewTopicRelationSync(client, binding, [{
      questionId: "civil-kramdown-108",
      topicIds: ["civil-security-flow-clause"],
    }], "merge");
    expect(first.actions[0]).toMatchObject({
      currentTopicIds: [],
      addedTopicIds: ["civil-security-flow-clause"],
      removedTopicIds: [],
    });
    expect((await confirmTopicRelationSync(client, binding, first.assignments, "merge", first.token)).results)
      .toEqual([{ questionId: "civil-kramdown-108", status: "synced" }]);

    const merged = await previewTopicRelationSync(client, binding, [{
      questionId: "civil-kramdown-108",
      topicIds: ["civil-guarantee-contract"],
    }], "merge");
    expect(merged.actions[0].finalTopicIds).toEqual([
      "civil-security-flow-clause",
      "civil-guarantee-contract",
    ]);
    await confirmTopicRelationSync(client, binding, merged.assignments, "merge", merged.token);

    const diff = await previewTopicRelationSync(client, binding, [{
      questionId: "civil-kramdown-108",
      topicIds: ["civil-guarantee-contract"],
    }], "diff");
    expect(diff.actions[0]).toMatchObject({
      addedTopicIds: [],
      removedTopicIds: ["civil-security-flow-clause"],
      finalTopicIds: ["civil-guarantee-contract"],
    });
    await confirmTopicRelationSync(client, binding, diff.assignments, "diff", diff.token);

    const topics = await readTopicIndex(client, binding);
    expect(topics.topics.find((topic) => topic.topicId === "civil-guarantee-contract")?.questionIds)
      .toEqual(["civil-kramdown-108"]);
    expect(topics.topics.find((topic) => topic.topicId === "civil-security-flow-clause")?.questionIds)
      .toEqual([]);
  });

  it("reports unknown portable topic IDs without inventing rows", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    const preview = await previewTopicRelationSync(client, binding, [{
      questionId: "civil-kramdown-108",
      topicIds: ["missing-topic"],
    }], "merge");

    expect(preview.issues).toEqual([expect.objectContaining({ code: "unknown-topic-relation-topic" })]);
    await expect(confirmTopicRelationSync(client, binding, preview.assignments, "merge", preview.token))
      .rejects.toThrow("Topic relation sync is blocked");
    expect((await readTopicIndex(client, binding)).topics).toEqual([]);
  });

  it("does not block question indexing because of an unrelated invalid Topic Index row", async () => {
    const { client, binding } = await initialized();
    await addTopic(client, binding, "20260807120000-topic14", {
      topicId: "Invalid Topic",
      name: "Invalid",
    });
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    client.blockRoots.set("20260804000200-quest01", documentId);

    const preview = await previewQuestionIndexSync(client, binding, documentId);
    await expect(confirmQuestionIndexSync(client, binding, documentId, preview.token)).resolves.toMatchObject({
      results: [{ questionId: "civil-kramdown-108", status: "synced" }],
    });
  });

  it("rejects invalid and duplicate Topic Index identities", async () => {
    const { client, binding } = await initialized();
    await addTopic(client, binding, "20260807120000-topic06", {
      topicId: "Invalid Topic",
      name: "Invalid",
    });
    await addTopic(client, binding, "20260807120000-topic07", {
      topicId: "valid-topic",
      name: "Valid one",
    });
    await addTopic(client, binding, "20260807120000-topic08", {
      topicId: "valid-topic",
      name: "Valid two",
    });

    const result = await readTopicIndex(client, binding);

    expect(result.topics.map((topic) => topic.topicId)).toEqual(["valid-topic"]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "invalid-topic-index-id",
      "duplicate-topic-index-id",
    ]);
  });

  it("keeps failed relation writes retryable instead of reporting a complete migration", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    await addTopic(client, binding, "20260807120000-topic09", {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    const preview = await previewTopicRelationSync(client, binding, [{
      questionId: "civil-kramdown-108",
      topicIds: ["civil-security-flow-clause"],
    }], "merge");
    client.failNextCellWrite = true;

    const result = await confirmTopicRelationSync(
      client,
      binding,
      preview.assignments,
      "merge",
      preview.token,
    );

    expect(result.results).toEqual([
      expect.objectContaining({ questionId: "civil-kramdown-108", status: "failed" }),
    ]);
    expect(result.actions).toEqual(preview.actions);
  });

  it("rebuilds topic statistics from current relations and immutable attempts", async () => {
    const { client, binding, nextId } = await initialized();
    await syncFixtureQuestion(client, binding);
    const topicItemId = "20260807120000-topic03";
    await addTopic(client, binding, topicItemId, {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    const questionItemId = questionAvRowId(client, binding, "20260804000200-quest01");
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: questionItemId,
      value: relationCells([topicItemId]),
    });
    await appendAttemptEvent(client, binding, createAttemptEvent({
      attemptId: "attempt-topic-stat-1",
      questionId: "civil-kramdown-108",
      questionRelation: "20260804000200-quest01",
      sessionId: "session-topic-stat",
      answeredAt: "2026-08-07T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["A", "B", "C", "D"],
      selectedOptionIds: ["A"],
      objectiveCorrect: false,
      masteryRating: "again",
    }), nextId);

    const rebuilt = await rebuildTopicStatistics(client, binding);
    expect(rebuilt.statistics).toEqual([{
      topicId: "civil-security-flow-clause",
      questionCount: 1,
      attemptCount: 1,
      wrongCount: 1,
      wrongRate: 1,
    }]);
    expect(rebuilt.results).toEqual([{
      topicId: "civil-security-flow-clause",
      status: "synced",
    }]);
  });

  it("rebinds a recreated question block while preserving topics and attempt relations", async () => {
    const { client, binding, nextId } = await initialized();
    const documentId = "20260804120000-sourced";
    const oldBlockId = "20260804000200-quest01";
    const newBlockId = "20260807190000-newques";
    await syncFixtureQuestion(client, binding);
    const topicItemId = "20260807120000-topic11";
    await addTopic(client, binding, topicItemId, {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    const originalRowId = questionAvRowId(client, binding, oldBlockId);
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: originalRowId,
      value: relationCells([topicItemId]),
    });
    await appendAttemptEvent(client, binding, createAttemptEvent({
      attemptId: "attempt-rebound-1",
      questionId: "civil-kramdown-108",
      questionRelation: oldBlockId,
      sessionId: "session-rebound",
      answeredAt: "2026-08-07T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["A", "B", "C", "D"],
      selectedOptionIds: ["A"],
      objectiveCorrect: false,
      masteryRating: "again",
    }), nextId);

    client.blockRoots.delete(oldBlockId);
    client.blockRoots.set(newBlockId, documentId);
    client.documents.set(documentId, fixture("siyuan-kramdown").replace(oldBlockId, newBlockId));

    const preview = await previewQuestionIndexSync(client, binding, documentId);
    expect(preview.blockers).toEqual([]);
    expect(preview.actions).toEqual([
      expect.objectContaining({
        kind: "rebind",
        question: expect.objectContaining({ id: "civil-kramdown-108" }),
        blockId: newBlockId,
        itemId: originalRowId,
        previousBlockId: oldBlockId,
      }),
    ]);

    const result = await confirmQuestionIndexSync(client, binding, documentId, preview.token);
    expect(result.results).toEqual([{ questionId: "civil-kramdown-108", status: "synced" }]);
    expect(questionAvRowId(client, binding, newBlockId)).toBe(originalRowId);
    expect(() => questionAvRowId(client, binding, oldBlockId)).toThrow("Question row not found");
    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    expect(questionAv.keyValues.find(
      (entry) => entry.key.id === binding.questionIndex.keys.topics_relation,
    )?.values.find((entry) => entry.blockID === originalRowId)?.relation?.blockIDs).toEqual([topicItemId]);
    const attempts = await readAttemptEvents(client, binding);
    expect(attempts.events).toEqual([
      expect.objectContaining({
        attempt_id: "attempt-rebound-1",
        question_id: "civil-kramdown-108",
        question_relation: newBlockId,
      }),
    ]);
    expect((await rebuildTopicStatistics(client, binding)).statistics).toEqual([
      expect.objectContaining({
        topicId: "civil-security-flow-clause",
        questionCount: 1,
        attemptCount: 1,
        wrongCount: 1,
      }),
    ]);
    expect(client.requests.some((request) => request.endpoint === "/api/transactions"
      && request.payload.transactions?.[0]?.doOperations?.some((operation: any) =>
        operation.action === "replaceAttrViewBlock"
        && operation.previousID === originalRowId
        && operation.nextID === newBlockId,
      ))).toBe(true);
  });

  it("restores topic relations from stable question ID snapshots after SiYuan removes the bound row", async () => {
    const { client, binding, nextId } = await initialized();
    const documentId = "20260804120000-sourced";
    const oldBlockId = "20260804000200-quest01";
    const newBlockId = "20260807190000-topicrb";
    await syncFixtureQuestion(client, binding);
    const topicItemId = "20260807120000-topic12";
    await addTopic(client, binding, topicItemId, {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    const oldRowId = questionAvRowId(client, binding, oldBlockId);
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: oldRowId,
      value: relationCells([topicItemId]),
    });
    await appendAttemptEvent(client, binding, createAttemptEvent({
      attemptId: "attempt-topic-rebound-1",
      questionId: "civil-kramdown-108",
      questionRelation: oldBlockId,
      sessionId: "session-topic-rebound",
      answeredAt: "2026-08-07T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["A", "B", "C", "D"],
      selectedOptionIds: ["A"],
      objectiveCorrect: false,
      masteryRating: "again",
    }), nextId);
    await rebuildTopicStatistics(client, binding);
    const topicAv = client.attributeViews.get(binding.topicIndex.avId)!;
    expect(topicAv.keyValues.find(
      (entry) => entry.key.id === binding.topicIndex.keys.question_ids_snapshot,
    )?.values.find((entry) => entry.blockID === topicItemId)?.text?.content)
      .toBe('["civil-kramdown-108"]');

    await client.request("/api/av/removeAttributeViewBlocks", {
      avID: binding.questionIndex.avId,
      srcIDs: [oldRowId],
    });
    const inverse = topicAv.keyValues.find(
      (entry) => entry.key.id === binding.topicIndex.keys.questions_relation,
    )?.values.find((entry) => entry.blockID === topicItemId);
    if (inverse?.relation) inverse.relation.blockIDs = [];
    client.blockRoots.delete(oldBlockId);
    client.blockRoots.set(newBlockId, documentId);
    client.documents.set(documentId, fixture("siyuan-kramdown").replace(oldBlockId, newBlockId));

    const preview = await previewQuestionIndexSync(client, binding, documentId);
    expect(preview.actions.map((action) => action.kind)).toEqual(["add"]);
    await confirmQuestionIndexSync(client, binding, documentId, preview.token);

    const newRowId = questionAvRowId(client, binding, newBlockId);
    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    expect(questionAv.keyValues.find(
      (entry) => entry.key.id === binding.questionIndex.keys.topics_relation,
    )?.values.find((entry) => entry.blockID === newRowId)?.relation?.blockIDs).toEqual([topicItemId]);
    const topic = (await readTopicIndex(client, binding)).topics[0];
    expect(topic.questionIds).toEqual(["civil-kramdown-108"]);
    expect(topic.questionIdSnapshot).toEqual(["civil-kramdown-108"]);
    expect((await rebuildTopicStatistics(client, binding)).statistics[0]).toMatchObject({
      questionCount: 1,
      attemptCount: 1,
      wrongCount: 1,
    });
  });

  it("drops a snapshot only when the question still exists and its topic relation was removed", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    const topicItemId = "20260807120000-topic13";
    await addTopic(client, binding, topicItemId, {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
    });
    const questionItemId = questionAvRowId(client, binding, "20260804000200-quest01");
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: questionItemId,
      value: relationCells([topicItemId]),
    });
    await rebuildTopicStatistics(client, binding);
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: questionItemId,
      value: relationCells([]),
    });

    await rebuildTopicStatistics(client, binding);

    expect((await readTopicIndex(client, binding)).topics[0].questionIdSnapshot).toEqual([]);
  });

  it("resolves deduplicated resources in relation order without inserting blocks", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    const shared = { content: "assets/security-flow.gif", name: "Security flow", type: "image" as const };
    await addTopic(client, binding, "20260807120000-topic04", {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
      resources: [shared],
    });
    await addTopic(client, binding, "20260807120000-topic05", {
      topicId: "civil-guarantee-contract",
      name: "Guarantee contract",
      status: "archived",
      resources: [shared, { content: "assets/guarantee.mp4", name: "Guarantee", type: "file" }],
    });
    const questionItemId = questionAvRowId(client, binding, "20260804000200-quest01");
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: questionItemId,
      value: relationCells(["20260807120000-topic04", "20260807120000-topic05"]),
    });
    const before = client.requests.length;

    const result = await resolveQuestionTopicResources(client, binding, "civil-kramdown-108");

    expect(result.resources.map((projection) => [
      projection.topicId,
      projection.status,
      projection.resource.content,
    ])).toEqual([
      ["civil-security-flow-clause", "active", "assets/security-flow.gif"],
      ["civil-guarantee-contract", "archived", "assets/guarantee.mp4"],
    ]);
    expect(client.requests.slice(before).some((request) => /\/api\/block\/(?:insert|append|prepend)Block/u.test(request.endpoint))).toBe(false);
  });

  it("persists a current resource only after an explicit call and records its source identity", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    const topicItemId = "20260807120000-topic10";
    await addTopic(client, binding, topicItemId, {
      topicId: "civil-security-flow-clause",
      name: "Flow clause",
      resources: [{ content: "assets/security-flow.gif", name: "Security flow", type: "image" }],
    });
    const questionItemId = questionAvRowId(client, binding, "20260804000200-quest01");
    await client.request("/api/av/setAttributeViewBlockAttr", {
      avID: binding.questionIndex.avId,
      keyID: binding.questionIndex.keys.topics_relation,
      itemID: questionItemId,
      value: relationCells([topicItemId]),
    });
    const projection = (await resolveQuestionTopicResources(client, binding, "civil-kramdown-108")).resources[0];

    const result = await persistQuestionTopicResource(client, binding, {
      questionId: "civil-kramdown-108",
      questionBlockId: "20260804000200-quest01",
      projection,
    });

    expect(result.blockId).toMatch(/^20260807160000-/u);
    const write = [...client.requests].reverse().find((request) => request.endpoint === "/api/block/appendBlock");
    expect(write?.payload).toMatchObject({ parentID: "20260804000200-quest01", dataType: "markdown" });
    expect(write?.payload.data).toContain("![Security flow](assets/security-flow.gif)");
    expect(write?.payload.data).toContain('custom-qb-resource-source-block="20260804000200-quest01"');
    expect(write?.payload.data).toContain('custom-qb-resource-topic-id="civil-security-flow-clause"');
    expect(write?.payload.data).toContain(`custom-qb-resource-identity="${result.resourceIdentity}"`);
  });

  it("refuses to persist when the source question block has disappeared", async () => {
    const { client, binding } = await initialized();
    await syncFixtureQuestion(client, binding);
    const projection = {
      topicId: "civil-security-flow-clause",
      topicName: "Flow clause",
      status: "active" as const,
      resource: { content: "assets/security-flow.gif", name: "Security flow", type: "image" as const },
    };
    client.blockRoots.delete("20260804000200-quest01");
    const writesBefore = client.requests.filter((request) => request.endpoint === "/api/block/appendBlock").length;

    await expect(persistQuestionTopicResource(client, binding, {
      questionId: "civil-kramdown-108",
      questionBlockId: "20260804000200-quest01",
      projection,
    })).rejects.toThrow("no longer exists");
    expect(client.requests.filter((request) => request.endpoint === "/api/block/appendBlock")).toHaveLength(writesBefore);
  });
});
