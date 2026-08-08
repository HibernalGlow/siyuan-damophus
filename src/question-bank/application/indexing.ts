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
import { questionRowIdentityMaps } from "../adapters/siyuan/row-identity";
import {
  confirmTopicRelationSync,
  portableTopicAssignments,
  previewTopicRelationSync,
  rebuildTopicStatistics,
  restoreQuestionTopicRelations,
} from "../adapters/siyuan/topic-index";

export type QuestionIndexAction = {
  kind: "add" | "update";
  question: Question;
  blockId: string;
} | {
  kind: "rebind";
  question: Question;
  blockId: string;
  itemId: string;
  previousBlockId?: string;
};

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
  values: Partial<Record<QuestionIndexComparableField, AttributeViewValue>>;
}

const questionIndexComparableFields = [
  "question_id",
  "question_type",
  "year",
  "subject",
  "category",
  "collection",
  "source",
  "topic_id",
  "parent_id",
] as const;

type QuestionIndexComparableField = typeof questionIndexComparableFields[number];

export interface StableQuestionIdMetadata {
  year?: string;
  collection?: string;
  source?: string;
}

export interface QuestionIndexMaintenanceResult {
  bindingRepairs: number;
  updatedRows: number;
  rebuiltTopics: number;
}

export interface QuestionIndexMaintenancePreview {
  bindingRepairs: readonly ManagedKeyRepair[];
  updatedRows: number;
  needsMaintenance: boolean;
}

interface PlannedMaintenanceUpdate {
  itemId: string;
  field: "year" | "collection" | "source" | "parent_id";
  value: string;
  type: "select" | "text";
}

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;
const questionKindTokens = new Set([
  "group",
  "indefinite",
  "multiple",
  "objective",
  "single",
  "subjective",
  "true-false",
]);

export function stableQuestionIdMetadata(questionId: string): StableQuestionIdMetadata {
  const tokens = questionId.split("-").filter(Boolean);
  const yearIndex = tokens.findIndex((token) => /^(?:19|20)\d{2}$/u.test(token));
  if (yearIndex < 0) return {};
  let sourceIndex = yearIndex - 1;
  if (sourceIndex >= 0 && questionKindTokens.has(tokens[sourceIndex])) sourceIndex -= 1;
  const source = sourceIndex >= 0 ? tokens[sourceIndex] : undefined;
  return {
    year: tokens[yearIndex],
    // Existing question IDs only carry one source-family token. Use it as the
    // collection fallback until portable IAL provides a more specific value.
    collection: source,
    source,
  };
}

function projectedMetadata(question: Question): Required<Pick<Question["metadata"], "topicPath">>
  & Pick<Question["metadata"], "year" | "subject" | "category" | "collection" | "source" | "topicId" | "parentId"> {
  const inferred = stableQuestionIdMetadata(question.id);
  return {
    ...question.metadata,
    year: question.metadata.year ?? inferred.year,
    collection: question.metadata.collection ?? inferred.collection,
    source: question.metadata.source ?? inferred.source,
  };
}

function valueByItem(values: readonly AttributeViewValue[]): Map<string, AttributeViewValue> {
  return new Map(values.map((value) => [value.blockID, value]));
}

function existingQuestionRows(
  av: Awaited<ReturnType<typeof readAttributeView>>,
  binding: QuestionBankBinding,
): ExistingQuestionRow[] {
  const identities = questionRowIdentityMaps(av, binding.questionIndex.keys.block_id);
  const valuesByField = new Map(questionIndexComparableFields.map((field) => [
    field,
    valueByItem(av.keyValues.find(
      (keyValues) => keyValues.key.id === binding.questionIndex.keys[field],
    )?.values ?? []),
  ]));
  return identities.rows.map((row) => {
    const values = Object.fromEntries(questionIndexComparableFields.flatMap((field) => {
      const fieldValues = valuesByField.get(field);
      const value = fieldValues?.get(row.itemId)
        ?? (row.sourceBlockId ? fieldValues?.get(row.sourceBlockId) : undefined);
      return value ? [[field, value]] : [];
    })) as Partial<Record<QuestionIndexComparableField, AttributeViewValue>>;
    return {
      itemId: row.itemId,
      blockId: row.sourceBlockId,
      questionId: values.question_id?.text?.content,
      values,
    };
  });
}

function comparableText(value: AttributeViewValue | undefined): string {
  return value?.mSelect?.[0]?.content ?? value?.text?.content ?? "";
}

function questionRowNeedsUpdate(row: ExistingQuestionRow, question: Question): boolean {
  const metadata = projectedMetadata(question);
  return comparableText(row.values.question_id) !== question.id
    || comparableText(row.values.question_type) !== question.type
    || comparableText(row.values.year) !== (metadata.year ?? "")
    || comparableText(row.values.subject) !== (metadata.subject ?? "")
    || comparableText(row.values.category) !== (metadata.category ?? "")
    || comparableText(row.values.collection) !== (metadata.collection ?? "")
    || comparableText(row.values.source) !== (metadata.source ?? "")
    || comparableText(row.values.topic_id) !== (metadata.topicId ?? "")
    || comparableText(row.values.parent_id) !== (metadata.parentId ?? "");
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

async function questionBlockRoots(
  client: SiyuanKernelClient,
  rows: readonly ExistingQuestionRow[],
): Promise<Map<string, string>> {
  const blockIds = [...new Set(rows.map((row) => row.blockId).filter(
    (blockId): blockId is string => Boolean(blockId) && nodeIdPattern.test(blockId!),
  ))];
  if (blockIds.length === 0) return new Map();
  const quoted = blockIds.map((blockId) => `'${blockId}'`).join(",");
  const blocks = await client.request<Array<{ id?: string; root_id?: string }>>("/api/query/sql", {
    stmt: `SELECT id, root_id FROM blocks WHERE id IN (${quoted})`,
  });
  return new Map(blocks.flatMap((block) => (
    block.id && block.root_id ? [[block.id, block.root_id]] : []
  )));
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
  const blockRoots = await questionBlockRoots(client, rows);
  const documentRows = rows.filter(
    (row) => row.blockId && blockRoots.get(row.blockId) === documentId,
  );
  const rowsByQuestionId = new Map<string, ExistingQuestionRow[]>();
  for (const row of rows) {
    if (!row.questionId) continue;
    rowsByQuestionId.set(row.questionId, [...(rowsByQuestionId.get(row.questionId) ?? []), row]);
  }
  const byBlockId = new Map(rows.filter((row) => row.blockId).map((row) => [row.blockId!, row]));
  const blockers = [...scan.report.conflicts, ...scan.sourceIssues];
  const actions: QuestionIndexAction[] = [];
  const questionsWithIalWrites = new Set(scan.ialWriteActions.map((action) => action.questionId));

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
    const questionRows = rowsByQuestionId.get(question.id) ?? [];
    if (questionRows.length > 1) {
      blockers.push({
        code: "duplicate-question-index-id",
        message: `Question '${question.id}' has multiple Question Index rows`,
        questionId: question.id,
      });
      continue;
    }
    const sameQuestion = questionRows[0];
    const sameBlock = byBlockId.get(blockId);
    if (sameBlock?.questionId && sameBlock.questionId !== question.id) {
      blockers.push({
        code: "block-id-reused",
        message: `Block '${blockId}' is already indexed as question '${sameBlock.questionId}'`,
        questionId: question.id,
      });
      continue;
    }
    if (sameQuestion && sameQuestion.blockId !== blockId) {
      if (sameQuestion.blockId && blockRoots.has(sameQuestion.blockId)) {
        blockers.push({
          code: "question-id-rebound",
          message: `Question '${question.id}' is already bound to existing block '${sameQuestion.blockId}'`,
          questionId: question.id,
        });
      } else {
        actions.push({
          kind: "rebind",
          question,
          blockId,
          itemId: sameQuestion.itemId,
          previousBlockId: sameQuestion.blockId,
        });
      }
      continue;
    }
    const existing = sameQuestion ?? sameBlock;
    if (!existing) actions.push({ kind: "add", question, blockId });
    else if (questionRowNeedsUpdate(existing, question) || questionsWithIalWrites.has(question.id)) {
      actions.push({ kind: "update", question, blockId });
    }
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
  const metadata = projectedMetadata(action.question);
  const values = {
    question_id: textCell(action.question.id),
    question_type: selectCell(action.question.type),
    year: selectCell(metadata.year),
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

async function readQuestionIndexMaintenancePlan(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<{ bindingRepairs: ManagedKeyRepair[]; updates: PlannedMaintenanceUpdate[] }> {
  const verification = await verifyQuestionBankBinding(client, binding);
  if (verification.fatalErrors.length > 0) {
    throw new Error(`Question bank binding is invalid: ${verification.fatalErrors.join("; ")}`);
  }
  const av = await readAttributeView(client, binding.questionIndex.avId);
  const rows = existingQuestionRows(av, binding);
  const updates: PlannedMaintenanceUpdate[] = [];
  for (const row of rows) {
    if (!row.questionId) continue;
    const inferred = stableQuestionIdMetadata(row.questionId);
    const attrs = row.blockId && nodeIdPattern.test(row.blockId)
      ? await client.request<Record<string, string>>("/api/attr/getBlockAttrs", { id: row.blockId })
      : {};
    const values = [
      ["year", inferred.year ?? attrs["custom-qb-year"], "select", true],
      ["collection", attrs["custom-qb-collection"] ?? inferred.collection, "select", false],
      ["source", attrs["custom-qb-source"] ?? inferred.source, "select", false],
      ["parent_id", attrs["custom-qb-parent-id"], "text", false],
    ] as const;
    const pending = values.filter(([field, value, _type, always]) => {
      if (value === undefined) return false;
      const current = comparableText(row.values[field]);
      // Year is derived from the stable ID and is always corrected. Collection
      // and source only fill gaps so an explicit IAL projection remains intact.
      return always ? current !== value : current === "";
    });
    if (pending.length === 0) continue;
    for (const [field, value, type] of pending) {
      updates.push({ itemId: row.itemId, field, value, type });
    }
  }
  return { bindingRepairs: verification.missingManagedKeys, updates };
}

export async function previewQuestionIndexMaintenance(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<QuestionIndexMaintenancePreview> {
  const plan = await readQuestionIndexMaintenancePlan(client, binding);
  return {
    bindingRepairs: plan.bindingRepairs,
    updatedRows: new Set(plan.updates.map((update) => update.itemId)).size,
    needsMaintenance: plan.bindingRepairs.length > 0 || plan.updates.length > 0,
  };
}

export async function maintainQuestionIndex(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<QuestionIndexMaintenanceResult> {
  const plan = await readQuestionIndexMaintenancePlan(client, binding);
  if (plan.bindingRepairs.length > 0) {
    await repairQuestionBankBinding(client, binding, plan.bindingRepairs);
  }
  for (const update of plan.updates) {
    await setAttributeViewCell(
      client,
      binding.questionIndex.avId,
      binding.questionIndex.keys[update.field],
      update.itemId,
      update.type === "text" ? textCell(update.value) : selectCell(update.value),
    );
  }
  const topicStatistics = await rebuildTopicStatistics(client, binding);
  if (topicStatistics.issues.length > 0) {
    throw new Error(`Topic Index statistics remain incomplete: ${topicStatistics.issues.map((issue) => issue.message).join("; ")}`);
  }
  return {
    bindingRepairs: plan.bindingRepairs.length,
    updatedRows: new Set(plan.updates.map((update) => update.itemId)).size,
    rebuiltTopics: topicStatistics.results.filter((result) => result.status === "synced").length,
  };
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

async function rebindQuestionRow(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  action: Extract<QuestionIndexAction, { kind: "rebind" }>,
): Promise<string> {
  await client.request("/api/transactions", {
    session: "siyuan-damophus",
    app: "siyuan-damophus",
    reqId: Date.now(),
    transactions: [{
      doOperations: [{
        action: "replaceAttrViewBlock",
        avID: binding.questionIndex.avId,
        previousID: action.itemId,
        nextID: action.blockId,
        isDetached: false,
        blockID: binding.questionIndex.blockId,
      }],
    }],
  });
  const reboundItemId = await getQuestionRowItemId(client, binding, action.blockId);
  if (reboundItemId !== action.itemId) {
    throw new Error(`Question '${action.question.id}' rebound to an unexpected Question Index row`);
  }
  return reboundItemId;
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
  return applyQuestionIndexPreview(client, binding, preview);
}

export async function applyQuestionIndexPreview(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  preview: QuestionIndexPreview,
): Promise<QuestionIndexPreview> {
  await repairQuestionBankBinding(client, binding, preview.bindingRepairs);
  if (preview.staleQuestionIds.length > 0) {
    const av = await readAttributeView(client, binding.questionIndex.avId);
    const stale = new Set(preview.staleQuestionIds);
    const itemIds = existingQuestionRows(av, binding)
      .filter((row) => row.questionId && stale.has(row.questionId))
      .map((row) => row.itemId);
    if (itemIds.length > 0) {
      await client.request("/api/av/removeAttributeViewBlocks", {
        avID: binding.questionIndex.avId,
        srcIDs: itemIds,
      });
    }
  }
  const scannedAt = Date.now();
  const results: QuestionIndexWriteResult[] = [];
  const newlyAddedQuestions: Question[] = [];
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
      const itemId = action.kind === "rebind"
        ? await rebindQuestionRow(client, binding, action)
        : await getQuestionRowItemId(client, binding, action.blockId);
      await writeQuestionRow(client, binding, action, itemId, scannedAt);
      if (action.kind === "add") newlyAddedQuestions.push(action.question);
      results.push({ questionId: action.question.id, status: "synced" });
    } catch (error) {
      results.push({
        questionId: action.question.id,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (results.some((result) => result.status === "synced")) {
    const initialTopicAssignments = portableTopicAssignments(newlyAddedQuestions).filter(
      (assignment) => results.some(
        (result) => result.questionId === assignment.questionId && result.status === "synced",
      ),
    );
    if (initialTopicAssignments.length > 0) {
      const topicPreview = await previewTopicRelationSync(
        client,
        binding,
        initialTopicAssignments,
        "merge",
      );
      if (topicPreview.issues.length > 0) {
        throw new Error(`Initial question topic sync is blocked: ${topicPreview.issues.map((issue) => issue.message).join("; ")}`);
      }
      const topicResult = await confirmTopicRelationSync(
        client,
        binding,
        topicPreview.assignments,
        "merge",
        topicPreview.token,
      );
      const topicFailures = topicResult.results.filter((result) => result.status === "failed");
      if (topicFailures.length > 0 || topicResult.issues.length > 0) {
        throw new Error(`Initial question topic sync failed: ${[
          ...topicFailures.map((result) => result.message),
          ...topicResult.issues.map((issue) => issue.message),
        ].filter(Boolean).join("; ")}`);
      }
    }
    const verification = await verifyQuestionBankBinding(client, binding);
    const attemptRelationRepairs = verification.missingManagedKeys.filter(
      (repair) => repair.database === "attemptLog" && repair.field === "question_relation",
    );
    if (attemptRelationRepairs.length > 0) {
      await repairQuestionBankBinding(client, binding, attemptRelationRepairs);
    }
    const restoredTopics = await restoreQuestionTopicRelations(
      client,
      binding,
      results.filter((result) => result.status === "synced").map((result) => result.questionId),
    );
    const recoveryFailures = restoredTopics.issues.filter(
      (issue) => issue.code === "topic-relation-restore-failed",
    );
    if (recoveryFailures.length > 0) {
      throw new Error(`Question topic relation recovery failed: ${recoveryFailures.map((issue) => issue.message).join("; ")}`);
    }
  }
  return {
    ...preview,
    actions: [],
    staleQuestionIds: [],
    bindingRepairs: [],
    ialWriteActions: [],
    results,
  };
}
