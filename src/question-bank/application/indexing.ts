import type { Question, ScanMessage } from "../core/types";
import {
  readAttributeView,
  repairQuestionBankBinding,
  verifyQuestionBankBinding,
  type ManagedKeyRepair,
  type QuestionBankBinding,
} from "../adapters/siyuan/binding";
import {
  dateCell,
  numberCell,
  selectCell,
  setAttributeViewCell,
  textCell,
} from "../adapters/siyuan/cells";
import {
  getQuestionBlockId,
  scanSiyuanDocument,
  type SiyuanDocumentScan,
  type SiyuanIalWriteAction,
} from "../adapters/siyuan/document";
import type { AttributeViewValue, SiyuanKernelClient } from "../adapters/siyuan/types";

export interface QuestionIndexAction {
  kind: "add" | "update";
  question: Question;
  blockId: string;
}

export interface QuestionIndexPreview {
  token: string;
  generatedAt: string;
  documentId: string;
  scan: SiyuanDocumentScan;
  actions: QuestionIndexAction[];
  staleQuestionIds: string[];
  blockers: ScanMessage[];
  bindingRepairs: ManagedKeyRepair[];
  ialWriteActions: SiyuanIalWriteAction[];
  results: QuestionIndexWriteResult[];
}

export interface QuestionIndexWriteResult {
  questionId: string;
  status: "synced" | "failed";
  message?: string;
}

interface ExistingQuestionRow {
  itemId: string;
  blockId?: string;
  questionId?: string;
}

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

function valueByItem(values: readonly AttributeViewValue[]): Map<string, AttributeViewValue> {
  return new Map(values.map((value) => [value.blockID, value]));
}

function existingQuestionRows(
  av: Awaited<ReturnType<typeof readAttributeView>>,
  binding: QuestionBankBinding,
): ExistingQuestionRow[] {
  const primaryValues = av.keyValues.find(
    (keyValues) => keyValues.key.id === binding.questionIndex.keys.block_id,
  )?.values ?? [];
  const questionValues = valueByItem(av.keyValues.find(
    (keyValues) => keyValues.key.id === binding.questionIndex.keys.question_id,
  )?.values ?? []);
  return primaryValues.map((primary) => ({
    itemId: primary.blockID,
    blockId: primary.block?.id,
    questionId: questionValues.get(primary.blockID)?.text?.content,
  }));
}

function hashPreview(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function previewToken(
  documentId: string,
  actions: readonly QuestionIndexAction[],
  stale: readonly string[],
  bindingRepairs: readonly ManagedKeyRepair[],
  ialWriteActions: readonly SiyuanIalWriteAction[],
): string {
  return hashPreview(JSON.stringify({
    documentId,
    actions: actions.map((action) => ({
      kind: action.kind,
      blockId: action.blockId,
      question: action.question,
    })),
    stale,
    bindingRepairs,
    ialWriteActions,
  }));
}

async function questionRowsInDocument(
  client: SiyuanKernelClient,
  rows: readonly ExistingQuestionRow[],
  documentId: string,
): Promise<ExistingQuestionRow[]> {
  const blockIds = [...new Set(rows.map((row) => row.blockId).filter(
    (blockId): blockId is string => Boolean(blockId) && nodeIdPattern.test(blockId!),
  ))];
  if (blockIds.length === 0) return [];
  const quoted = blockIds.map((blockId) => `'${blockId}'`).join(",");
  const blocks = await client.request<Array<{ id?: string; root_id?: string }>>("/api/query/sql", {
    stmt: `SELECT id, root_id FROM blocks WHERE id IN (${quoted})`,
  });
  const currentBlockIds = new Set(
    blocks.filter((block) => block.root_id === documentId).map((block) => block.id),
  );
  return rows.filter((row) => row.blockId && currentBlockIds.has(row.blockId));
}

export async function previewQuestionIndexSync(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  documentId: string,
): Promise<QuestionIndexPreview> {
  const bindingVerification = await verifyQuestionBankBinding(client, binding);
  if (bindingVerification.fatalErrors.length > 0) {
    throw new Error(`Question bank binding is invalid: ${bindingVerification.fatalErrors.join("; ")}`);
  }
  const scan = await scanSiyuanDocument(client, documentId);
  const av = await readAttributeView(client, binding.questionIndex.avId);
  const rows = existingQuestionRows(av, binding);
  const documentRows = await questionRowsInDocument(client, rows, documentId);
  const byQuestionId = new Map(rows.filter((row) => row.questionId).map((row) => [row.questionId!, row]));
  const byBlockId = new Map(rows.filter((row) => row.blockId).map((row) => [row.blockId!, row]));
  const blockers = [...scan.report.conflicts, ...scan.sourceIssues];
  const actions: QuestionIndexAction[] = [];

  for (const question of scan.report.document.questions) {
    const blockId = getQuestionBlockId(scan, question);
    if (!blockId) {
      blockers.push({
        code: "missing-siyuan-block-binding",
        message: `Question '${question.id}' cannot be bound to the question index`,
        questionId: question.id,
      });
      continue;
    }
    const sameQuestion = byQuestionId.get(question.id);
    const sameBlock = byBlockId.get(blockId);
    if (sameQuestion && sameQuestion.blockId !== blockId) {
      blockers.push({
        code: "question-id-rebound",
        message: `Question '${question.id}' is already bound to block '${sameQuestion.blockId}'`,
        questionId: question.id,
      });
      continue;
    }
    if (sameBlock?.questionId && sameBlock.questionId !== question.id) {
      blockers.push({
        code: "block-id-reused",
        message: `Block '${blockId}' is already indexed as question '${sameBlock.questionId}'`,
        questionId: question.id,
      });
      continue;
    }
    actions.push({ kind: sameQuestion || sameBlock ? "update" : "add", question, blockId });
  }

  const scannedIds = new Set(scan.report.document.questions.map((question) => question.id));
  const staleQuestionIds = documentRows
    .map((row) => row.questionId)
    .filter((questionId): questionId is string => Boolean(questionId) && !scannedIds.has(questionId!));
  const actionableQuestionIds = new Set(actions.map((action) => action.question.id));
  const ialWriteActions = scan.ialWriteActions.filter(
    (action) => actionableQuestionIds.has(action.questionId),
  );
  const bindingRepairs = bindingVerification.missingManagedKeys;
  return {
    token: previewToken(documentId, actions, staleQuestionIds, bindingRepairs, ialWriteActions),
    generatedAt: new Date().toISOString(),
    documentId,
    scan,
    actions,
    staleQuestionIds,
    blockers,
    bindingRepairs,
    ialWriteActions,
    results: [],
  };
}

async function writeInferredIal(
  client: SiyuanKernelClient,
  actions: readonly SiyuanIalWriteAction[],
): Promise<void> {
  const byBlockId = new Map<string, Record<string, string>>();
  for (const action of actions) {
    if (Object.keys(action.attributes).some((key) => !key.startsWith("custom-qb-"))) {
      throw new Error(`Refusing to write non-question-bank attributes to block '${action.blockId}'`);
    }
    byBlockId.set(action.blockId, {
      ...(byBlockId.get(action.blockId) ?? {}),
      ...action.attributes,
    });
  }
  for (const [id, attrs] of byBlockId) {
    await client.request("/api/attr/setBlockAttrs", { id, attrs });
  }
}

async function writeQuestionRow(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  action: QuestionIndexAction,
  itemId: string,
  scannedAt: number,
): Promise<void> {
  const { questionIndex } = binding;
  const metadata = action.question.metadata;
  const values = {
    question_id: textCell(action.question.id),
    question_type: selectCell(action.question.type),
    year: numberCell(metadata.year === undefined ? undefined : Number(metadata.year)),
    subject: selectCell(metadata.subject),
    category: selectCell(metadata.category),
    collection: selectCell(metadata.collection),
    source: selectCell(metadata.source),
    topic_id: textCell(metadata.topicId),
    parent_id: textCell(metadata.parentId),
    last_scanned_at: dateCell(scannedAt),
  };
  for (const [field, value] of Object.entries(values)) {
    await setAttributeViewCell(
      client,
      questionIndex.avId,
      questionIndex.keys[field as keyof typeof values],
      itemId,
      value,
    );
  }
}

async function getQuestionRowItemId(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  blockId: string,
): Promise<string> {
  const itemIds = await client.request<Record<string, string>>(
    "/api/av/getAttributeViewItemIDsByBoundIDs",
    { avID: binding.questionIndex.avId, blockIDs: [blockId] },
  );
  const itemId = itemIds[blockId];
  if (!itemId) throw new Error(`Question index row was not found for bound block '${blockId}'`);
  return itemId;
}

export async function confirmQuestionIndexSync(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  documentId: string,
  expectedToken: string,
): Promise<QuestionIndexPreview> {
  const preview = await previewQuestionIndexSync(client, binding, documentId);
  if (preview.token !== expectedToken) {
    throw new Error("Question index preview is stale; scan again before confirming");
  }
  if (preview.blockers.length > 0) {
    throw new Error(`Question index sync is blocked: ${preview.blockers.map((item) => item.message).join("; ")}`);
  }
  await repairQuestionBankBinding(client, binding, preview.bindingRepairs);
  const scannedAt = Date.now();
  const results: QuestionIndexWriteResult[] = [];
  for (const action of preview.actions) {
    try {
      await writeInferredIal(
        client,
        preview.ialWriteActions.filter((update) => update.questionId === action.question.id),
      );
      if (action.kind === "add") {
        await client.request("/api/av/addAttributeViewBlocks", {
          avID: binding.questionIndex.avId,
          blockID: binding.questionIndex.blockId,
          viewID: "",
          groupID: "",
          previousID: "",
          srcs: [{
            id: action.blockId,
            isDetached: false,
            content: action.question.title,
          }],
          ignoreDefaultFill: true,
        });
      }
      const itemId = await getQuestionRowItemId(client, binding, action.blockId);
      await writeQuestionRow(client, binding, action, itemId, scannedAt);
      results.push({ questionId: action.question.id, status: "synced" });
    } catch (error) {
      results.push({
        questionId: action.question.id,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ...preview, bindingRepairs: [], ialWriteActions: [], results };
}
