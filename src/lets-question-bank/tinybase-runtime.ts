import { aggregateAttemptEvents } from "../question-bank/core/attempts";
import { applyAttemptRatingEvents } from "../question-bank/core/rating-corrections";
import { parseAttemptArchive } from "../question-bank/core/recovery";
import type { AttemptAggregate, AttemptEvent, AttemptRatingEvent, ExamSummaryEvent, QuestionBookmark } from "../question-bank/core/types";
import type { PracticeSessionSnapshot, PracticeSessionSnapshotParseResult } from "../question-bank/core";
import type { ExamSessionSnapshot } from "../question-bank/exam";
import type { QuestionSetBlueprint } from "../question-bank/assembly";
import {
  createAttemptImportPlan,
  type AttemptImportPreview,
  type AttemptImportResult,
} from "../question-bank/application/recovery";
import {
  TinyBaseAttemptEventRepository,
  TinyBaseAttemptRatingEventRepository,
  TinyBaseBookmarkRepository,
  TinyBaseExamEventRepository,
  TinyBaseExamSessionRepository,
  TinyBasePracticeSessionRepository,
  TinyBaseQuestionSetBlueprintRepository,
} from "../question-bank/adapters/tinybase/repositories";
import { AnnualShardRouter, type ShardRouter } from "../question-bank/adapters/tinybase/shard-router";
import { TABLE } from "../question-bank/adapters/tinybase/tables";
import { TinyBaseWarehouse } from "../question-bank/adapters/tinybase/warehouse";
import { canonicalJson } from "../question-bank/storage/canonical-json";
import type { StoredPracticeSession } from "./session-host";

export interface TinyBaseRuntimeMergeResult {
  mergedAt: string;
  diagnostics: readonly unknown[];
}

export class TinyBaseRuntime {
  private initialization?: Promise<void>;
  private examWriteChain: Promise<void> = Promise.resolve();

  constructor(
    readonly warehouse: TinyBaseWarehouse,
    private readonly router: ShardRouter = new AnnualShardRouter(),
  ) {}

  private async initialize(): Promise<void> {
    this.initialization ??= this.warehouse.initializeLocal().then(() => undefined);
    return this.initialization;
  }

  async ensureReady(): Promise<void> {
    await this.initialize();
  }

  async persistCore(): Promise<void> {
    await this.initialize();
    await this.warehouse.persistCore();
  }

  async mergeAfterSync(): Promise<TinyBaseRuntimeMergeResult> {
    await this.initialize();
    const view = await this.warehouse.mergeAfterSync();
    const mergedAt = view.mergedAt ?? new Date().toISOString();
    // Post-sync refreshes must remain read-only or the local write triggers another SiYuan sync.
    return {mergedAt, diagnostics: this.warehouse.getDiagnostics()};
  }

  async listPracticeSessions(): Promise<StoredPracticeSession[]> {
    await this.initialize();
    const repository = new TinyBasePracticeSessionRepository(
      this.warehouse.getReadView().sessions,
      this.warehouse.deviceId,
    );
    const sourceKeys = new Set((await repository.list()).map((item) => item.sourceKey));
    const result: StoredPracticeSession[] = [];
    for (const sourceKey of sourceKeys) {
      const parsed = await repository.load(sourceKey);
      if (parsed) result.push({sourceKey, result: parsed});
    }
    return result;
  }

  async loadPracticeSession(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined> {
    await this.initialize();
    return new TinyBasePracticeSessionRepository(
      this.warehouse.getReadView().sessions,
      this.warehouse.deviceId,
    ).load(sourceKey);
  }

  async savePracticeSession(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void> {
    await this.initialize();
    await new TinyBasePracticeSessionRepository(
      this.warehouse.getLocalContribution().sessions,
      this.warehouse.deviceId,
      {readView: this.warehouse.getReadView().sessions},
    ).save(snapshot, expectedRevision);
    await this.warehouse.persistSessions();
  }

  async removePracticeSession(sourceKey: string, sessionId?: string): Promise<void> {
    await this.initialize();
    await new TinyBasePracticeSessionRepository(
      this.warehouse.getLocalContribution().sessions,
      this.warehouse.deviceId,
      {readView: this.warehouse.getReadView().sessions},
    ).remove(sourceKey, sessionId);
    await this.warehouse.persistSessions();
  }

  async practiceSessionDiagnostic(sourceKey: string): Promise<string> {
    await this.initialize();
    const versions = (await new TinyBasePracticeSessionRepository(
      this.warehouse.getReadView().sessions,
      this.warehouse.deviceId,
    ).list()).filter((item) => item.sourceKey === sourceKey);
    return JSON.stringify({sourceKey, versions}, null, 2);
  }

  async loadExamSession(examId?: string): Promise<ExamSessionSnapshot | undefined> {
    await this.initialize();
    return new TinyBaseExamSessionRepository(
      this.warehouse.getReadView().sessions,
      this.warehouse.deviceId,
    ).load(examId);
  }

  async saveExamSession(snapshot: ExamSessionSnapshot, expectedRevision?: number): Promise<void> {
    await this.initialize();
    const previous = this.examWriteChain;
    let release!: () => void;
    this.examWriteChain = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const locks = globalThis.navigator?.locks;
      const save = async () => {
        await this.warehouse.refreshLocalSessions();
        await new TinyBaseExamSessionRepository(
          this.warehouse.getLocalContribution().sessions,
          this.warehouse.deviceId,
        ).save(snapshot, expectedRevision);
        await this.warehouse.persistSessions();
      };
      if (locks) await locks.request("damophus-exam-session-write", save);
      else await save();
    } finally {
      release();
    }
  }

  async removeExamSession(examId?: string): Promise<void> {
    await this.initialize();
    await new TinyBaseExamSessionRepository(
      this.warehouse.getLocalContribution().sessions,
      this.warehouse.deviceId,
    ).remove(examId);
    await this.warehouse.persistSessions();
  }

  async examSessionDiagnostic(): Promise<string> {
    await this.initialize();
    const store = this.warehouse.getReadView().sessions;
    const versions = store.getRowIds(TABLE.examSessionVersions).map((rowId) => ({
      rowId,
      row: store.getRow(TABLE.examSessionVersions, rowId),
    }));
    return JSON.stringify({versions}, null, 2);
  }

  async listAttemptEvents(): Promise<AttemptEvent[]> {
    await this.initialize();
    return new TinyBaseAttemptEventRepository(this.warehouse.getReadView().events, this.router).list();
  }

  async listAttemptRatingEvents(): Promise<AttemptRatingEvent[]> {
    await this.initialize();
    return new TinyBaseAttemptRatingEventRepository(this.warehouse.getReadView().events, this.router).list();
  }

  async listEffectiveAttemptEvents(): Promise<AttemptEvent[]> {
    return applyAttemptRatingEvents(await this.listAttemptEvents(), await this.listAttemptRatingEvents());
  }

  async listExamEvents(): Promise<ExamSummaryEvent[]> {
    await this.initialize();
    return new TinyBaseExamEventRepository(this.warehouse.getReadView().events, this.router).list();
  }

  private async assertImmutableEvent(
    event: AttemptEvent | ExamSummaryEvent,
    existing: readonly (AttemptEvent | ExamSummaryEvent)[],
  ): Promise<"created" | "duplicate"> {
    const match = existing.find((item) => item.attempt_id === event.attempt_id);
    if (!match) return "created";
    if (canonicalJson(match) !== canonicalJson(event)) {
      throw new Error(`Immutable event conflict for '${event.attempt_id}'`);
    }
    return "duplicate";
  }

  async appendAttempt(event: AttemptEvent): Promise<"created" | "duplicate"> {
    await this.initialize();
    const status = await this.assertImmutableEvent(event, await this.listAttemptEvents());
    if (status === "duplicate") return status;
    const local = this.warehouse.getLocalContribution();
    await new TinyBaseAttemptEventRepository(local.events, this.router).append(event);
    await this.persistEventShard(this.router.routeAttempt(event.answered_at));
    return "created";
  }

  async appendAttemptRating(event: AttemptRatingEvent): Promise<"created" | "duplicate"> {
    await this.initialize();
    const existing = await this.listAttemptRatingEvents();
    const match = existing.find((item) => item.event_id === event.event_id);
    if (match) {
      if (canonicalJson(match) !== canonicalJson(event)) {
        throw new Error(`Immutable event conflict for '${event.event_id}'`);
      }
      return "duplicate";
    }
    const local = this.warehouse.getLocalContribution();
    await new TinyBaseAttemptRatingEventRepository(local.events, this.router).append(event);
    await this.persistEventShard(this.router.routeAttempt(event.changed_at));
    return "created";
  }

  async appendExamEvent(event: ExamSummaryEvent): Promise<"created" | "duplicate"> {
    await this.initialize();
    const status = await this.assertImmutableEvent(event, await this.listExamEvents());
    if (status === "duplicate") return status;
    const local = this.warehouse.getLocalContribution();
    await new TinyBaseExamEventRepository(local.events, this.router).append(event);
    await this.persistEventShard(this.router.routeAttempt(event.answered_at));
    return "created";
  }

  async loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>> {
    return aggregateAttemptEvents(await this.listEffectiveAttemptEvents());
  }

  private async persistEventShard(shardId: string): Promise<void> {
    const bytes = await this.warehouse.eventShardBytes(shardId);
    this.router.checkSize(shardId, bytes);
    await this.warehouse.persistEventShard(shardId);
  }

  async listBlueprints(): Promise<QuestionSetBlueprint[]> {
    await this.initialize();
    return new TinyBaseQuestionSetBlueprintRepository(this.warehouse.getReadView().core).list();
  }

  async saveBlueprint(blueprint: QuestionSetBlueprint): Promise<void> {
    await this.initialize();
    await new TinyBaseQuestionSetBlueprintRepository(this.warehouse.getLocalContribution().core).save(blueprint);
    await this.warehouse.persistCore();
  }

  async removeBlueprint(blueprintId: string): Promise<void> {
    await this.initialize();
    await new TinyBaseQuestionSetBlueprintRepository(this.warehouse.getLocalContribution().core).remove(blueprintId);
    await this.warehouse.persistCore();
  }

  private questionBlockIds(): Map<string, string> {
    const core = this.warehouse.getReadView().core;
    return new Map(core.getRowIds(TABLE.questions).flatMap((questionId) => {
      const blockId = core.getCell(TABLE.questions, questionId, "block_id");
      return typeof blockId === "string" && blockId ? [[questionId, blockId]] : [];
    }));
  }

  private async prepareImport(source: string) {
    await this.initialize();
    const archive = parseAttemptArchive(source);
    const existing = await this.listAttemptEvents();
    const existingById = new Map(existing.map((event) => [event.attempt_id, event]));
    for (const event of archive.attempts) {
      const current = existingById.get(event.attempt_id);
      if (current && canonicalJson(current) !== canonicalJson(event)) {
        throw new Error(`Immutable event conflict for '${event.attempt_id}'`);
      }
    }
    return createAttemptImportPlan(
      archive,
      new Set(existing.map((event) => event.attempt_id)),
      this.questionBlockIds(),
    );
  }

  async previewAttemptImport(source: string): Promise<AttemptImportPreview> {
    return (await this.prepareImport(source)).preview;
  }

  async confirmAttemptImport(source: string, expectedToken: string): Promise<AttemptImportResult> {
    const prepared = await this.prepareImport(source);
    if (prepared.preview.token !== expectedToken) {
      throw new Error("Attempt import preview is stale; preview the archive again");
    }
    let imported = 0;
    const failures: AttemptImportResult["failures"] = [];
    const touchedShards = new Set<string>();
    const repository = new TinyBaseAttemptEventRepository(
      this.warehouse.getLocalContribution().events,
      this.router,
    );
    for (const event of prepared.events) {
      try {
        if (await repository.append(event) === "created") {
          imported += 1;
          touchedShards.add(this.router.routeAttempt(event.answered_at));
        }
      } catch (error) {
        failures.push({
          attemptId: event.attempt_id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    for (const shardId of touchedShards) await this.persistEventShard(shardId);
    return {...prepared.preview, imported, failures};
  }

  async getBookmark(questionId: string): Promise<QuestionBookmark | undefined> {
    await this.initialize();
    return new TinyBaseBookmarkRepository(this.warehouse.getReadView().core).get(questionId);
  }

  async listBookmarks(): Promise<QuestionBookmark[]> {
    await this.initialize();
    return new TinyBaseBookmarkRepository(this.warehouse.getReadView().core).list();
  }

  async loadBookmarks(): Promise<ReadonlyMap<string, QuestionBookmark>> {
    const list = await this.listBookmarks();
    return new Map(list.map((item) => [item.questionId, item]));
  }

  async saveBookmark(bookmark: QuestionBookmark): Promise<void> {
    await this.initialize();
    await new TinyBaseBookmarkRepository(this.warehouse.getLocalContribution().core).save(bookmark);
    await this.warehouse.persistCore();
  }

  async removeBookmark(questionId: string): Promise<void> {
    await this.initialize();
    await new TinyBaseBookmarkRepository(this.warehouse.getLocalContribution().core).remove(questionId);
    await this.warehouse.persistCore();
  }

  async listBookmarkedQuestionIds(tag?: string): Promise<Set<string>> {
    await this.initialize();
    return new TinyBaseBookmarkRepository(this.warehouse.getReadView().core).getBookmarkedQuestionIds(tag);
  }
}
