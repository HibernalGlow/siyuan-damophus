import type { Question, ScanMessage } from "../question-bank/core/types";
import type { StatisticsQuestion } from "../question-bank/core/statistics";
import { questionContentSignature } from "../question-bank/assembly/fingerprint";
import type { QuestionCatalogEntry } from "../question-bank/assembly";
import {
  getQuestionBlockId,
  scanSiyuanDocument,
  type SiyuanDocumentScan,
} from "../question-bank/adapters/siyuan/document";
import type { SiyuanKernelClient } from "../question-bank/adapters/siyuan/types";
import { TinyBaseCoreCatalogRepository } from "../question-bank/adapters/tinybase/repositories";
import {
  stableQuestionIdMetadata,
  type QuestionIndexPreview,
} from "../question-bank/application/indexing";
import type { QuestionIndexBatchPreview } from "../question-bank/application/batch-indexing";
import type {
  HydratedQuestionSource,
  QuestionSourceDocument,
} from "../question-bank/adapters/siyuan/source-catalog";
import {
  QuestionCatalogRecordSchema,
  type QuestionCatalogRecord,
  type SourceDocumentRecord,
} from "../question-bank/storage/schemas";
import { inferSubjectFromQuestionId, inferTopicSubjectId, resolveTopicSubjectId } from "../question-bank/topic-subjects";
import type { TinyBaseRuntime } from "./tinybase-runtime";

export function mergeQuestionIndexPreviews(
  rootDocumentId: string,
  previews: readonly QuestionIndexPreview[],
  token: string,
  batchBlockers: readonly ScanMessage[] = [],
): QuestionIndexPreview {
  const first = previews[0];
  if (!first) throw new Error("Question source document tree is empty");
  const questions = previews.flatMap((preview) => preview.scan.report.document.questions);
  const topics = previews.flatMap((preview) => preview.scan.report.document.topics);
  const groups = previews.flatMap((preview) => preview.scan.report.document.groups);
  const blockIdsByQuestionId = new Map(previews.flatMap((preview) => [...preview.scan.blockIdsByQuestionId]));
  const topicBlockIdsByTopicId = new Map(previews.flatMap((preview) => [...preview.scan.topicBlockIdsByTopicId]));
  const scans: SiyuanDocumentScan[] = previews.map((preview) => preview.scan);
  return {
    token,
    generatedAt: new Date().toISOString(),
    documentId: rootDocumentId,
    scan: {
      documentId: rootDocumentId,
      kramdown: scans.map((scan) => scan.kramdown).join("\n\n"),
      report: {
        document: { questions, topics, groups },
        inferences: previews.flatMap((preview) => preview.scan.report.inferences),
        issues: previews.flatMap((preview) => preview.scan.report.issues),
        conflicts: previews.flatMap((preview) => preview.scan.report.conflicts),
        ialUpdates: previews.flatMap((preview) => preview.scan.report.ialUpdates),
      },
      blockIdsByQuestionId,
      topicBlockIdsByTopicId,
      ialWriteActions: previews.flatMap((preview) => preview.scan.ialWriteActions),
      sourceIssues: previews.flatMap((preview) => preview.scan.sourceIssues),
    },
    actions: previews.flatMap((preview) => preview.actions),
    staleQuestionIds: previews.flatMap((preview) => preview.staleQuestionIds),
    blockers: [...batchBlockers, ...previews.flatMap((preview) => preview.blockers)],
    bindingRepairs: previews.flatMap((preview) => preview.bindingRepairs),
    ialWriteActions: previews.flatMap((preview) => preview.ialWriteActions),
    results: previews.flatMap((preview) => preview.results),
  };
}

interface DocumentRow {
  id: string;
  box: string;
  content?: string;
  path?: string;
  hpath?: string;
  updated?: string;
}

function previewHash(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function escapeSql(value: string): string {
  return value.replace(/'/gu, "''");
}

/**
 * Repairs subject values stored by older versions: canonicalizes known aliases
 * ("administrative law" -> "administrative") and falls back to question-ID
 * inference when nothing usable was stored.
 */
function resolvedCatalogSubject(questionId: string, stored: string | undefined): string | undefined {
  const normalized = resolveTopicSubjectId(stored);
  if (normalized) return normalized;
  if (stored?.trim()) return stored;
  return inferSubjectFromQuestionId(questionId);
}

function recordMetadata(question: Question): Pick<
  QuestionCatalogRecord,
  "year" | "subject" | "category" | "collection" | "source" | "parent_id"
> {
  const metadata = sourceMetadataWithIdFallback(question.id, question.metadata);
  const primaryTopicId = question.metadata.topicIds?.[0] ?? question.metadata.topicId;
  const rawSubject = question.metadata.subject;
  const canonicalSubject = rawSubject?.trim() ? (resolveTopicSubjectId(rawSubject) ?? rawSubject.trim()) : undefined;
  const inferredSubject = canonicalSubject
    ?? (primaryTopicId ? inferTopicSubjectId(primaryTopicId) : undefined)
    ?? inferSubjectFromQuestionId(question.id);
  const rawCategory = question.metadata.category;
  const resolvedCategory = (rawCategory && rawCategory !== "gold") ? rawCategory : (rawCategory || primaryTopicId);
  return {
    year: metadata.year,
    subject: inferredSubject,
    category: resolvedCategory,
    collection: metadata.collection,
    source: metadata.source,
    parent_id: question.metadata.parentId,
  };
}

function catalogMetadataChanged(current: QuestionCatalogRecord, question: Question): boolean {
  const next = recordMetadata(question);
  return current.question_type !== question.type
    || current.title !== question.title
    || current.year !== next.year
    || current.subject !== next.subject
    || current.category !== next.category
    || current.collection !== next.collection
    || current.source !== next.source
    || current.parent_id !== next.parent_id;
}

function sourceMetadataWithIdFallback(
  questionId: string,
  metadata: Pick<Question["metadata"], "year" | "collection" | "source">,
): Pick<Question["metadata"], "year" | "collection" | "source"> {
  const inferred = stableQuestionIdMetadata(questionId);
  return {
    year: metadata.year || inferred.year,
    collection: metadata.collection || inferred.collection,
    source: metadata.source || inferred.source,
  };
}

function topicIds(question: Question): string[] {
  return [...new Set(question.metadata.topicIds ?? (
    question.metadata.topicId ? [question.metadata.topicId] : []
  ))];
}

/** Auto-discovery of qb-id documents runs a full-table IAL LIKE scan; throttle it. */
const CATALOG_DISCOVERY_INTERVAL_MS = 60_000;
let catalogDiscoveryAt = 0;

export class TinyBaseSiyuanCatalogRuntime {
  private static readonly SCAN_CACHE_LIMIT = 32;
  private readonly scanCache = new Map<string, { updated?: string; scan: SiyuanDocumentScan }>();
  private readonly writeQueue: Array<() => void> = [];
  private activeWrites = 0;

  constructor(
    private readonly runtime: TinyBaseRuntime,
    private readonly client: SiyuanKernelClient,
  ) {}

  /**
   * Reuses a document scan while the kernel `updated` timestamp is unchanged,
   * so preview, confirm and hydrate do not re-download and re-parse the same
   * kramdown. Entries are dropped whenever a document is rescanned or when IAL
   * writes mutate the source, so a stale cache can never outlive its document.
   */
  private async cachedScan(documentId: string, updated?: string): Promise<SiyuanDocumentScan> {
    const cached = this.scanCache.get(documentId);
    if (cached && updated !== undefined && cached.updated === updated) return cached.scan;
    const scan = await scanSiyuanDocument(this.client, documentId);
    this.scanCache.delete(documentId);
    this.scanCache.set(documentId, { updated, scan });
    if (this.scanCache.size > TinyBaseSiyuanCatalogRuntime.SCAN_CACHE_LIMIT) {
      const oldest = this.scanCache.keys().next().value;
      if (oldest !== undefined) this.scanCache.delete(oldest);
    }
    return scan;
  }

  /** Bounds concurrent kernel writes; first-time indexing fires one IAL write per question. */
  private scheduleWrite<T>(operation: () => Promise<T>): Promise<T> {
    if (this.activeWrites >= 8) {
      return new Promise<void>((resolve) => {
        this.writeQueue.push(() => resolve());
      }).then(() => this.runWrite(operation));
    }
    return this.runWrite(operation);
  }

  private async runWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.activeWrites += 1;
    try {
      return await operation();
    } finally {
      this.activeWrites -= 1;
      this.writeQueue.shift()?.();
    }
  }

  private async documentRow(documentId: string): Promise<DocumentRow | undefined> {
    const rows = await this.client.request<DocumentRow[]>("/api/query/sql", {
      stmt: `SELECT id, box, content, path, hpath, updated FROM blocks WHERE id = '${escapeSql(documentId)}' LIMIT 1`,
    });
    return rows[0];
  }

  async listDocumentTreeRows(documentId: string): Promise<DocumentRow[]> {
    const source = await this.documentRow(documentId);
    if (!source?.box || !source.hpath) {
      if (!source) throw new Error(`Question source document '${documentId}' is unavailable`);
      return [source];
    }
    const prefix = `${source.hpath.replace(/\/+$/u, "")}/%`;
    const rows = await this.client.request<DocumentRow[]>("/api/query/sql", {
      stmt: `SELECT id, box, content, path, hpath, updated FROM blocks WHERE type = 'd' AND box = '${escapeSql(source.box)}' `
        + `AND (hpath = '${escapeSql(source.hpath)}' OR hpath LIKE '${escapeSql(prefix)}') ORDER BY hpath, id`,
    });
    const byId = new Map((rows ?? []).filter((row) => row.id).map((row) => [row.id, row]));
    byId.delete(documentId);
    return [source, ...byId.values()];
  }

  async listDocumentTreeIds(documentId: string): Promise<string[]> {
    return (await this.listDocumentTreeRows(documentId)).map((row) => row.id);
  }

  async listSourceDocuments(): Promise<QuestionSourceDocument[]> {
    const rows = await this.client.request<DocumentRow[]>("/api/query/sql", {
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

  private repositories() {
    return {
      local: new TinyBaseCoreCatalogRepository(this.runtime.warehouse.getLocalContribution().core),
      read: new TinyBaseCoreCatalogRepository(this.runtime.warehouse.getReadView().core),
    };
  }

  async previewDocument(documentId: string, sourceOverride?: DocumentRow): Promise<QuestionIndexPreview> {
    await this.runtime.ensureReady();
    const source = sourceOverride ?? await this.documentRow(documentId);
    if (!source?.box) throw new Error(`Question source document '${documentId}' is unavailable`);
    const scan = await this.cachedScan(documentId, source.updated);
    const core = this.runtime.warehouse.getReadView().core;
    const byId = new Map(core.getRowIds("questions").flatMap((questionId) => {
      if (core.getCell("questions", questionId, "document_id") !== documentId) return [];
      const parsed = QuestionCatalogRecordSchema.safeParse(core.getRow("questions", questionId));
      return parsed.success
        ? [[questionId, parsed.data as QuestionCatalogRecord] as const]
        : [];
    }));
    const blockers = [...scan.report.conflicts, ...scan.sourceIssues];
    const actions: QuestionIndexPreview["actions"] = [];
    for (const question of scan.report.document.questions) {
      const blockId = getQuestionBlockId(scan, question);
      if (!blockId) {
        blockers.push({
          code: "missing-siyuan-block-binding",
          message: `Question '${question.id}' has no stable SiYuan source block`,
          questionId: question.id,
        });
        continue;
      }
      const current = byId.get(question.id);
      const signature = questionContentSignature(question);
      if (!current) actions.push({kind: "add", question, blockId});
      else if (current.block_id !== blockId || current.content_signature !== signature || catalogMetadataChanged(current, question)) {
        actions.push({kind: "update", question, blockId});
      }
    }
    const scannedIds = new Set(scan.report.document.questions.map((question) => question.id));
    const staleQuestionIds = [...byId.keys()].filter((questionId) => !scannedIds.has(questionId));
    const ialWriteActions = scan.ialWriteActions;
    const token = previewHash({
      documentId,
      sourceUpdatedAt: source.updated,
      actions: actions.map((action) => [action.kind, action.question.id, action.blockId]),
      staleQuestionIds,
      blockers,
      ialWriteActions,
    });
    return {
      token,
      generatedAt: new Date().toISOString(),
      documentId,
      scan,
      actions,
      staleQuestionIds,
      blockers,
      bindingRepairs: [],
      ialWriteActions,
      results: [],
    };
  }

  async previewDocumentTree(documentId: string): Promise<QuestionIndexPreview> {
    const sourceRows = await this.listDocumentTreeRows(documentId);
    const documentIds = sourceRows.map((row) => row.id);
    if (documentIds.length <= 1) return this.previewDocument(documentId, sourceRows[0]);
    const batch = await this.previewBatch(documentIds, new Map(sourceRows.map((row) => [row.id, row])));
    return mergeQuestionIndexPreviews(documentId, batch.documents, batch.token, batch.blockers);
  }

  private async writeInferredIal(scan: SiyuanDocumentScan): Promise<void> {
    const byBlockId = new Map<string, Record<string, string>>();
    for (const action of scan.ialWriteActions) {
      if (Object.keys(action.attributes).some((key) => !key.startsWith("custom-qb-"))) {
        throw new Error(`Refusing to write non-question-bank attributes to block '${action.blockId}'`);
      }
      byBlockId.set(action.blockId, {
        ...(byBlockId.get(action.blockId) ?? {}),
        ...action.attributes,
      });
    }
    await Promise.all([...byBlockId].map(([id, attrs]) => (
      this.scheduleWrite(() => this.client.request("/api/attr/setBlockAttrs", {id, attrs}))
    )));
  }

  private async replaceDocumentCatalog(
    scan: SiyuanDocumentScan,
    source: DocumentRow,
    writeIal: boolean,
  ): Promise<void> {
    if (writeIal) {
      await this.writeInferredIal(scan);
      // The written IAL (notably custom-qb-id) changes future scans of this
      // document even when the kernel `updated` timestamp does not move.
      this.scanCache.delete(scan.documentId);
    }
    const repository = this.repositories().local;
    await repository.markDocumentUnavailable(scan.documentId);
    const indexedAt = new Date().toISOString();
    for (const question of scan.report.document.questions) {
      const blockId = getQuestionBlockId(scan, question);
      if (!blockId) continue;
      if (!writeIal && scan.ialWriteActions.some((action) => action.questionId === question.id)) continue;
      await repository.upsertQuestion(question.id, {
        block_id: blockId,
        document_id: scan.documentId,
        notebook_id: source.box,
        question_type: question.type,
        title: question.title,
        ...recordMetadata(question),
        content_signature: questionContentSignature(question),
        indexed_at: indexedAt,
        available: true,
      });
    }
    await repository.replaceQuestionTopics(
      scan.documentId,
      scan.report.document.questions.flatMap((question) => topicIds(question).map((topicId) => ({
        question_id: question.id,
        topic_id: topicId,
        document_id: scan.documentId,
      }))),
    );
    for (const topic of scan.report.document.topics) {
      if (!topic.explicit) continue;
      const blockId = scan.topicBlockIdsByTopicId.get(topic.id);
      if (!blockId) continue;
      await repository.upsertAnchor(blockId, {
        topic_id: topic.id,
        document_id: scan.documentId,
        notebook_id: source.box,
        title: topic.title,
        path: source.path,
        hpath: source.hpath,
        source_updated_at: source.updated,
        available: true,
      });
    }
    const issueCount = scan.report.issues.length + scan.report.conflicts.length + scan.sourceIssues.length;
    const document: SourceDocumentRecord = {
      notebook_id: source.box,
      title: source.content || source.hpath?.split("/").filter(Boolean).at(-1) || source.id,
      path: source.path,
      hpath: source.hpath,
      source_updated_at: source.updated,
      content_signature: previewHash(scan.kramdown),
      scan_status: issueCount === 0 ? "valid" : "partial",
      issue_count: issueCount,
      indexed_at: indexedAt,
    };
    await repository.upsertDocument(scan.documentId, document);
    this.runtime.warehouse.getLocalContribution().core.setValue("last_catalog_scan_at", indexedAt);
  }

  private async confirmPreview(preview: QuestionIndexPreview, persist = true): Promise<QuestionIndexPreview> {
    if (preview.blockers.length > 0) {
      throw new Error(`Question catalog sync is blocked: ${preview.blockers.map((item) => item.message).join("; ")}`);
    }
    const source = await this.documentRow(preview.documentId);
    if (!source?.box) throw new Error(`Question source document '${preview.documentId}' is unavailable`);
    await this.replaceDocumentCatalog(preview.scan, source, true);
    if (persist) await this.runtime.persistCore();
    return {
      ...preview,
      actions: [],
      staleQuestionIds: [],
      ialWriteActions: [],
      results: preview.scan.report.document.questions.map((question) => ({
        questionId: question.id,
        status: "synced" as const,
      })),
    };
  }

  async confirmDocument(documentId: string, expectedToken: string): Promise<QuestionIndexPreview> {
    const preview = await this.previewDocument(documentId);
    if (preview.token !== expectedToken) {
      throw new Error("Question catalog preview is stale; scan again before confirming");
    }
    return this.confirmPreview(preview);
  }

  async confirmDocumentTree(documentId: string, expectedToken: string): Promise<QuestionIndexPreview> {
    const documentIds = await this.listDocumentTreeIds(documentId);
    if (documentIds.length <= 1) return this.confirmDocument(documentId, expectedToken);
    const batch = await this.confirmBatch(documentIds, expectedToken);
    return mergeQuestionIndexPreviews(documentId, batch.documents, batch.token, batch.blockers);
  }

  async previewBatch(
    documentIds: readonly string[],
    sourceRowsById?: ReadonlyMap<string, DocumentRow>,
  ): Promise<QuestionIndexBatchPreview> {
    const unique = [...new Set(documentIds)];
    const documents = await Promise.all(unique.map((documentId) => this.previewDocument(documentId, sourceRowsById?.get(documentId))));
    const byQuestionId = new Map<string, Array<{documentId: string; signature: string}>>();
    for (const document of documents) {
      for (const question of document.scan.report.document.questions) {
        byQuestionId.set(question.id, [...(byQuestionId.get(question.id) ?? []), {
          documentId: document.documentId,
          signature: questionContentSignature(question),
        }]);
      }
    }
    const blockers: ScanMessage[] = [];
    for (const [questionId, occurrences] of byQuestionId) {
      if (new Set(occurrences.map((item) => item.documentId)).size < 2) continue;
      blockers.push({
        code: "batch-question-id-conflict",
        message: `Question '${questionId}' occurs in multiple source documents`,
        questionId,
      });
    }
    return {
      token: previewHash({documents: documents.map((item) => item.token), blockers}),
      generatedAt: new Date().toISOString(),
      documentIds: unique,
      documents,
      aliases: [],
      blockers,
    };
  }

  async confirmBatch(documentIds: readonly string[], expectedToken: string): Promise<QuestionIndexBatchPreview> {
    const preview = await this.previewBatch(documentIds);
    if (preview.token !== expectedToken) {
      throw new Error("Question catalog batch preview is stale; scan again before confirming");
    }
    if (preview.blockers.length > 0 || preview.documents.some((document) => document.blockers.length > 0)) {
      throw new Error("Question catalog batch sync is blocked");
    }
    // Documents are independent; confirming them in parallel keeps multi-document
    // trees from paying serial IAL-write latency per document.
    const documents = await Promise.all(preview.documents.map((document) => (
      this.confirmPreview(document, false)
    )));
    await this.runtime.persistCore();
    return {...preview, documents};
  }

  private async refreshChangedDocuments(): Promise<void> {
    await this.runtime.ensureReady();
    const repository = this.repositories().read;
    const metadataRevision = "3";
    const needsMetadataRefresh = this.runtime.warehouse.getLocalContribution().core.getValue("catalog_metadata_revision") !== metadataRevision;
    const known = await repository.listDocuments();
    let candidates: Array<{root_id?: string}>;
    const now = Date.now();
    if (now - catalogDiscoveryAt < CATALOG_DISCOVERY_INTERVAL_MS) {
      candidates = [];
    } else {
      try {
        candidates = await this.client.request<Array<{root_id?: string}>>("/api/query/sql", {
          stmt: "SELECT DISTINCT root_id FROM blocks WHERE ial LIKE '%custom-qb-id=%' ORDER BY root_id",
        });
        catalogDiscoveryAt = now;
      } catch {
        return;
      }
    }
    const documentIds = new Set([
      ...known.map((document) => document.documentId),
      ...candidates.flatMap((row) => row.root_id ? [row.root_id] : []),
    ]);
    if (documentIds.size === 0) return;

    let rowsById = new Map<string, DocumentRow>();
    try {
      const idList = [...documentIds].map((id) => `'${escapeSql(id)}'`).join(", ");
      const documentRows = await this.client.request<DocumentRow[]>("/api/query/sql", {
        stmt: `SELECT id, box, content, path, hpath, updated FROM blocks WHERE id IN (${idList})`,
      });
      rowsById = new Map((documentRows ?? []).map((row) => [row.id, row]));
    } catch {
      // Fall back to per-document query if batch query fails
    }

    let changed = false;
    for (const documentId of documentIds) {
      const source = rowsById.get(documentId) ?? await this.documentRow(documentId);
      if (!source?.box) {
        await this.repositories().local.markDocumentUnavailable(documentId);
        changed = true;
        continue;
      }
      const previous = known.find((document) => document.documentId === documentId);
      if (!needsMetadataRefresh && previous?.source_updated_at && previous.source_updated_at === source.updated) continue;
      try {
        const scan = await this.cachedScan(documentId, source.updated);
        if (scan.report.conflicts.length > 0 || scan.sourceIssues.length > 0) continue;
        await this.replaceDocumentCatalog(scan, source, false);
        changed = true;
      } catch {
        // Keep the previous validated catalog for this document.
      }
    }
    if (needsMetadataRefresh) {
      this.runtime.warehouse.getLocalContribution().core.setValue("catalog_metadata_revision", metadataRevision);
      changed = true;
    }
    if (changed) await this.runtime.persistCore();
  }

  async loadCatalog(): Promise<QuestionCatalogEntry[]> {
    await this.refreshChangedDocuments();
    const {read} = this.repositories();
    const [documents, aggregates, topics] = await Promise.all([
      read.listDocuments(),
      this.runtime.loadAggregates(),
      read.listQuestionTopics(),
    ]);
    const documentsById = new Map(documents.map((document) => [document.documentId, document]));
    const core = this.runtime.warehouse.getReadView().core;
    return core.getRowIds("questions").flatMap((questionId) => {
      const parsed = QuestionCatalogRecordSchema.safeParse(core.getRow("questions", questionId));
      if (!parsed.success || !parsed.data.available) return [];
      const question = parsed.data as QuestionCatalogRecord;
      const metadata = sourceMetadataWithIdFallback(questionId, question);
      const document = documentsById.get(question.document_id);
      const aggregate = aggregates.get(questionId);
      const topicId = topics.find((topic) => topic.question_id === questionId)?.topic_id;
      return [{
        questionId,
        blockId: question.block_id,
        documentId: question.document_id,
        notebookId: question.notebook_id,
        documentTitle: document?.title,
        documentPath: document?.hpath ?? document?.path,
        questionTitle: question.title,
        questionType: question.question_type,
        year: metadata.year,
        subject: resolvedCatalogSubject(questionId, question.subject),
        category: question.category,
        collection: metadata.collection,
        source: metadata.source,
        topicId,
        contentSignature: question.content_signature,
        indexedAt: question.indexed_at,
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

  async loadStatisticsQuestions(): Promise<StatisticsQuestion[]> {
    const core = this.runtime.warehouse.getReadView().core;
    const rows = core.getTable("questions");
    const result: StatisticsQuestion[] = [];
    for (const [questionId, raw] of Object.entries(rows)) {
      if (!raw || raw.available === 0 || raw.available === false) continue;
      const question = raw as unknown as QuestionCatalogRecord;
      const metadata = sourceMetadataWithIdFallback(questionId, question);
      result.push({
        questionId,
        title: question.title,
        questionType: question.question_type,
        subject: resolvedCatalogSubject(questionId, question.subject),
        category: question.category,
        year: metadata.year,
        collection: metadata.collection,
        topicId: undefined,
        source: metadata.source,
      });
    }
    return result;
  }

  async hydrate(questionIds?: readonly string[]): Promise<HydratedQuestionSource> {
    const catalog = await this.loadCatalog();
    const requested = questionIds ? new Set(questionIds) : undefined;
    const selected = catalog.filter((entry) => !requested || requested.has(entry.questionId));
    const documentIds = [...new Set(selected.map((entry) => entry.documentId))];
    // Fetch row metadata first so cached scans can be validated against the
    // kernel `updated` timestamp instead of re-downloading every document.
    const rows = await Promise.all(documentIds.map((documentId) => this.documentRow(documentId)));
    const updatedById = new Map(rows.flatMap((row) => (
      row?.id ? [[row.id, row.updated] as const] : []
    )));
    const scans = await Promise.all(documentIds.map((documentId) => (
      this.cachedScan(documentId, updatedById.get(documentId))
    )));
    const questionsById = new Map(scans.flatMap((scan) => scan.report.document.questions.map(
      (question) => [question.id, question] as const,
    )));
    const order = questionIds ?? selected.map((entry) => entry.questionId);
    const questions = order.flatMap((questionId) => {
      const question = questionsById.get(questionId);
      return question ? [question] : [];
    });
    const missing = requested ? [...requested].filter((questionId) => !questionsById.has(questionId)) : [];
    if (missing.length > 0) {
      throw new Error(`Question source changed; unavailable questions: ${missing.join(", ")}`);
    }
    return {
      questions,
      topics: scans.flatMap((scan) => scan.report.document.topics),
      blockIdsByQuestionId: new Map(selected.map((entry) => [entry.questionId, entry.blockId])),
      sourceKeys: documentIds,
    };
  }
}
