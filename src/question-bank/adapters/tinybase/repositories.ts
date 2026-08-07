import type { Cell, MergeableStore } from "tinybase";
import {
  AttemptEventSchema,
  ExamSummaryEventSchema,
} from "../../core/schema";
import { aggregateAttemptEvents } from "../../core/attempts";
import type { AttemptEvent, ExamSummaryEvent } from "../../core/types";
import {
  parsePracticeSessionSnapshot,
  PracticeSessionSnapshotSchema,
  type PracticeSessionSnapshot,
  type PracticeSessionSnapshotParseResult,
} from "../../core/session-schema";
import { ExamSessionSnapshotSchema, type ExamSessionSnapshot } from "../../exam/schema";
import { QuestionSetBlueprintSchema, type QuestionSetBlueprint } from "../../assembly/schema";
import {
  QuestionAggregateRecordSchema,
  QuestionCatalogRecordSchema,
  QuestionTopicRecordSchema,
  SourceDocumentRecordSchema,
  TopicAnchorRecordSchema,
  type QuestionAggregateRecord,
  type QuestionCatalogRecord,
  type QuestionTopicRecord,
  type SourceDocumentRecord,
  type TopicAnchorRecord,
} from "../../storage/schemas";
import type {
  AggregateRepository,
  AttemptEventRepository,
  CoreCatalogRepository,
  ExamEventRepository,
  ExamSessionRepository,
  QuestionSetBlueprintRepository,
  PracticeSessionRepository,
} from "../../storage/contracts";
import { canonicalJson } from "../../storage/canonical-json";
import { createDamophusStore, TABLE } from "./tables";
import type { ShardRouter } from "./shard-router";

type ScalarRow = Record<string, string | number | boolean>;

function compactRow(value: Record<string, unknown>): ScalarRow {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | number | boolean] => (
    ["string", "number", "boolean"].includes(typeof entry[1])
  )));
}

function rowObject(store: MergeableStore, tableId: string, rowId: string): Record<string, Cell> {
  return store.getRow(tableId, rowId) as Record<string, Cell>;
}

function rows(store: MergeableStore, tableId: string): Array<[string, Record<string, Cell>]> {
  return store.getRowIds(tableId).map((rowId) => [rowId, rowObject(store, tableId, rowId)]);
}

function jsonArray(value: Cell | undefined): string[] {
  if (typeof value !== "string") return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Stored event array is invalid");
  }
  return parsed;
}

function optionalNumber(value: Cell | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function optionalString(value: Cell | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function eventRow(event: AttemptEvent): ScalarRow {
  return compactRow({
    ...event,
    option_order: canonicalJson(event.option_order),
    selected_option_ids: canonicalJson(event.selected_option_ids),
    objective_correct: event.objective_correct === null ? "null" : String(event.objective_correct),
  });
}

function materializeAttempt(row: Record<string, Cell>): AttemptEvent {
  const objective = row.objective_correct;
  return AttemptEventSchema.parse({
    schema_version: row.schema_version,
    event_kind: row.event_kind,
    attempt_id: row.attempt_id,
    question_id: row.question_id,
    question_relation: optionalString(row.question_relation),
    session_id: row.session_id,
    answered_at: row.answered_at,
    question_type: row.question_type,
    option_order: jsonArray(row.option_order),
    selected_option_ids: jsonArray(row.selected_option_ids),
    objective_correct: objective === "null" ? null : objective === "true" ? true : objective === "false" ? false : undefined,
    mastery_rating: row.mastery_rating,
    session_mode: row.session_mode,
    rating_source: row.rating_source,
    subjective_score: optionalNumber(row.subjective_score),
    duration_ms: optionalNumber(row.duration_ms),
  }) as AttemptEvent;
}

function materializeExamEvent(row: Record<string, Cell>): ExamSummaryEvent {
  return ExamSummaryEventSchema.parse({
    schema_version: row.schema_version,
    event_kind: row.event_kind,
    attempt_id: row.attempt_id,
    session_id: row.session_id,
    answered_at: row.answered_at,
    session_mode: row.session_mode,
    exam_status: row.exam_status,
    exam_score: optionalNumber(row.exam_score),
    exam_max_score: optionalNumber(row.exam_max_score),
    exam_duration_ms: optionalNumber(row.exam_duration_ms),
    exam_payload: row.exam_payload,
  }) as ExamSummaryEvent;
}

function topicRowId(questionId: string, topicId: string): string {
  return `${encodeURIComponent(questionId)}~${encodeURIComponent(topicId)}`;
}

export class TinyBaseCoreCatalogRepository implements CoreCatalogRepository {
  constructor(
    private readonly coreStore: MergeableStore,
    private readonly hydrateSource: (questionIds?: readonly string[]) => Promise<unknown> = async () => undefined,
  ) {}

  store(): MergeableStore {
    return this.coreStore;
  }

  async listDocuments(): Promise<Array<SourceDocumentRecord & {documentId: string}>> {
    return rows(this.coreStore, TABLE.sourceDocuments).map(([documentId, row]) => ({
      documentId,
      ...SourceDocumentRecordSchema.parse(row),
    }));
  }

  async upsertDocument(id: string, document: SourceDocumentRecord): Promise<void> {
    this.coreStore.setRow(TABLE.sourceDocuments, id, compactRow(SourceDocumentRecordSchema.parse(document)));
  }

  async listQuestions(filters: Partial<QuestionCatalogRecord> = {}): Promise<QuestionCatalogRecord[]> {
    return rows(this.coreStore, TABLE.questions)
      .map(([, row]) => QuestionCatalogRecordSchema.parse(row))
      .filter((question) => Object.entries(filters).every(([key, value]) => (
        question[key as keyof QuestionCatalogRecord] === value
      )));
  }

  async upsertQuestion(id: string, question: QuestionCatalogRecord): Promise<void> {
    this.coreStore.setRow(TABLE.questions, id, compactRow(QuestionCatalogRecordSchema.parse(question)));
  }

  async listQuestionTopics(questionId?: string): Promise<QuestionTopicRecord[]> {
    return rows(this.coreStore, TABLE.questionTopics)
      .map(([, row]) => QuestionTopicRecordSchema.parse(row))
      .filter((topic) => !questionId || topic.question_id === questionId);
  }

  async replaceQuestionTopics(documentId: string, topics: readonly QuestionTopicRecord[]): Promise<void> {
    for (const [rowId, row] of rows(this.coreStore, TABLE.questionTopics)) {
      if (row.document_id === documentId) this.coreStore.delRow(TABLE.questionTopics, rowId);
    }
    for (const topic of topics) {
      const parsed = QuestionTopicRecordSchema.parse(topic);
      if (parsed.document_id !== documentId) throw new Error("Question topic document identity mismatch");
      this.coreStore.setRow(TABLE.questionTopics, topicRowId(parsed.question_id, parsed.topic_id), compactRow(parsed));
    }
  }

  async listAnchors(topicId?: string): Promise<TopicAnchorRecord[]> {
    return rows(this.coreStore, TABLE.topicAnchors)
      .map(([, row]) => TopicAnchorRecordSchema.parse(row))
      .filter((anchor) => !topicId || anchor.topic_id === topicId);
  }

  async upsertAnchor(id: string, anchor: TopicAnchorRecord): Promise<void> {
    this.coreStore.setRow(TABLE.topicAnchors, id, compactRow(TopicAnchorRecordSchema.parse(anchor)));
  }

  async markDocumentUnavailable(documentId: string): Promise<void> {
    for (const [rowId, row] of rows(this.coreStore, TABLE.questions)) {
      if (row.document_id === documentId) this.coreStore.setCell(TABLE.questions, rowId, "available", false);
    }
    for (const [rowId, row] of rows(this.coreStore, TABLE.topicAnchors)) {
      if (row.document_id === documentId) this.coreStore.setCell(TABLE.topicAnchors, rowId, "available", false);
    }
  }

  hydrate(questionIds?: readonly string[]): Promise<unknown> {
    return this.hydrateSource(questionIds);
  }
}

interface ImportResult {
  created: number;
  duplicates: number;
  conflicts: string[];
}

abstract class TinyBaseImmutableEventRepository<Event extends {attempt_id: string; answered_at: string}> {
  constructor(
    protected readonly eventStores: Map<string, MergeableStore>,
    protected readonly router: ShardRouter,
    private readonly tableId: string,
  ) {}

  protected abstract parse(value: unknown): Event;
  protected abstract toRow(value: Event): ScalarRow;
  protected abstract fromRow(value: Record<string, Cell>): Event;

  protected all(): Event[] {
    return [...this.eventStores.values()].flatMap((store) => (
      rows(store, this.tableId).map(([, row]) => this.fromRow(row))
    )).sort((left, right) => left.answered_at.localeCompare(right.answered_at));
  }

  async appendEvent(value: Event): Promise<"created" | "duplicate"> {
    const event = this.parse(value);
    const existing = this.all().find((item) => item.attempt_id === event.attempt_id);
    if (existing) {
      if (canonicalJson(existing) !== canonicalJson(event)) {
        throw new Error(`Immutable event conflict for '${event.attempt_id}'`);
      }
      return "duplicate";
    }
    const shardId = this.router.routeAttempt(event.answered_at);
    const store = this.eventStores.get(shardId) ?? createDamophusStore(`events:${shardId}`);
    this.eventStores.set(shardId, store);
    store.setRow(this.tableId, event.attempt_id, this.toRow(event));
    return "created";
  }

  async importEvents(values: readonly Event[]): Promise<ImportResult> {
    const result: ImportResult = {created: 0, duplicates: 0, conflicts: []};
    for (const value of values) {
      try {
        const status = await this.appendEvent(value);
        result[status === "created" ? "created" : "duplicates"] += 1;
      } catch (error) {
        result.conflicts.push(error instanceof Error ? error.message : String(error));
      }
    }
    return result;
  }
}

export class TinyBaseAttemptEventRepository
  extends TinyBaseImmutableEventRepository<AttemptEvent>
  implements AttemptEventRepository {
  constructor(stores: Map<string, MergeableStore>, router: ShardRouter) {
    super(stores, router, TABLE.attemptEvents);
  }
  protected parse(value: unknown): AttemptEvent { return AttemptEventSchema.parse(value) as AttemptEvent; }
  protected toRow(value: AttemptEvent): ScalarRow { return eventRow(value); }
  protected fromRow(value: Record<string, Cell>): AttemptEvent { return materializeAttempt(value); }
  append(event: AttemptEvent): Promise<"created" | "duplicate"> { return this.appendEvent(event); }
  async list(): Promise<AttemptEvent[]> { return this.all(); }
  import(events: readonly AttemptEvent[]): Promise<ImportResult> { return this.importEvents(events); }
  export(): Promise<AttemptEvent[]> { return this.list(); }
}

export class TinyBaseExamEventRepository
  extends TinyBaseImmutableEventRepository<ExamSummaryEvent>
  implements ExamEventRepository {
  constructor(stores: Map<string, MergeableStore>, router: ShardRouter) {
    super(stores, router, TABLE.examEvents);
  }
  protected parse(value: unknown): ExamSummaryEvent { return ExamSummaryEventSchema.parse(value) as ExamSummaryEvent; }
  protected toRow(value: ExamSummaryEvent): ScalarRow { return compactRow({...value}); }
  protected fromRow(value: Record<string, Cell>): ExamSummaryEvent { return materializeExamEvent(value); }
  append(event: ExamSummaryEvent): Promise<"created" | "duplicate"> { return this.appendEvent(event); }
  async list(): Promise<ExamSummaryEvent[]> { return this.all(); }
  import(events: readonly ExamSummaryEvent[]): Promise<ImportResult> { return this.importEvents(events); }
}

function sessionRowId(logicalId: string, deviceId: string): string {
  return `${encodeURIComponent(logicalId)}~${encodeURIComponent(deviceId)}`;
}

export class TinyBasePracticeSessionRepository implements PracticeSessionRepository {
  constructor(private readonly sessions: MergeableStore, private readonly deviceId: string) {}

  private matching(sourceKey: string): Array<Record<string, Cell>> {
    return rows(this.sessions, TABLE.practiceSessionVersions)
      .map(([, row]) => row)
      .filter((row) => row.source_key === sourceKey)
      .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
  }

  async list(): Promise<Array<{sourceKey: string; deviceId: string; result: PracticeSessionSnapshotParseResult}>> {
    return rows(this.sessions, TABLE.practiceSessionVersions).map(([, row]) => ({
      sourceKey: String(row.source_key),
      deviceId: String(row.device_id),
      result: parsePracticeSessionSnapshot(JSON.parse(String(row.snapshot_json))),
    }));
  }

  async load(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined> {
    const matches = this.matching(sourceKey);
    const row = matches.find((item) => item.device_id === this.deviceId) ?? matches[0];
    return row ? parsePracticeSessionSnapshot(JSON.parse(String(row.snapshot_json))) : undefined;
  }

  async save(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void> {
    const parsed = PracticeSessionSnapshotSchema.parse(snapshot) as PracticeSessionSnapshot;
    const rowId = sessionRowId(parsed.source_key, this.deviceId);
    const current = this.sessions.hasRow(TABLE.practiceSessionVersions, rowId)
      ? parsePracticeSessionSnapshot(JSON.parse(String(this.sessions.getCell(TABLE.practiceSessionVersions, rowId, "snapshot_json"))))
      : undefined;
    if (expectedRevision !== undefined && (current?.status !== "ok" || current.snapshot.revision !== expectedRevision)) {
      throw new Error("Practice session changed in another window");
    }
    if (expectedRevision === undefined && current?.status === "ok" && current.snapshot.session_id !== parsed.session_id) {
      throw new Error("Practice session changed in another window");
    }
    this.sessions.setRow(TABLE.practiceSessionVersions, rowId, compactRow({
      source_key: parsed.source_key,
      device_id: this.deviceId,
      session_id: parsed.session_id,
      revision: parsed.revision,
      updated_at: parsed.updated_at,
      snapshot_json: canonicalJson(parsed),
    }));
  }

  async remove(sourceKey: string, sessionId?: string): Promise<void> {
    const rowId = sessionRowId(sourceKey, this.deviceId);
    if (!this.sessions.hasRow(TABLE.practiceSessionVersions, rowId)) return;
    if (sessionId && this.sessions.getCell(TABLE.practiceSessionVersions, rowId, "session_id") !== sessionId) {
      throw new Error("Practice session changed in another window");
    }
    this.sessions.delRow(TABLE.practiceSessionVersions, rowId);
  }
}

export class TinyBaseExamSessionRepository implements ExamSessionRepository {
  constructor(private readonly sessions: MergeableStore, private readonly deviceId: string) {}

  async load(examId?: string): Promise<ExamSessionSnapshot | undefined> {
    const candidates = rows(this.sessions, TABLE.examSessionVersions)
      .map(([, row]) => row)
      .filter((row) => (!examId || row.exam_id === examId))
      .sort((left, right) => {
        const local = Number(right.device_id === this.deviceId) - Number(left.device_id === this.deviceId);
        return local || String(right.updated_at).localeCompare(String(left.updated_at));
      });
    if (!candidates[0]) return undefined;
    return ExamSessionSnapshotSchema.parse(JSON.parse(String(candidates[0].snapshot_json))) as ExamSessionSnapshot;
  }

  async save(snapshot: ExamSessionSnapshot, expectedRevision?: number): Promise<void> {
    const parsed = ExamSessionSnapshotSchema.parse(snapshot) as ExamSessionSnapshot;
    const rowId = sessionRowId(parsed.exam_id, this.deviceId);
    const currentRevision = optionalNumber(this.sessions.getCell(TABLE.examSessionVersions, rowId, "revision"));
    if (expectedRevision !== undefined && currentRevision !== expectedRevision) {
      throw new Error("Exam session changed in another window");
    }
    this.sessions.setRow(TABLE.examSessionVersions, rowId, compactRow({
      exam_id: parsed.exam_id,
      device_id: this.deviceId,
      revision: parsed.revision,
      status: parsed.status,
      updated_at: parsed.updated_at,
      snapshot_json: canonicalJson(parsed),
    }));
  }

  async remove(examId?: string): Promise<void> {
    for (const [rowId, row] of rows(this.sessions, TABLE.examSessionVersions)) {
      if (row.device_id === this.deviceId && (!examId || row.exam_id === examId)) {
        this.sessions.delRow(TABLE.examSessionVersions, rowId);
      }
    }
  }
}

export class TinyBaseQuestionSetBlueprintRepository implements QuestionSetBlueprintRepository {
  constructor(private readonly core: MergeableStore) {}
  async list(): Promise<QuestionSetBlueprint[]> {
    return rows(this.core, TABLE.questionSetBlueprints).map(([, row]) => (
      QuestionSetBlueprintSchema.parse(JSON.parse(String(row.snapshot_json))) as QuestionSetBlueprint
    ));
  }
  async save(blueprint: QuestionSetBlueprint): Promise<void> {
    const parsed = QuestionSetBlueprintSchema.parse(blueprint) as QuestionSetBlueprint;
    this.core.setRow(TABLE.questionSetBlueprints, parsed.blueprint_id, compactRow({
      revision: parsed.revision,
      updated_at: parsed.updated_at,
      snapshot_json: canonicalJson(parsed),
    }));
  }
  async remove(blueprintId: string): Promise<void> {
    this.core.delRow(TABLE.questionSetBlueprints, blueprintId);
  }
}

export class TinyBaseAggregateRepository implements AggregateRepository {
  constructor(
    private readonly core: MergeableStore,
    private readonly listAttempts: () => Promise<AttemptEvent[]>,
  ) {}
  async list(): Promise<QuestionAggregateRecord[]> {
    return rows(this.core, TABLE.questionAggregates).map(([, row]) => QuestionAggregateRecordSchema.parse(row));
  }
  async get(questionId: string): Promise<QuestionAggregateRecord | undefined> {
    if (!this.core.hasRow(TABLE.questionAggregates, questionId)) return undefined;
    return QuestionAggregateRecordSchema.parse(rowObject(this.core, TABLE.questionAggregates, questionId));
  }
  async rebuild(events?: readonly AttemptEvent[]): Promise<void> {
    const aggregates = aggregateAttemptEvents(events ?? await this.listAttempts());
    this.core.delTable(TABLE.questionAggregates);
    for (const [questionId, aggregate] of aggregates) {
      const row = QuestionAggregateRecordSchema.parse({
        question_id: questionId,
        attempts: aggregate.attempts,
        timed_attempts: aggregate.timedAttempts,
        total_duration_ms: aggregate.totalDurationMs,
        objective_attempts: aggregate.objectiveAttempts,
        objective_correct: aggregate.objectiveCorrect,
        objective_incorrect: aggregate.objectiveIncorrect,
        consecutive_review_count: aggregate.consecutiveReviewCount,
        consecutive_again_count: aggregate.consecutiveAgainCount,
        consecutive_hard_count: aggregate.consecutiveHardCount,
        latest_rating: aggregate.latestRating,
        last_answered_at: aggregate.lastAnsweredAt,
        previous_duration_ms: aggregate.previousDurationMs,
        last_duration_ms: aggregate.lastDurationMs,
        last_attempt_id: aggregate.lastAttemptId,
      });
      this.core.setRow(TABLE.questionAggregates, questionId, compactRow(row));
    }
    this.core.setValue("last_aggregate_rebuild_at", new Date().toISOString());
  }
}
