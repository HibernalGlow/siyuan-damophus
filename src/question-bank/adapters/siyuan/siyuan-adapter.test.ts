import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "../../core/attempts";
import { appendAttemptEvent, readAttemptEvents, rebuildAttemptStatistics } from "./attempt-store";
import {
  confirmQuestionBankInitialization,
  confirmQuestionBankRebinding,
  previewQuestionBankInitialization,
  previewQuestionBankRebinding,
  verifyQuestionBankBinding,
  type QuestionBankBinding,
} from "./binding";
import { scanSiyuanDocument } from "./document";
import type {
  AttributeViewKeyValues,
  AttributeViewValue,
  NodeIdGenerator,
  RawAttributeView,
  SiyuanKernelClient,
} from "./types";
import { confirmQuestionIndexSync, previewQuestionIndexSync } from "../../application/indexing";

interface RequestRecord {
  endpoint: string;
  payload: any;
}

function idGenerator(start = 0): NodeIdGenerator {
  let value = start;
  return () => `2026080412${String(value++).padStart(4, "0")}-${value.toString(36).padStart(7, "0").slice(-7)}`;
}

class MockKernelClient implements SiyuanKernelClient {
  readonly requests: RequestRecord[] = [];
  readonly documents = new Map<string, string>();
  readonly blockRoots = new Map<string, string>();
  readonly blockAttrs = new Map<string, Record<string, string>>();
  readonly attributeViews = new Map<string, RawAttributeView>();
  private primaryIndex = 0;
  private rowIndex = 0;
  failNextCellWrite = false;
  failNextKeyWrite = false;

  async request<T>(endpoint: string, payload: any): Promise<T> {
    this.requests.push({ endpoint, payload });
    if (endpoint === "/api/filetree/createDocWithMd") {
      const documentId = "20260804130000-system1";
      this.documents.set(documentId, payload.markdown);
      return documentId as T;
    }
    if (endpoint === "/api/filetree/getIDsByHPath") return [] as T;
    if (endpoint === "/api/filetree/removeDocByID") {
      this.documents.delete(payload.id);
      return null as T;
    }
    if (endpoint === "/api/block/getBlockKramdown") {
      const kramdown = this.documents.get(payload.id);
      if (kramdown === undefined) throw new Error(`Block not found: ${payload.id}`);
      return { id: payload.id, kramdown } as T;
    }
    if (endpoint === "/api/query/sql") {
      const ids = [...String(payload.stmt).matchAll(/'(\d{14}-[a-z0-9]{7})'/gu)]
        .map((match) => match[1]);
      return ids.flatMap((id) => {
        const root = this.blockRoots.get(id);
        return root ? [{ id, root_id: root }] : [];
      }) as T;
    }
    if (endpoint === "/api/attr/setBlockAttrs") {
      this.blockAttrs.set(payload.id, {
        ...(this.blockAttrs.get(payload.id) ?? {}),
        ...payload.attrs,
      });
      return null as T;
    }
    if (endpoint === "/api/attr/getBlockAttrs") {
      return (this.blockAttrs.get(payload.id) ?? {}) as T;
    }
    if (endpoint === "/api/av/renderAttributeView") {
      if (!this.attributeViews.has(payload.id)) {
        const primaryId = `2026080413100${this.primaryIndex}-primary`;
        this.primaryIndex += 1;
        this.attributeViews.set(payload.id, {
          id: payload.id,
          keyValues: [{ key: { id: primaryId, name: "Primary", type: "block" }, values: [] }],
        });
      }
      return { id: payload.id, viewID: "view" } as T;
    }
    if (endpoint === "/api/av/getAttributeView") {
      const av = this.attributeViews.get(payload.id);
      if (!av) throw new Error(`AV not found: ${payload.id}`);
      return { av } as T;
    }
    if (endpoint === "/api/av/addAttributeViewKey") {
      if (this.failNextKeyWrite) {
        this.failNextKeyWrite = false;
        throw new Error("key write failed");
      }
      const av = this.requireAv(payload.avID);
      av.keyValues.push({
        key: { id: payload.keyID, name: payload.keyName, type: payload.keyType },
        values: [],
      });
      return null as T;
    }
    if (endpoint === "/api/transactions") {
      for (const transaction of payload.transactions) {
        for (const operation of transaction.doOperations) {
          const av = this.requireAv(operation.avID);
          const key = av.keyValues.find((value) => value.key.id === operation.keyID)?.key;
          if (operation.action === "updateAttrViewColRelation") {
            if (!key) throw new Error(`Key not found: ${operation.keyID}`);
            key.name = operation.format;
            key.relation = {
              avID: operation.id,
              backKeyID: operation.isTwoWay ? operation.backRelationKeyID : "",
              isTwoWay: operation.isTwoWay,
            };
            if (operation.isTwoWay) {
              const destination = this.requireAv(operation.id);
              const backKeyValues = destination.keyValues.find(
                (value) => value.key.id === operation.backRelationKeyID,
              );
              if (!backKeyValues) throw new Error(`Back key not found: ${operation.backRelationKeyID}`);
              backKeyValues.key.name = operation.name;
              backKeyValues.key.type = "relation";
              backKeyValues.key.relation = {
                avID: operation.avID,
                backKeyID: operation.keyID,
                isTwoWay: true,
              };
              const sourceValues = av.keyValues.find(
                (value) => value.key.id === operation.keyID,
              )?.values ?? [];
              for (const sourceValue of sourceValues) {
                for (const destinationId of sourceValue.relation?.blockIDs ?? []) {
                  const back = backKeyValues.values.find((value) => value.blockID === destinationId) ?? {
                    keyID: backKeyValues.key.id,
                    blockID: destinationId,
                    type: "relation" as const,
                    relation: { blockIDs: [] },
                  };
                  back.relation!.blockIDs = [...new Set([...back.relation!.blockIDs, sourceValue.blockID])];
                  if (!backKeyValues.values.includes(back)) backKeyValues.values.push(back);
                }
              }
            }
          } else if (operation.action === "updateAttrViewColRollup") {
            const rollupKey = av.keyValues.find((value) => value.key.id === operation.id)?.key;
            if (!rollupKey) throw new Error(`Rollup key not found: ${operation.id}`);
            rollupKey.rollup = {
              relationKeyID: operation.parentID,
              keyID: operation.keyID,
              calc: operation.data.calc,
            };
          } else if (operation.action === "updateAttrViewCol") {
            const updatedKey = av.keyValues.find((value) => value.key.id === operation.id)?.key;
            if (!updatedKey) throw new Error(`Key not found: ${operation.id}`);
            updatedKey.name = operation.name;
            updatedKey.type = operation.type;
            const values = av.keyValues.find((value) => value.key.id === operation.id)!.values;
            for (const value of values) value.type = operation.type;
          }
        }
      }
      return [{}] as T;
    }
    if (endpoint === "/api/av/addAttributeViewBlocks") {
      const av = this.requireAv(payload.avID);
      const primary = av.keyValues.find((value) => value.key.type === "block")!;
      for (const source of payload.srcs) {
        const itemID = source.itemID
          ?? `20260805150000-row${String(this.rowIndex++).padStart(4, "0")}`;
        if (primary.values.some((value) => value.blockID === itemID)) continue;
        if (!source.isDetached && primary.values.some((value) => value.block?.id === source.id)) continue;
        primary.values.push({
          keyID: primary.key.id,
          blockID: itemID,
          type: "block",
          isDetached: source.isDetached,
          block: { id: source.isDetached ? undefined : source.id, content: source.content },
        });
      }
      return null as T;
    }
    if (endpoint === "/api/av/getAttributeViewItemIDsByBoundIDs") {
      const av = this.requireAv(payload.avID);
      const primary = av.keyValues.find((value) => value.key.type === "block")!;
      return Object.fromEntries(payload.blockIDs.map((blockID: string) => [
        blockID,
        primary.values.find((value) => value.block?.id === blockID)?.blockID ?? "",
      ])) as T;
    }
    if (endpoint === "/api/av/setAttributeViewBlockAttr") {
      if (this.failNextCellWrite) {
        this.failNextCellWrite = false;
        throw new Error("cell write failed");
      }
      const av = this.requireAv(payload.avID);
      const primary = av.keyValues.find((value) => value.key.type === "block")!;
      if (!primary.values.some((value) => value.blockID === payload.itemID)) {
        throw new Error(`Row not found: ${payload.itemID}`);
      }
      const keyValues = av.keyValues.find((value) => value.key.id === payload.keyID);
      if (!keyValues) throw new Error(`Key not found: ${payload.keyID}`);
      const value: AttributeViewValue = keyValues.values.find(
        (item) => item.blockID === payload.itemID,
      ) ?? {
        keyID: payload.keyID,
        blockID: payload.itemID,
        type: payload.value.type,
      };
      const previousRelationIds = value.relation?.blockIDs ?? [];
      Object.assign(value, payload.value);
      if (!keyValues.values.includes(value)) keyValues.values.push(value);
      if (keyValues.key.type === "relation" && keyValues.key.relation?.isTwoWay) {
        const destination = this.requireAv(keyValues.key.relation.avID!);
        const backValues = destination.keyValues.find(
          (item) => item.key.id === keyValues.key.relation!.backKeyID,
        )!;
        for (const destinationId of previousRelationIds) {
          const back = backValues.values.find((item) => item.blockID === destinationId);
          if (back?.relation) back.relation.blockIDs = back.relation.blockIDs.filter(
            (id) => id !== payload.itemID,
          );
        }
        for (const destinationId of payload.value.relation?.blockIDs ?? []) {
          let back = backValues.values.find((item) => item.blockID === destinationId);
          if (!back) {
            back = {
              keyID: backValues.key.id,
              blockID: destinationId,
              type: "relation",
              relation: { blockIDs: [] },
            };
            backValues.values.push(back);
          }
          back.relation!.blockIDs = [...new Set([...back.relation!.blockIDs, payload.itemID])];
        }
      }
      return { value } as T;
    }
    if (endpoint === "/api/av/removeAttributeViewBlocks") {
      const av = this.requireAv(payload.avID);
      for (const keyValues of av.keyValues) {
        keyValues.values = keyValues.values.filter((value) => !payload.srcIDs.includes(value.blockID));
      }
      return null as T;
    }
    throw new Error(`Unhandled endpoint: ${endpoint}`);
  }

  private requireAv(id: string): RawAttributeView {
    const av = this.attributeViews.get(id);
    if (!av) throw new Error(`AV not found: ${id}`);
    return av;
  }
}

async function initialized(): Promise<{
  client: MockKernelClient;
  binding: QuestionBankBinding;
  nextId: NodeIdGenerator;
}> {
  const client = new MockKernelClient();
  const nextId = idGenerator();
  const preview = previewQuestionBankInitialization({
    notebookId: "20260804120000-notebok",
    path: "/Damophus",
    idGenerator: nextId,
  });
  const binding = await confirmQuestionBankInitialization(client, preview, preview.token);
  return { client, binding, nextId };
}

function fixture(name: string): string {
  return readFileSync(new URL(`../../fixtures/${name}.md`, import.meta.url), "utf8");
}

function addCustomColumn(av: RawAttributeView): AttributeViewKeyValues {
  const custom: AttributeViewKeyValues = {
    key: { id: "20260804140000-custom1", name: "My Notes", type: "text" },
    values: [],
  };
  av.keyValues.splice(1, 0, custom);
  return custom;
}

function questionAvRowId(
  client: MockKernelClient,
  binding: QuestionBankBinding,
  sourceBlockId: string,
): string {
  const rowId = client.attributeViews.get(binding.questionIndex.avId)?.keyValues.find(
    (keyValues) => keyValues.key.id === binding.questionIndex.keys.block_id,
  )?.values.find((value) => value.block?.id === sourceBlockId)?.blockID;
  if (!rowId) throw new Error(`Question row not found for ${sourceBlockId}`);
  return rowId;
}

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
    expect(Object.keys(binding.attemptLog.keys)).toHaveLength(15);
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
        ["Total Duration (ms)", "rollup"],
      ]);
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

    expect(migrated.schemaVersion).toBe(2);
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
