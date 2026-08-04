import type { Question, ScanMessage } from "../core/types";
import {
  readAttributeView,
  requireQuestionBankBinding,
  type QuestionBankBinding,
} from "../adapters/siyuan/binding";
import { dateCell, setAttributeViewCell, textCell } from "../adapters/siyuan/cells";
import { getQuestionBlockId, scanSiyuanDocument, type SiyuanDocumentScan } from "../adapters/siyuan/document";
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
}

interface ExistingQuestionRow {
  itemId: string;
  blockId?: string;
  questionId?: string;
}

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

function previewToken(documentId: string, actions: readonly QuestionIndexAction[], stale: readonly string[]): string {
  return hashPreview(JSON.stringify({
    documentId,
    actions: actions.map((action) => ({
      kind: action.kind,
      blockId: action.blockId,
      question: action.question,
    })),
    stale,
  }));
}

export async function previewQuestionIndexSync(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  documentId: string,
): Promise<QuestionIndexPreview> {
  await requireQuestionBankBinding(client, binding);
  const scan = await scanSiyuanDocument(client, documentId);
  const av = await readAttributeView(client, binding.questionIndex.avId);
  const rows = existingQuestionRows(av, binding);
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
    if (sameBlock && sameBlock.questionId !== question.id) {
      blockers.push({
        code: "block-id-reused",
        message: `Block '${blockId}' is already indexed as question '${sameBlock.questionId}'`,
        questionId: question.id,
      });
      continue;
    }
    actions.push({ kind: sameQuestion ? "update" : "add", question, blockId });
  }

  const scannedIds = new Set(scan.report.document.questions.map((question) => question.id));
  const staleQuestionIds = rows
    .map((row) => row.questionId)
    .filter((questionId): questionId is string => Boolean(questionId) && !scannedIds.has(questionId!));
  return {
    token: previewToken(documentId, actions, staleQuestionIds),
    generatedAt: new Date().toISOString(),
    documentId,
    scan,
    actions,
    staleQuestionIds,
    blockers,
  };
}

async function writeQuestionRow(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  action: QuestionIndexAction,
  scannedAt: number,
): Promise<void> {
  const { questionIndex } = binding;
  const metadata = action.question.metadata;
  const values = {
    question_id: textCell(action.question.id),
    question_type: textCell(action.question.type),
    year: textCell(metadata.year),
    subject: textCell(metadata.subject),
    category: textCell(metadata.category),
    collection: textCell(metadata.collection),
    source: textCell(metadata.source),
    topic_id: textCell(metadata.topicId),
    parent_id: textCell(metadata.parentId),
    last_scanned_at: dateCell(scannedAt),
  };
  for (const [field, value] of Object.entries(values)) {
    await setAttributeViewCell(
      client,
      questionIndex.avId,
      questionIndex.keys[field as keyof typeof values],
      action.blockId,
      value,
    );
  }
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
  const additions = preview.actions.filter((action) => action.kind === "add");
  if (additions.length > 0) {
    await client.request("/api/av/addAttributeViewBlocks", {
      avID: binding.questionIndex.avId,
      blockID: binding.questionIndex.blockId,
      viewID: "",
      groupID: "",
      previousID: "",
      srcs: additions.map((action) => ({
        id: action.blockId,
        isDetached: false,
        content: action.question.title,
      })),
      ignoreDefaultFill: true,
    });
  }
  const scannedAt = Date.now();
  for (const action of preview.actions) await writeQuestionRow(client, binding, action, scannedAt);
  return preview;
}
