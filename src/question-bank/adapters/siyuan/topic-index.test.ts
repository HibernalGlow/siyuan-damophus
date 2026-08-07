import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "../../core/attempts";
import { confirmQuestionIndexSync, previewQuestionIndexSync } from "../../application/indexing";
import { appendAttemptEvent } from "./attempt-store";
import { relationCells } from "./cells";
import {
  confirmTopicRelationSync,
  previewTopicRelationSync,
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
    expect(client.requests.slice(before).some((request) => request.endpoint.includes("insertBlock"))).toBe(false);
  });
});
