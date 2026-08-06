import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "../../core/attempts";
import {
  appendAttemptEvent,
  appendExamSummaryEvent,
  readAttemptEvents,
  readExamSummaryEvents,
  rebuildAttemptStatistics,
} from "./attempt-store";
import {
  confirmQuestionBankInitialization,
  confirmQuestionBankRebinding,
  previewQuestionBankInitialization,
  previewQuestionBankRebinding,
  verifyQuestionBankBinding,
} from "./binding";
import { scanSiyuanDocument } from "./document";
import { confirmQuestionIndexSync, previewQuestionIndexSync } from "../../application/indexing";
import {
  addCustomColumn,
  fixture,
  idGenerator,
  initialized,
  MockKernelClient,
  questionAvRowId,
} from "./siyuan-adapter.fixtures";
describe("SiYuan question bank adapter", () => {
  it("initializes two AVs and records managed columns by immutable key ID", async () => {
    const { client, binding } = await initialized();
    const verification = await verifyQuestionBankBinding(client, binding);

    expect(verification).toEqual({
      ok: true,
      errors: [],
      fatalErrors: [],
      missingManagedKeys: [],
    });
    expect(Object.keys(binding.questionIndex.keys)).toHaveLength(15);
    expect(Object.keys(binding.attemptLog.keys)).toHaveLength(23);
    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    expect(questionAv.keyValues.map((keyValues) => [keyValues.key.name, keyValues.key.type]))
      .toEqual([
        ["Primary", "block"],
        ["Question ID", "text"],
        ["Question Type", "select"],
        ["Year", "number"],
        ["Subject", "select"],
        ["Category", "select"],
        ["Collection", "select"],
        ["Source", "select"],
        ["Topic ID", "text"],
        ["Parent ID", "text"],
        ["Last Scanned", "date"],
        ["Attempts", "relation"],
        ["Attempt Count", "rollup"],
        ["Wrong Count", "rollup"],
        ["Total Duration (min)", "rollup"],
      ]);
    expect(client.attributeViews.get(binding.attemptLog.avId)!.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.duration_ms,
    )?.key.name).toBe("Duration (min)");
    expect(questionAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.questionIndex.keys.attempts_relation,
    )?.key.relation).toMatchObject({
      avID: binding.attemptLog.avId,
      backKeyID: binding.attemptLog.keys.question_relation,
      isTwoWay: true,
    });
    expect(client.requests.filter((request) => request.endpoint === "/api/av/renderAttributeView")).toHaveLength(2);
    expect(client.requests.find((request) => request.endpoint === "/api/transactions")?.payload.reqId)
      .toEqual(expect.any(Number));
  });

  it("reconnects a verified binding from the system document manifest", async () => {
    const { client, binding } = await initialized();

    const preview = await previewQuestionBankRebinding(client, binding.systemDocumentId);
    const rebound = await confirmQuestionBankRebinding(client, binding.systemDocumentId, preview.token);

    expect(rebound).toEqual(binding);
    expect(preview.systemDocumentId).toBe(binding.systemDocumentId);
  });

  it("stores exam summaries in the existing attempt log without polluting attempt reads", async () => {
    const { client, binding } = await initialized();
    const event = {
      schema_version: 1 as const,
      event_kind: "exam_submitted" as const,
      attempt_id: "exam-event:exam-1:exam_submitted",
      session_id: "exam-1",
      answered_at: "2026-08-06T12:00:00.000Z",
      session_mode: "exam" as const,
      exam_status: "submitted" as const,
      exam_score: 120,
      exam_max_score: 150,
      exam_duration_ms: 5_400_000,
      exam_payload: "{\"queue_question_ids\":[\"q-1\"]}",
    };

    expect((await appendExamSummaryEvent(client, binding, event, idGenerator(800))).status).toBe("created");
    expect((await readAttemptEvents(client, binding)).events).toEqual([]);
    expect((await readExamSummaryEvents(client, binding)).events).toEqual([event]);
  });

  it("migrates a v1 binding to managed two-way relations and rollups", async () => {
    const { client, binding } = await initialized();
    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    const newQuestionFields = ["attempts_relation", "attempt_count", "wrong_count", "total_duration_ms"] as const;
    const { attempts_relation, attempt_count, wrong_count, total_duration_ms, ...legacyQuestionKeys }
      = binding.questionIndex.keys;
    const { wrong_value, ...legacyAttemptKeys } = binding.attemptLog.keys;
    questionAv.keyValues = questionAv.keyValues.filter(
      (value) => !newQuestionFields.some((field) => value.key.id === binding.questionIndex.keys[field]),
    );
    attemptAv.keyValues = attemptAv.keyValues.filter((value) => value.key.id !== wrong_value);
    const relation = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.question_relation,
    )!.key;
    relation.relation = { avID: binding.questionIndex.avId, backKeyID: "", isTwoWay: false };
    const legacy = {
      ...binding,
      schemaVersion: 1,
      questionIndex: { ...binding.questionIndex, keys: legacyQuestionKeys },
      attemptLog: { ...binding.attemptLog, keys: legacyAttemptKeys },
    };
    client.blockAttrs.set(binding.systemDocumentId, {
      "custom-damophus-question-bank-binding": JSON.stringify(legacy),
    });

    const preview = await previewQuestionBankRebinding(client, binding.systemDocumentId);
    const migrated = await confirmQuestionBankRebinding(client, binding.systemDocumentId, preview.token);

    expect(migrated.schemaVersion).toBe(3);
    expect(preview.bindingRepairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "add", field: "attempts_relation", type: "relation" }),
      expect.objectContaining({ kind: "add", field: "attempt_count", type: "rollup" }),
      expect.objectContaining({ kind: "add", field: "wrong_value", type: "number" }),
    ]));
    expect((await verifyQuestionBankBinding(client, migrated)).ok).toBe(true);
  });

  it("previews and repairs missing managed columns while reconnecting", async () => {
    const { client, binding } = await initialized();
    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    attemptAv.keyValues = attemptAv.keyValues.filter(
      (value) => value.key.id !== binding.attemptLog.keys.duration_ms,
    );

    const preview = await previewQuestionBankRebinding(client, binding.systemDocumentId);
    const rebound = await confirmQuestionBankRebinding(client, binding.systemDocumentId, preview.token);

    expect(preview.bindingRepairs).toEqual([expect.objectContaining({ field: "duration_ms" })]);
    expect(rebound).toEqual(binding);
    expect((await verifyQuestionBankBinding(client, rebound)).ok).toBe(true);
  });

  it("previews and repairs legacy Question Index column types", async () => {
    const { client, binding } = await initialized();
    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    for (const field of ["question_type", "year", "subject", "category", "collection", "source"] as const) {
      questionAv.keyValues.find((value) => value.key.id === binding.questionIndex.keys[field])!.key.type = "text";
    }

    const preview = await previewQuestionBankRebinding(client, binding.systemDocumentId);
    await confirmQuestionBankRebinding(client, binding.systemDocumentId, preview.token);

    expect(preview.bindingRepairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "changeType", field: "question_type", currentType: "text", type: "select" }),
      expect.objectContaining({ kind: "changeType", field: "year", currentType: "text", type: "number" }),
    ]));
    expect((await verifyQuestionBankBinding(client, binding)).ok).toBe(true);
  });

  it("migrates legacy millisecond durations to visible minutes", async () => {
    const { client, binding, nextId } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const sync = await previewQuestionIndexSync(client, binding, documentId);
    await confirmQuestionIndexSync(client, binding, documentId, sync.token);
    const event = createAttemptEvent({
      attemptId: "attempt-duration-migration",
      questionId: "civil-kramdown-108",
      questionRelation: "20260804000200-quest01",
      sessionId: "session-duration-migration",
      answeredAt: "2026-08-04T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["A", "B", "C", "D"],
      selectedOptionIds: ["A", "B", "D"],
      objectiveCorrect: true,
      masteryRating: "good",
      durationMs: 42000,
    });
    await appendAttemptEvent(client, binding, event, nextId);

    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    const totalDuration = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.total_duration_ms,
    )!;
    const duration = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.duration_ms,
    )!;
    totalDuration.key.name = "Total Duration (ms)";
    duration.key.name = "Duration (ms)";
    duration.values[0].number = { content: 42000, isNotEmpty: true };

    const preview = await previewQuestionBankRebinding(client, binding.systemDocumentId);
    expect(preview.bindingRepairs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "convertDurationUnit",
        database: "attemptLog",
        field: "duration_ms",
        name: "Duration (min)",
      }),
      expect.objectContaining({
        kind: "convertDurationUnit",
        database: "questionIndex",
        field: "total_duration_ms",
        name: "Total Duration (min)",
      }),
    ]));

    await confirmQuestionBankRebinding(client, binding.systemDocumentId, preview.token);

    expect(duration.key.name).toBe("Duration (min)");
    expect(totalDuration.key.name).toBe("Total Duration (min)");
    expect(duration.values[0].number?.content).toBeCloseTo(0.7);
    expect((await readAttemptEvents(client, binding)).events[0].duration_ms).toBe(42000);
    expect((await verifyQuestionBankBinding(client, binding)).ok).toBe(true);
  });

  it("does not initialize when the preview token was modified", async () => {
    const client = new MockKernelClient();
    const preview = previewQuestionBankInitialization({
      notebookId: "20260804120000-notebok",
      path: "/Damophus",
      idGenerator: idGenerator(),
    });
    preview.path = "/Changed";

    await expect(confirmQuestionBankInitialization(client, preview, preview.token)).rejects.toThrow(
      "preview is stale or modified",
    );
    expect(client.requests).toEqual([]);
  });

  it("removes a newly created system document when initialization fails", async () => {
    const client = new MockKernelClient();
    const preview = previewQuestionBankInitialization({
      notebookId: "20260804120000-notebok",
      path: "/Damophus",
      idGenerator: idGenerator(),
    });
    client.failNextKeyWrite = true;

    await expect(confirmQuestionBankInitialization(client, preview, preview.token))
      .rejects.toThrow("key write failed");

    expect(client.documents.has("20260804130000-system1")).toBe(false);
    expect(client.requests.some((request) => request.endpoint === "/api/filetree/removeDocByID"))
      .toBe(true);
  });

  it("scans real SiYuan kramdown and binds stable IDs to title block IDs", async () => {
    const { client } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));

    const scan = await scanSiyuanDocument(client, documentId);

    expect(scan.report.document.questions[0].id).toBe("civil-kramdown-108");
    expect(scan.blockIdsByQuestionId.get("civil-kramdown-108")).toBe("20260804000200-quest01");
    expect(scan.topicBlockIdsByTopicId.get("civil-security-flow-clause"))
      .toBe("20260804000100-topic01");
  });

  it("ignores question-like IAL inside fenced code when binding SiYuan blocks", async () => {
    const { client } = await initialized();
    const documentId = "20260804120000-codeial";
    client.documents.set(documentId, `${fixture("siyuan-kramdown")}

\`\`\`markdown
##### Fake question
{: id="20260804129999-fake001" custom-qb-id="civil-kramdown-108"}
\`\`\``);

    const scan = await scanSiyuanDocument(client, documentId);

    expect(scan.sourceIssues).toEqual([]);
    expect(scan.blockIdsByQuestionId.get("civil-kramdown-108")).toBe("20260804000200-quest01");
  });

  it("previews and confirms inferred IAL without rewriting question content", async () => {
    const { client, binding } = await initialized();
    const documentId = "20260804120000-infer01";
    client.documents.set(documentId, `## Legacy topic
{: id="20260804120100-topic01"}

##### 1. （单）
{: id="20260804120200-quest01" custom-qb-id="legacy-inferred-1"}

- Stem
  - [ ] A. Correct
  - [ ] B. Incorrect

答案与解析：说明
{: id="20260804120300-solut01"}

正确答案为 A。
{: id="20260804120400-answer1"}`);

    const preview = await previewQuestionIndexSync(client, binding, documentId);

    expect(preview.blockers).toEqual([]);
    expect(preview.ialWriteActions.map((action) => action.reason)).toEqual([
      "inferred-question-type",
      "inferred-solution-boundary",
      "inferred-machine-answer",
    ]);
    expect(preview.actions[0].question.metadata.topicId).toBeUndefined();
    expect(preview.actions[0].question.metadata.scopeTopicId).toBe(
      preview.scan.report.document.topics[0].id,
    );
    expect(client.blockAttrs.get("20260804120200-quest01")).toBeUndefined();

    await confirmQuestionIndexSync(client, binding, documentId, preview.token);

    expect(client.documents.get(documentId)).toContain("##### 1. （单）");
    expect(client.blockAttrs.get("20260804120200-quest01")).toMatchObject({
      "custom-qb-type": "single",
      "custom-qb-answer": "A",
    });
    expect(client.blockAttrs.get("20260804120300-solut01")).toMatchObject({
      "custom-qb-section": "solution",
    });
    const topicValues = client.attributeViews.get(binding.questionIndex.avId)!.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.topic_id,
    )?.values;
    const rowId = client.attributeViews.get(binding.questionIndex.avId)!.keyValues.find(
      (value) => value.key.type === "block",
    )?.values.find((value) => value.block?.id === "20260804120200-quest01")?.blockID;
    expect(topicValues?.find((value) => value.blockID === rowId)?.text?.content)
      .toBe("");
  });

  it("suggests and confirms a stable ID for a valid legacy question without rewriting its content", async () => {
    const { client, binding } = await initialized();
    const documentId = "20260804120000-missingid";
    const source = `##### 12. （单）\n{: id="20260804120200-quest12" custom-qb-source="legacy" custom-qb-year="2022"}\n\n- Stem\n  - [ ] A. Correct\n  - [ ] B. Incorrect\n\n答案与解析：说明\n{: id="20260804120300-solut12"}\n\n正确答案为 A。\n{: id="20260804120400-answer12"}`;
    client.documents.set(documentId, source);

    const preview = await previewQuestionIndexSync(client, binding, documentId);
    const question = preview.scan.report.document.questions[0];
    expect(preview.blockers).toEqual([]);
    expect(question.id).toBe("legacy-2022-12");
    expect(preview.ialWriteActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        blockId: "20260804120200-quest12",
        questionId: question.id,
        reason: "suggested-stable-question-id",
        attributes: { "custom-qb-id": question.id },
      }),
    ]));
    expect(client.documents.get(documentId)).toBe(source);
    expect(client.blockAttrs.get("20260804120200-quest12")).toBeUndefined();

    await confirmQuestionIndexSync(client, binding, documentId, preview.token);

    expect(client.documents.get(documentId)).toBe(source);
    expect(client.blockAttrs.get("20260804120200-quest12")).toMatchObject({
      "custom-qb-id": question.id,
      "custom-qb-type": "single",
    });
  });

  it("previews before writing, preserves user columns, and uses itemID for managed cells", async () => {
    const { client, binding } = await initialized();
    const custom = addCustomColumn(client.attributeViews.get(binding.questionIndex.avId)!);
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const preview = await previewQuestionIndexSync(client, binding, documentId);
    const writesBeforeConfirm = client.requests.filter(
      (request) => request.endpoint === "/api/av/addAttributeViewBlocks",
    ).length;

    expect(preview.actions.map((action) => action.kind)).toEqual(["add"]);
    expect(preview.blockers).toEqual([]);
    expect(writesBeforeConfirm).toBe(0);

    await confirmQuestionIndexSync(client, binding, documentId, preview.token);

    const cellWrites = client.requests.filter(
      (request) => request.endpoint === "/api/av/setAttributeViewBlockAttr",
    );
    const rowId = client.attributeViews.get(binding.questionIndex.avId)!.keyValues.find(
      (value) => value.key.type === "block",
    )!.values[0].blockID;
    expect(cellWrites).toHaveLength(10);
    expect(rowId).not.toBe("20260804000200-quest01");
    expect(cellWrites.every((request) => request.payload.itemID === rowId)).toBe(true);
    const questionType = client.attributeViews.get(binding.questionIndex.avId)!.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.question_type,
    )?.values.find((value) => value.blockID === rowId);
    const year = client.attributeViews.get(binding.questionIndex.avId)!.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.year,
    )?.values.find((value) => value.blockID === rowId);
    expect(questionType).toMatchObject({ type: "select", mSelect: [{ content: "multiple", color: "1" }] });
    expect(year).toMatchObject({ type: "number", number: { content: 2020, isNotEmpty: true } });
    expect(client.attributeViews.get(binding.questionIndex.avId)!.keyValues).toContain(custom);
  });

  it("only proposes index updates when managed question metadata differs", async () => {
    const { client, binding } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const initial = await previewQuestionIndexSync(client, binding, documentId);
    await confirmQuestionIndexSync(client, binding, documentId, initial.token);

    const unchanged = await previewQuestionIndexSync(client, binding, documentId);
    expect(unchanged.actions).toEqual([]);

    const categoryValues = client.attributeViews.get(binding.questionIndex.avId)!.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.category,
    )!.values;
    categoryValues[0].mSelect = [{ content: "stale-category", color: "1" }];

    const changed = await previewQuestionIndexSync(client, binding, documentId);
    expect(changed.actions.map((action) => action.kind)).toEqual(["update"]);
  });

  it("reports per-question sync failures and allows an idempotent retry", async () => {
    const { client, binding } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const preview = await previewQuestionIndexSync(client, binding, documentId);
    client.failNextCellWrite = true;

    const failed = await confirmQuestionIndexSync(client, binding, documentId, preview.token);
    const retryPreview = await previewQuestionIndexSync(client, binding, documentId);
    const retried = await confirmQuestionIndexSync(client, binding, documentId, retryPreview.token);

    expect(failed.results).toEqual([{
      questionId: "civil-kramdown-108",
      status: "failed",
      message: "cell write failed",
    }]);
    expect(retryPreview.blockers).toEqual([]);
    expect(retryPreview.actions.map((action) => action.kind)).toEqual(["update"]);
    expect(retried.results).toEqual([{
      questionId: "civil-kramdown-108",
      status: "synced",
    }]);
  });

  it("reports stale rows only for the document being scanned", async () => {
    const { client, binding } = await initialized();
    const firstDocumentId = "20260804120000-source1";
    const otherDocumentId = "20260804120000-source2";
    client.documents.set(firstDocumentId, fixture("siyuan-kramdown"));
    const firstPreview = await previewQuestionIndexSync(client, binding, firstDocumentId);
    await confirmQuestionIndexSync(client, binding, firstDocumentId, firstPreview.token);
    client.blockRoots.set("20260804000200-quest01", firstDocumentId);
    const emptyDocument = `## Empty
{: id="20260804120000-empty01"}`;
    client.documents.set(firstDocumentId, emptyDocument);
    client.documents.set(otherDocumentId, emptyDocument);

    const otherPreview = await previewQuestionIndexSync(client, binding, otherDocumentId);
    const currentPreview = await previewQuestionIndexSync(client, binding, firstDocumentId);

    expect(otherPreview.staleQuestionIds).toEqual([]);
    expect(currentPreview.staleQuestionIds).toEqual(["civil-kramdown-108"]);
  });

  it("stops writes when a managed key binding is missing", async () => {
    const { client, binding } = await initialized();
    const av = client.attributeViews.get(binding.attemptLog.avId)!;
    av.keyValues = av.keyValues.filter((value) => value.key.id !== binding.attemptLog.keys.attempt_id);
    const event = createAttemptEvent({
      attemptId: "attempt-missing-binding",
      questionId: "q1",
      sessionId: "s1",
      answeredAt: "2026-08-04T12:00:00.000Z",
      questionType: "subjective",
      objectiveCorrect: null,
      masteryRating: "good",
    });

    await expect(appendAttemptEvent(client, binding, event, idGenerator(100))).rejects.toThrow(
      "Question bank binding is invalid",
    );
    expect(client.requests.filter((request) => request.endpoint === "/api/av/addAttributeViewBlocks")).toHaveLength(0);
  });

  it("previews and repairs missing managed columns before index writes", async () => {
    const { client, binding } = await initialized();
    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    attemptAv.keyValues = attemptAv.keyValues.filter(
      (value) => value.key.id !== binding.attemptLog.keys.duration_ms,
    );
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));

    const preview = await previewQuestionIndexSync(client, binding, documentId);

    expect(preview.bindingRepairs).toEqual([expect.objectContaining({
      database: "attemptLog",
      field: "duration_ms",
      keyId: binding.attemptLog.keys.duration_ms,
    })]);

    await confirmQuestionIndexSync(client, binding, documentId, preview.token);

    expect(attemptAv.keyValues.some(
      (value) => value.key.id === binding.attemptLog.keys.duration_ms,
    )).toBe(true);
    expect((await verifyQuestionBankBinding(client, binding)).ok).toBe(true);
  });

  it("appends immutable detached attempts, reads them back, and deduplicates by attempt ID", async () => {
    const { client, binding, nextId } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const sync = await previewQuestionIndexSync(client, binding, documentId);
    await confirmQuestionIndexSync(client, binding, documentId, sync.token);
    const event = createAttemptEvent({
      attemptId: "attempt-1",
      questionId: "civil-kramdown-108",
      questionRelation: "20260804000200-quest01",
      sessionId: "session-1",
      answeredAt: "2026-08-04T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["C", "A", "D", "B"],
      selectedOptionIds: ["A", "B", "D"],
      objectiveCorrect: true,
      masteryRating: "hard",
      durationMs: 12000,
    });

    const created = await appendAttemptEvent(client, binding, event, nextId);
    const duplicate = await appendAttemptEvent(client, binding, event, nextId);
    const read = await readAttemptEvents(client, binding);
    const rebuilt = await rebuildAttemptStatistics(client, binding);

    expect(created.status).toBe("created");
    expect(duplicate).toEqual({ status: "duplicate" });
    expect(read.issues).toEqual([]);
    expect(read.events).toEqual([event]);
    expect(rebuilt.aggregates.get("civil-kramdown-108")).toMatchObject({
      attempts: 1,
      objectiveCorrect: 1,
      consecutiveReviewCount: 1,
    });
    const add = client.requests.find(
      (request) => request.endpoint === "/api/av/addAttributeViewBlocks"
        && request.payload.avID === binding.attemptLog.avId,
    );
    expect(add?.payload.srcs[0]).toMatchObject({ isDetached: true, content: "attempt-1" });
    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    const relation = attemptAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.question_relation,
    )!.values[0];
    const questionRowId = questionAvRowId(client, binding, "20260804000200-quest01");
    expect(relation.relation?.blockIDs).toEqual([questionRowId]);
    expect(attemptAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.wrong_value,
    )!.values[0].number).toMatchObject({ content: 0, isNotEmpty: true });
    expect(attemptAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.duration_ms,
    )!.values[0].number).toMatchObject({ content: 0.2, isNotEmpty: true });
  });

  it("reuses customized native select option colors for later attempts", async () => {
    const { client, binding, nextId } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const sync = await previewQuestionIndexSync(client, binding, documentId);
    await confirmQuestionIndexSync(client, binding, documentId, sync.token);
    const first = createAttemptEvent({
      attemptId: "attempt-style-1",
      questionId: "civil-kramdown-108",
      questionRelation: "20260804000200-quest01",
      sessionId: "session-style",
      answeredAt: "2026-08-04T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["A", "B", "C", "D"],
      selectedOptionIds: ["A", "B"],
      objectiveCorrect: false,
      masteryRating: "hard",
    });
    await appendAttemptEvent(client, binding, first, nextId);

    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    const questionType = attemptAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.question_type,
    )!;
    const order = attemptAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.option_order,
    )!;
    const selected = attemptAv.keyValues.find(
      (keyValues) => keyValues.key.id === binding.attemptLog.keys.selected_option_ids,
    )!;
    questionType.key.options!.find((option) => option.name === "multiple")!.color = "13";
    order.key.options!.find((option) => option.name === "A")!.color = "12";
    order.key.options!.find((option) => option.name === "B")!.color = "4";
    selected.key.options!.find((option) => option.name === "A")!.color = "12";
    selected.key.options!.find((option) => option.name === "B")!.color = "4";

    const second = { ...first, attempt_id: "attempt-style-2" };
    await appendAttemptEvent(client, binding, second, nextId);

    expect(questionType.values[1].mSelect).toEqual([{ content: "multiple", color: "13" }]);
    expect(order.values[1].mSelect).toEqual([
      { content: "A", color: "12" },
      { content: "B", color: "4" },
      { content: "C", color: "8" },
      { content: "D", color: "8" },
    ]);
    expect(selected.values[1].mSelect).toEqual([
      { content: "A", color: "12" },
      { content: "B", color: "4" },
    ]);
  });

  it("converts legacy Attempt text payloads and repairs relation row identities", async () => {
    const { client, binding, nextId } = await initialized();
    const documentId = "20260804120000-sourced";
    client.documents.set(documentId, fixture("siyuan-kramdown"));
    const sync = await previewQuestionIndexSync(client, binding, documentId);
    await confirmQuestionIndexSync(client, binding, documentId, sync.token);
    const event = createAttemptEvent({
      attemptId: "attempt-legacy",
      questionId: "civil-kramdown-108",
      questionRelation: "20260804000200-quest01",
      sessionId: "session-legacy",
      answeredAt: "2026-08-04T12:00:00.000Z",
      questionType: "multiple",
      optionOrder: ["D", "B", "A", "C"],
      selectedOptionIds: ["A", "C"],
      objectiveCorrect: false,
      masteryRating: "again",
      durationMs: 42000,
    });
    const created = await appendAttemptEvent(client, binding, event, nextId);
    if (created.status !== "created") throw new Error("Expected a created attempt");
    const attemptAv = client.attributeViews.get(binding.attemptLog.avId)!;
    const questionAv = client.attributeViews.get(binding.questionIndex.avId)!;
    const questionPrimary = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.block_id,
    )!;
    const sourceBlockByItemId = new Map(questionPrimary.values.flatMap((value) => (
      value.block?.id ? [[value.blockID, value.block.id] as const] : []
    )));
    const legacyQuestionIds = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.question_id,
    )!;
    for (const value of legacyQuestionIds.values) {
      value.blockID = sourceBlockByItemId.get(value.blockID) ?? value.blockID;
    }
    const legacyEmptyCollection = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.collection,
    )!;
    legacyEmptyCollection.key.type = "text";
    for (const value of legacyEmptyCollection.values) {
      Object.assign(value, { type: "text", text: { content: "" }, mSelect: undefined });
    }
    const legacyText = {
      question_type: "multiple",
      option_order: JSON.stringify(event.option_order),
      selected_option_ids: JSON.stringify(event.selected_option_ids),
      objective_correct: "false",
      mastery_rating: "again",
    } as const;
    for (const [field, content] of Object.entries(legacyText)) {
      const keyValues = attemptAv.keyValues.find(
        (value) => value.key.id === binding.attemptLog.keys[field as keyof typeof legacyText],
      )!;
      keyValues.key.type = "text";
      Object.assign(keyValues.values[0], { type: "text", text: { content }, mSelect: undefined });
    }
    const relationValues = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.question_relation,
    )!;
    relationValues.key.relation = {
      avID: binding.questionIndex.avId,
      backKeyID: "",
      isTwoWay: false,
    };
    relationValues.values[0].relation = { blockIDs: [event.question_relation!] };
    attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.wrong_value,
    )!.values = [];

    const preview = await previewQuestionBankRebinding(client, binding.systemDocumentId);
    await confirmQuestionBankRebinding(client, binding.systemDocumentId, preview.token);
    const read = await readAttemptEvents(client, binding);
    const questionRowId = questionAvRowId(client, binding, event.question_relation!);

    expect(preview.bindingRepairs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "changeType", field: "question_type", type: "select" }),
      expect.objectContaining({ kind: "changeType", field: "option_order", type: "mSelect" }),
      expect.objectContaining({ kind: "changeType", field: "collection", type: "select" }),
      expect.objectContaining({ kind: "configureRelation", field: "question_relation" }),
      expect.objectContaining({ kind: "normalizeValues", field: "question_relation" }),
      expect.objectContaining({ kind: "normalizeValues", field: "wrong_value" }),
    ]));
    expect(legacyEmptyCollection.values.every((value) => value.text == null)).toBe(true);
    expect(read).toEqual({ events: [event], issues: [] });
    expect(relationValues.values[0].relation?.blockIDs).toEqual([questionRowId]);
    expect(attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.wrong_value,
    )!.values[0].number).toMatchObject({ content: 1, isNotEmpty: true });
  });

  it("removes a partially created detached row when a cell write fails", async () => {
    const { client, binding, nextId } = await initialized();
    const event = createAttemptEvent({
      attemptId: "attempt-rollback",
      questionId: "q1",
      sessionId: "s1",
      answeredAt: "2026-08-04T12:00:00.000Z",
      questionType: "subjective",
      objectiveCorrect: null,
      masteryRating: "again",
    });
    client.failNextCellWrite = true;

    await expect(appendAttemptEvent(client, binding, event, nextId)).rejects.toThrow("cell write failed");

    const primary = client.attributeViews.get(binding.attemptLog.avId)!.keyValues.find(
      (value) => value.key.type === "block",
    )!;
    expect(primary.values).toEqual([]);
    expect(client.requests.some((request) => request.endpoint === "/api/av/removeAttributeViewBlocks")).toBe(true);
  });
});
