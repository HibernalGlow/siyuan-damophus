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
import type { QuestionIndexPreview } from "../question-bank/application/indexing";
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
import type { TinyBaseRuntime } from "./tinybase-runtime";

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

function recordMetadata(question: Question): Pick<
  QuestionCatalogRecord,
  "year" | "subject" | "category" | "collection" | "source" | "parent_id"
> {
  return {
    year: question.metadata.year,
    subject: question.metadata.subject,
    category: question.metadata.category,
    collection: question.metadata.collection,
    source: question.metadata.source,
    parent_id: question.metadata.parentId,
  };
}

function topicIds(question: Question): string[] {
  return [...new Set(question.metadata.topicIds ?? (
    question.metadata.topicId ? [question.metadata.topicId] : []
  ))];
}

export class TinyBaseSiyuanCatalogRuntime {
  constructor(
    private readonly runtime: TinyBaseRuntime,
    private readonly client: SiyuanKernelClient,
  ) {}

  private async documentRow(documentId: string): Promise<DocumentRow | undefined> {
    const rows = await this.client.request<DocumentRow[]>("/api/query/sql", {
      stmt: `SELECT id, box, content, path, hpath, updated FROM blocks WHERE id = '${escapeSql(documentId)}' LIMIT 1`,
    });
    return rows[0];
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

  async previewDocument(documentId: string): Promise<QuestionIndexPreview> {
    await this.runtime.ensureReady();
    const [scan, source] = await Promise.all([
      scanSiyuanDocument(this.client, documentId),
      this.documentRow(documentId),
    ]);
    if (!source?.box) throw new Error(`Question source document '${documentId}' is unavailable`);
    const core = this.runtime.warehouse.getReadView().core;
    const byId = new Map(core.getRowIds("questions").flatMap((questionId) => {
      const parsed = QuestionCatalogRecordSchema.safeParse(core.getRow("questions", questionId));
      return parsed.success && parsed.data.document_id === documentId
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
      else if (current.block_id !== blockId || current.content_signature !== signature) {
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
    for (const [id, attrs] of byBlockId) {
      await this.client.request("/api/attr/setBlockAttrs", {id, attrs});
    }
  }

  private async replaceDocumentCatalog(
    scan: SiyuanDocumentScan,
    source: DocumentRow,
    writeIal: boolean,
  ): Promise<void> {
    if (writeIal) await this.writeInferredIal(scan);
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

  private async confirmPreview(preview: QuestionIndexPreview): Promise<QuestionIndexPreview> {
    if (preview.blockers.length > 0) {
      throw new Error(`Question catalog sync is blocked: ${preview.blockers.map((item) => item.message).join("; ")}`);
    }
    const source = await this.documentRow(preview.documentId);
    if (!source?.box) throw new Error(`Question source document '${preview.documentId}' is unavailable`);
    await this.replaceDocumentCatalog(preview.scan, source, true);
    await this.runtime.persistCore();
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

  async previewBatch(documentIds: readonly string[]): Promise<QuestionIndexBatchPreview> {
    const unique = [...new Set(documentIds)];
    const documents = await Promise.all(unique.map((documentId) => this.previewDocument(documentId)));
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
    const documents: QuestionIndexPreview[] = [];
    for (const document of preview.documents) {
      documents.push(await this.confirmPreview(document));
    }
    await this.runtime.persistCore();
    return {...preview, documents};
  }

  private async refreshChangedDocuments(): Promise<void> {
    await this.runtime.ensureReady();
    const repository = this.repositories().read;
    const known = await repository.listDocuments();
    let candidates: Array<{root_id?: string}>;
    try {
      candidates = await this.client.request<Array<{root_id?: string}>>("/api/query/sql", {
        stmt: "SELECT DISTINCT root_id FROM blocks WHERE ial LIKE '%custom-qb-id=%' ORDER BY root_id",
      });
    } catch {
      return;
    }
    const documentIds = new Set([
      ...known.map((document) => document.documentId),
      ...candidates.flatMap((row) => row.root_id ? [row.root_id] : []),
    ]);
    let changed = false;
    for (const documentId of documentIds) {
      const source = await this.documentRow(documentId);
      if (!source?.box) {
        await this.repositories().local.markDocumentUnavailable(documentId);
        changed = true;
        continue;
      }
      const previous = known.find((document) => document.documentId === documentId);
      if (previous?.source_updated_at && previous.source_updated_at === source.updated) continue;
      try {
        const scan = await scanSiyuanDocument(this.client, documentId);
        if (scan.report.conflicts.length > 0 || scan.sourceIssues.length > 0) continue;
        await this.replaceDocumentCatalog(scan, source, false);
        changed = true;
      } catch {
        // Keep the previous validated catalog for this document.
      }
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
        year: question.year,
        subject: question.subject,
        category: question.category,
        collection: question.collection,
        source: question.source,
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
    return (await this.loadCatalog()).map((question) => ({
      questionId: question.questionId,
      title: question.questionTitle,
      questionType: question.questionType,
      subject: question.subject,
      category: question.category,
      year: question.year,
      collection: question.collection,
      topicId: question.topicId,
      source: question.source,
    }));
  }

  async hydrate(questionIds?: readonly string[]): Promise<HydratedQuestionSource> {
    const catalog = await this.loadCatalog();
    const requested = questionIds ? new Set(questionIds) : undefined;
    const selected = catalog.filter((entry) => !requested || requested.has(entry.questionId));
    const documentIds = [...new Set(selected.map((entry) => entry.documentId))];
    const scans = await Promise.all(documentIds.map((documentId) => scanSiyuanDocument(this.client, documentId)));
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
