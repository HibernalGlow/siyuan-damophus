import type { AttemptAggregate, Question, TopicNode } from "../../core/types";
import type { QuestionCatalogEntry } from "../../assembly/types";
import type {
  ExamQuestionSourceProvider,
  ExamSourceSelection,
  ResolvedExamSource,
} from "../../exam/source-provider";
import {
  readAttributeView,
  requireQuestionBankBinding,
  type QuestionBankBinding,
} from "./binding";
import { scanSiyuanDocument } from "./document";
import { questionRowIdentityMaps } from "./row-identity";
import type { AttributeViewValue, RawAttributeView, SiyuanKernelClient } from "./types";

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

export interface QuestionSourceDocument {
  documentId: string;
  notebookId: string;
  title: string;
  path?: string;
  hpath?: string;
  updatedAt?: string;
}

export interface QuestionSourceBlockRow {
  id: string;
  root_id: string;
  box: string;
  path?: string;
  hpath?: string;
  content?: string;
  updated?: string;
}

function valuesByKey(av: RawAttributeView, keyId: string): Map<string, AttributeViewValue> {
  return new Map((av.keyValues.find((entry) => entry.key.id === keyId)?.values ?? [])
    .map((value) => [value.blockID, value]));
}

function rowValue(
  values: ReadonlyMap<string, AttributeViewValue>,
  itemId: string,
  sourceBlockId: string | undefined,
): AttributeViewValue | undefined {
  return values.get(itemId) ?? (sourceBlockId ? values.get(sourceBlockId) : undefined);
}

function textValue(value: AttributeViewValue | undefined): string | undefined {
  const content = value?.mSelect?.[0]?.content ?? value?.text?.content;
  return content === undefined || content === "" ? undefined : content;
}

function yearValue(value: AttributeViewValue | undefined): string | undefined {
  if (value?.number?.isNotEmpty !== false && value?.number?.content !== undefined) {
    return String(value.number.content);
  }
  return textValue(value);
}

function indexedAt(value: AttributeViewValue | undefined): string | undefined {
  const milliseconds = value?.date?.content;
  if (milliseconds === undefined || value.date?.isNotEmpty === false) return undefined;
  return new Date(milliseconds).toISOString();
}

export function buildQuestionSourceCatalog(
  av: RawAttributeView,
  binding: QuestionBankBinding,
  blocks: readonly QuestionSourceBlockRow[],
  aggregates: ReadonlyMap<string, AttemptAggregate> = new Map(),
): QuestionCatalogEntry[] {
  const identities = questionRowIdentityMaps(av, binding.questionIndex.keys.block_id);
  const fields = Object.fromEntries(([
    "question_id",
    "question_type",
    "year",
    "subject",
    "category",
    "collection",
    "source",
    "topic_id",
    "last_scanned_at",
  ] as const).map((field) => [field, valuesByKey(av, binding.questionIndex.keys[field])])) as Record<string, Map<string, AttributeViewValue>>;
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  return identities.rows.flatMap((row) => {
    const blockId = row.sourceBlockId;
    const block = blockId ? blockById.get(blockId) : undefined;
    if (!blockId || !block?.root_id || !block.box) return [];
    const questionId = textValue(rowValue(fields.question_id, row.itemId, blockId));
    const questionType = textValue(rowValue(fields.question_type, row.itemId, blockId));
    if (!questionId || !questionType) return [];
    const aggregate = aggregates.get(questionId);
    return [{
      questionId,
      blockId,
      documentId: block.root_id,
      notebookId: block.box,
      documentPath: block.hpath ?? block.path,
      questionTitle: block.content,
      questionType: questionType as QuestionCatalogEntry["questionType"],
      year: yearValue(rowValue(fields.year, row.itemId, blockId)),
      subject: textValue(rowValue(fields.subject, row.itemId, blockId)),
      category: textValue(rowValue(fields.category, row.itemId, blockId)),
      collection: textValue(rowValue(fields.collection, row.itemId, blockId)),
      source: textValue(rowValue(fields.source, row.itemId, blockId)),
      topicId: textValue(rowValue(fields.topic_id, row.itemId, blockId)),
      indexedAt: indexedAt(rowValue(fields.last_scanned_at, row.itemId, blockId)),
      history: aggregate ? {
        attempts: aggregate.attempts,
        objectiveCorrect: aggregate.objectiveCorrect,
        objectiveIncorrect: aggregate.objectiveIncorrect,
        consecutiveReviewCount: aggregate.consecutiveReviewCount,
        latestRating: aggregate.latestRating,
        lastAnsweredAt: aggregate.lastAnsweredAt,
      } : undefined,
    }];
  });
}

function quoteNodeIds(ids: readonly string[]): string {
  if (ids.some((id) => !nodeIdPattern.test(id))) throw new Error("Question source contains an invalid SiYuan block ID");
  return ids.map((id) => `'${id}'`).join(",");
}

async function readSourceBlocks(
  client: SiyuanKernelClient,
  blockIds: readonly string[],
): Promise<QuestionSourceBlockRow[]> {
  const result: QuestionSourceBlockRow[] = [];
  for (let offset = 0; offset < blockIds.length; offset += 200) {
    const chunk = blockIds.slice(offset, offset + 200);
    if (chunk.length === 0) continue;
    result.push(...await client.request<QuestionSourceBlockRow[]>("/api/query/sql", {
      stmt: `SELECT id, root_id, box, path, hpath, content, updated FROM blocks WHERE id IN (${quoteNodeIds(chunk)})`,
    }));
  }
  return result;
}

export async function listQuestionSourceDocuments(
  client: SiyuanKernelClient,
): Promise<QuestionSourceDocument[]> {
  const rows = await client.request<Array<{
    id: string;
    box: string;
    content?: string;
    path?: string;
    hpath?: string;
    updated?: string;
  }>>("/api/query/sql", {
    stmt: "SELECT id, box, content, path, hpath, updated FROM blocks WHERE type = 'd' ORDER BY box, hpath, id",
  });
  return rows.flatMap((row) => row.id && row.box ? [{
    documentId: row.id,
    notebookId: row.box,
    title: row.content || row.hpath?.split("/").filter(Boolean).at(-1) || row.id,
    path: row.path,
    hpath: row.hpath,
    updatedAt: row.updated,
  }] : []);
}

export async function readQuestionSourceCatalog(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  aggregates: ReadonlyMap<string, AttemptAggregate> = new Map(),
): Promise<QuestionCatalogEntry[]> {
  await requireQuestionBankBinding(client, binding);
  const av = await readAttributeView(client, binding.questionIndex.avId);
  const identities = questionRowIdentityMaps(av, binding.questionIndex.keys.block_id);
  const blockIds = [...new Set(identities.rows.map((row) => row.sourceBlockId).filter(
    (id): id is string => Boolean(id),
  ))];
  const blocks = await readSourceBlocks(client, blockIds);
  return buildQuestionSourceCatalog(av, binding, blocks, aggregates);
}

export interface HydratedQuestionSource {
  questions: Question[];
  topics: TopicNode[];
  blockIdsByQuestionId: ReadonlyMap<string, string>;
  sourceKeys: string[];
}

export async function hydrateQuestionSources(
  client: SiyuanKernelClient,
  catalog: readonly QuestionCatalogEntry[],
  questionIds?: readonly string[],
): Promise<HydratedQuestionSource> {
  const requested = questionIds ? new Set(questionIds) : undefined;
  const selected = catalog.filter((entry) => !requested || requested.has(entry.questionId));
  const documentIds = [...new Set(selected.map((entry) => entry.documentId))];
  const scans = await Promise.all(documentIds.map((documentId) => scanSiyuanDocument(client, documentId)));
  const questionsById = new Map(scans.flatMap((scan) => scan.report.document.questions.map(
    (question) => [question.id, question] as const,
  )));
  const order = questionIds ?? selected.map((entry) => entry.questionId);
  const questions = order.flatMap((questionId) => {
    const question = questionsById.get(questionId);
    return question ? [question] : [];
  });
  const missing = requested ? [...requested].filter((questionId) => !questionsById.has(questionId)) : [];
  if (missing.length > 0) throw new Error(`Question source changed; unavailable questions: ${missing.join(", ")}`);
  const blockIdsByQuestionId = new Map(selected.map((entry) => [entry.questionId, entry.blockId]));
  return {
    questions,
    topics: scans.flatMap((scan) => scan.report.document.topics),
    blockIdsByQuestionId,
    sourceKeys: documentIds,
  };
}

export class SiyuanExamQuestionSourceProvider implements ExamQuestionSourceProvider {
  constructor(
    private readonly client: SiyuanKernelClient,
    private readonly binding: QuestionBankBinding,
  ) {}

  async resolve(selection: ExamSourceSelection): Promise<ResolvedExamSource> {
    const catalog = await readQuestionSourceCatalog(this.client, this.binding);
    const sourceSet = new Set(selection.sourceKeys);
    const scoped = sourceSet.size > 0
      ? catalog.filter((entry) => sourceSet.has(entry.documentId))
      : catalog;
    const hydrated = await hydrateQuestionSources(this.client, scoped, selection.questionIds);
    return hydrated;
  }
}

