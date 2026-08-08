import { createAttemptEvent, type NewAttemptInput } from "@/question-bank/core/attempts";
import { createAttemptArchive, serializeAttemptArchive } from "@/question-bank/core/recovery";
import type { AttemptAggregate, AttemptEvent, ExamSummaryEvent, ObjectiveAnswer, Question } from "@/question-bank/core/types";
import type { ExamSessionSnapshot } from "@/question-bank/exam";
import type { StatisticsQuestion } from "@/question-bank/core/statistics";
import {
  assembleQuestionSet,
  type QuestionCatalogEntry,
  type QuestionSetBlueprint,
  type QuestionSetBlueprintRepository,
} from "@/question-bank/assembly";
import { getLogger } from "@/libs/logger";
import { correctQuestionAnswer as persistCorrectQuestionAnswer } from "@/question-bank/adapters/siyuan/answer-correction";
import { getDueRiffCards, mapDueRiffCardsToQuestions, submitRiffRating, addQuickRiffCards } from "@/question-bank/adapters/siyuan/riff";
import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import type { SiyuanKernelClient } from "@/question-bank/adapters/siyuan/types";
import type {
  QuestionBankBinding,
  QuestionBankInitializationPreview,
  QuestionBankRebindingPreview,
} from "@/question-bank/adapters/siyuan/binding";
import type {
  TopicResourceProjection,
  PersistTopicResourceInput,
  PersistTopicResourceResult,
  QuestionTopicAssignment,
  TopicRelationPreview,
  TopicRelationSyncMode,
} from "@/question-bank/adapters/siyuan/topic-index";
import type { RiffCard } from "@/question-bank/adapters/siyuan/riff";
import type { AttemptImportPreview, AttemptImportResult } from "@/question-bank/application/recovery";
import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
import type { QuestionIndexBatchPreview } from "@/question-bank/application/batch-indexing";
import { shouldAutoCreateQuickCard } from "@/question-bank/application/review";
import type { QuestionSourceDocument, HydratedQuestionSource } from "@/question-bank/adapters/siyuan/source-catalog";
import { loadSourceBlockIdentity, type SourceBlockIdentity } from "./source-identity";
import type { PracticeSessionSnapshot, PracticeSessionSnapshotParseResult } from "@/question-bank/core";
import type {
  PracticeSessionLeaseCoordinator,
  PracticeSessionRepository,
  StoredPracticeSession,
} from "./session-host";
import type { SiyuanExamSessionRepository } from "./exam-session-host";
import type { TinyBaseRuntime } from "./tinybase-runtime";
import type { TinyBaseSiyuanCatalogRuntime } from "./tinybase-catalog-runtime";
import { resolveSourceRenderingBinding } from "./source-rendering-binding";
import {
  normalizePracticeDefaults,
  resolvePracticePreferences,
  type PracticePreferences,
} from "./practice-preferences";

export type { SourceBlockIdentity } from "./source-identity";

const log = getLogger("lets-question-bank");

export interface RecentScope {
  documentId: string;
  headingBlockId?: string;
  /** Read-only compatibility for pre-release settings. */
  topicId?: string;
}

export interface QuestionBankUiController {
  readonly usesTinyBase?: boolean;
  getBinding(): QuestionBankBinding | undefined;
  previewInitialization(documentId: string): Promise<QuestionBankInitializationPreview>;
  confirmInitialization(preview: QuestionBankInitializationPreview): Promise<QuestionBankBinding>;
  previewRebinding(systemDocumentId: string): Promise<QuestionBankRebindingPreview>;
  confirmRebinding(systemDocumentId: string, token: string): Promise<QuestionBankBinding>;
  loadSourceIdentity(blockId: string): Promise<SourceBlockIdentity>;
  listPracticeSessions(): Promise<StoredPracticeSession[]>;
  loadPracticeSession(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined>;
  savePracticeSession(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void>;
  removePracticeSession(sourceKey: string, sessionId?: string): Promise<void>;
  exportPracticeSessionDiagnostic(sourceKey: string): Promise<string>;
  acquirePracticeSession(sourceKey: string): Promise<boolean>;
  releasePracticeSession(sourceKey: string): Promise<void>;
  loadExamSession?: () => Promise<ExamSessionSnapshot | undefined>;
  saveExamSession?: (snapshot: ExamSessionSnapshot, expectedRevision?: number) => Promise<void>;
  removeExamSession?: (examId?: string) => Promise<void>;
  exportExamSessionDiagnostic?: () => Promise<string>;
  loadExamEvents?: () => Promise<ExamSummaryEvent[]>;
  submitExamEvent?: (event: ExamSummaryEvent) => Promise<"created" | "duplicate">;
  submitExamAttempt?: (event: AttemptEvent) => Promise<"created" | "duplicate">;
  loadSessionAttempts(sessionId: string): Promise<AttemptEvent[]>;
  previewSync(documentId: string): Promise<QuestionIndexPreview>;
  confirmSync(documentId: string, token: string): Promise<QuestionIndexPreview>;
  previewSyncBatch?(documentIds: readonly string[]): Promise<QuestionIndexBatchPreview>;
  confirmSyncBatch?(documentIds: readonly string[], token: string): Promise<QuestionIndexBatchPreview>;
  listQuestionSourceDocuments?(): Promise<QuestionSourceDocument[]>;
  loadQuestionCatalog?(): Promise<QuestionCatalogEntry[]>;
  hydrateQuestionSources?(questionIds: readonly string[]): Promise<HydratedQuestionSource>;
  correctQuestionAnswer?(questionBlockId: string, question: Question, answer: ObjectiveAnswer): Promise<void>;
  loadQuestionTopicResources?(questionId: string, questionBlockId?: string): Promise<TopicResourceProjection[]>;
  persistQuestionTopicResource?(input: PersistTopicResourceInput): Promise<PersistTopicResourceResult>;
  previewTopicRelationSync?(
    assignments: readonly QuestionTopicAssignment[],
    mode: TopicRelationSyncMode,
  ): Promise<TopicRelationPreview>;
  confirmTopicRelationSync?(
    assignments: readonly QuestionTopicAssignment[],
    mode: TopicRelationSyncMode,
    token: string,
  ): Promise<TopicRelationPreview>;
  listQuestionSetBlueprints?(): Promise<QuestionSetBlueprint[]>;
  saveQuestionSetBlueprint?(blueprint: QuestionSetBlueprint): Promise<void>;
  removeQuestionSetBlueprint?(blueprintId: string): Promise<void>;
  assembleQuestionSet?(input: {
    blueprint: QuestionSetBlueprint;
    catalog: readonly QuestionCatalogEntry[];
    sourceRevision: string;
    setId: string;
    seed: string;
  }): ReturnType<typeof assembleQuestionSet>;
  loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>>;
  loadStatisticsQuestions?: () => Promise<StatisticsQuestion[]>;
  loadAttemptEvents?: () => Promise<AttemptEvent[]>;
  loadDueCards(blockIdsByQuestionId: ReadonlyMap<string, string>): Promise<ReadonlyMap<string, RiffCard>>;
  exportAttempts(): Promise<string>;
  previewImport(source: string): Promise<AttemptImportPreview>;
  confirmImport(source: string, token: string): Promise<AttemptImportResult>;
  submitAttempt(
    input: Omit<NewAttemptInput, "attemptId">,
    dueCard?: RiffCard,
  ): Promise<AttemptSubmissionResult>;
  getRecentScope(): RecentScope | undefined;
  saveRecentScope(scope: RecentScope): void;
  getPracticePreferences(): PracticePreferences;
  savePracticePreferences(preferences: PracticePreferences): void;
}

export interface AttemptSubmissionResult {
  event: AttemptEvent;
  warnings: string[];
}

export interface QuestionBankControllerOptions {
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void;
  client?: SiyuanKernelClient;
  nodeId?: () => string;
  uuid?: () => string;
  pluginVersion: string;
  sessionRepository?: PracticeSessionRepository;
  sessionLeases?: PracticeSessionLeaseCoordinator;
  examSessionRepository?: SiyuanExamSessionRepository;
  questionSetRepository?: QuestionSetBlueprintRepository;
  tinybaseRuntime?: TinyBaseRuntime;
  tinybaseCatalogRuntime?: TinyBaseSiyuanCatalogRuntime;
}

const recentScopeSetting = "recentScope";
const recentPracticePreferencesSetting = "recentPracticePreferences";
const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

export class QuestionBankController implements QuestionBankUiController {
  readonly usesTinyBase: boolean;
  private readonly client: SiyuanKernelClient;
  private readonly uuid: () => string;

  constructor(private readonly options: QuestionBankControllerOptions) {
    this.usesTinyBase = Boolean(options.tinybaseRuntime);
    this.client = options.client ?? siyuanKernelClient;
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
    log.info("controller.created", {
      pluginVersion: options.pluginVersion,
      hasPracticeSessionRepository: Boolean(options.sessionRepository),
      hasExamSessionRepository: Boolean(options.examSessionRepository),
    });
  }

  getBinding(): QuestionBankBinding | undefined {
    return resolveSourceRenderingBinding(this.options.getSetting, this.options.setSetting);
  }

  async previewInitialization(documentId: string): Promise<QuestionBankInitializationPreview> {
    void documentId;
    throw new Error("Question bank initialization is not used after TinyBase cutover");
  }

  async confirmInitialization(preview: QuestionBankInitializationPreview): Promise<QuestionBankBinding> {
    void preview;
    throw new Error("Question bank initialization is not used after TinyBase cutover");
  }

  async previewRebinding(systemDocumentId: string): Promise<QuestionBankRebindingPreview> {
    void systemDocumentId;
    throw new Error("Question bank rebinding is not used after TinyBase cutover");
  }

  async confirmRebinding(systemDocumentId: string, token: string): Promise<QuestionBankBinding> {
    void systemDocumentId;
    void token;
    throw new Error("Question bank rebinding is not used after TinyBase cutover");
  }

  async loadSourceIdentity(blockId: string): Promise<SourceBlockIdentity> {
    return loadSourceBlockIdentity(this.client, blockId);
  }

  async listPracticeSessions(): Promise<StoredPracticeSession[]> {
    if (this.options.tinybaseRuntime) return this.options.tinybaseRuntime.listPracticeSessions();
    return this.options.sessionRepository?.list() ?? [];
  }

  async loadPracticeSession(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined> {
    if (this.options.tinybaseRuntime) return this.options.tinybaseRuntime.loadPracticeSession(sourceKey);
    return this.options.sessionRepository?.load(sourceKey);
  }

  async savePracticeSession(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void> {
    if (this.options.tinybaseRuntime) {
      await this.options.tinybaseRuntime.savePracticeSession(snapshot, expectedRevision);
      return;
    }
    if (!this.options.sessionRepository) return;
    await this.options.sessionRepository.save(snapshot, expectedRevision);
  }

  async removePracticeSession(sourceKey: string, sessionId?: string): Promise<void> {
    if (this.options.tinybaseRuntime) {
      await this.options.tinybaseRuntime.removePracticeSession(sourceKey, sessionId);
      return;
    }
    await this.options.sessionRepository?.remove(sourceKey, sessionId);
  }

  async exportPracticeSessionDiagnostic(sourceKey: string): Promise<string> {
    if (this.options.tinybaseRuntime) return this.options.tinybaseRuntime.practiceSessionDiagnostic(sourceKey);
    return this.options.sessionRepository?.diagnostic(sourceKey) ?? "{}";
  }

  async acquirePracticeSession(sourceKey: string): Promise<boolean> {
    return this.options.sessionLeases?.acquire(sourceKey) ?? true;
  }

  async releasePracticeSession(sourceKey: string): Promise<void> {
    await this.options.sessionLeases?.release(sourceKey);
  }

  async loadExamSession(): Promise<ExamSessionSnapshot | undefined> {
    if (this.options.tinybaseRuntime) return this.options.tinybaseRuntime.loadExamSession();
    return this.options.examSessionRepository?.load();
  }

  async saveExamSession(snapshot: ExamSessionSnapshot, expectedRevision?: number): Promise<void> {
    if (this.options.tinybaseRuntime) {
      await this.options.tinybaseRuntime.saveExamSession(snapshot, expectedRevision);
      return;
    }
    await this.options.examSessionRepository?.save(snapshot, expectedRevision);
  }

  async removeExamSession(examId?: string): Promise<void> {
    if (this.options.tinybaseRuntime) {
      await this.options.tinybaseRuntime.removeExamSession(examId);
      return;
    }
    await this.options.examSessionRepository?.remove(examId);
  }

  async exportExamSessionDiagnostic(): Promise<string> {
    if (this.options.tinybaseRuntime) return this.options.tinybaseRuntime.examSessionDiagnostic();
    return this.options.examSessionRepository?.diagnostic() ?? "{}";
  }

  async loadExamEvents(): Promise<ExamSummaryEvent[]> {
    return this.requireTinyBase().listExamEvents();
  }

  async submitExamEvent(event: ExamSummaryEvent): Promise<"created" | "duplicate"> {
    return this.requireTinyBase().appendExamEvent(event);
  }

  async submitExamAttempt(event: AttemptEvent): Promise<"created" | "duplicate"> {
    return this.requireTinyBase().appendAttempt(event);
  }

  async loadSessionAttempts(sessionId: string): Promise<AttemptEvent[]> {
    return (await this.requireTinyBase().listAttemptEvents())
      .filter((event) => event.session_id === sessionId);
  }

  async previewSync(documentId: string): Promise<QuestionIndexPreview> {
    log.info("scan.started", { documentId });
    try {
      const preview = await this.requireTinyBaseCatalog().previewDocument(documentId);
      log.info("scan.completed", {
        documentId,
        questions: preview.scan.report.document.questions.length,
        blockers: preview.blockers.length,
        pendingActions: preview.actions.length,
        bindingRepairs: preview.bindingRepairs.length,
      });
      return preview;
    } catch (error) {
      log.error("scan.failed", { documentId, error });
      throw error;
    }
  }

  async confirmSync(documentId: string, token: string): Promise<QuestionIndexPreview> {
    return this.requireTinyBaseCatalog().confirmDocument(documentId, token);
  }

  async previewSyncBatch(documentIds: readonly string[]): Promise<QuestionIndexBatchPreview> {
    return this.requireTinyBaseCatalog().previewBatch(documentIds);
  }

  async confirmSyncBatch(documentIds: readonly string[], token: string): Promise<QuestionIndexBatchPreview> {
    return this.requireTinyBaseCatalog().confirmBatch(documentIds, token);
  }

  async listQuestionSourceDocuments(): Promise<QuestionSourceDocument[]> {
    return this.requireTinyBaseCatalog().listSourceDocuments();
  }

  async loadQuestionCatalog(): Promise<QuestionCatalogEntry[]> {
    return this.requireTinyBaseCatalog().loadCatalog();
  }

  async hydrateQuestionSources(questionIds: readonly string[]): Promise<HydratedQuestionSource> {
    return this.requireTinyBaseCatalog().hydrate(questionIds);
  }

  async correctQuestionAnswer(questionBlockId: string, question: Question, answer: ObjectiveAnswer): Promise<void> {
    await persistCorrectQuestionAnswer(this.client, questionBlockId, question, answer);
  }

  async loadQuestionTopicResources(questionId: string, questionBlockId?: string): Promise<TopicResourceProjection[]> {
    void questionId;
    void questionBlockId;
    return [];
  }

  async persistQuestionTopicResource(input: PersistTopicResourceInput): Promise<PersistTopicResourceResult> {
    void input;
    throw new Error("Topic resource AV projection is disabled after TinyBase cutover");
  }

  async previewTopicRelationSync(
    assignments: readonly QuestionTopicAssignment[],
    mode: TopicRelationSyncMode,
  ): Promise<TopicRelationPreview> {
    return {
      token: "tinybase-topic-relations-disabled",
      generatedAt: new Date().toISOString(),
      mode,
      assignments: [...assignments],
      actions: [],
      issues: [],
      results: [],
    };
  }

  async confirmTopicRelationSync(
    assignments: readonly QuestionTopicAssignment[],
    mode: TopicRelationSyncMode,
    token: string,
  ): Promise<TopicRelationPreview> {
    const preview = await this.previewTopicRelationSync(assignments, mode);
    if (preview.token !== token) throw new Error("Topic relation preview is stale");
    return preview;
  }

  async listQuestionSetBlueprints(): Promise<QuestionSetBlueprint[]> {
    return this.requireTinyBase().listBlueprints();
  }

  async saveQuestionSetBlueprint(blueprint: QuestionSetBlueprint): Promise<void> {
    await this.requireTinyBase().saveBlueprint(blueprint);
  }

  async removeQuestionSetBlueprint(blueprintId: string): Promise<void> {
    await this.requireTinyBase().removeBlueprint(blueprintId);
  }

  assembleQuestionSet(input: {
    blueprint: QuestionSetBlueprint;
    catalog: readonly QuestionCatalogEntry[];
    sourceRevision: string;
    setId: string;
    seed: string;
  }): ReturnType<typeof assembleQuestionSet> {
    return assembleQuestionSet(input);
  }

  async loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>> {
    return this.requireTinyBase().loadAggregates();
  }

  async loadStatisticsQuestions(): Promise<StatisticsQuestion[]> {
    return this.requireTinyBaseCatalog().loadStatisticsQuestions();
  }

  async loadAttemptEvents(): Promise<AttemptEvent[]> {
    return this.requireTinyBase().listAttemptEvents();
  }

  async loadDueCards(
    blockIdsByQuestionId: ReadonlyMap<string, string>,
  ): Promise<ReadonlyMap<string, RiffCard>> {
    const due = await getDueRiffCards(this.client);
    return mapDueRiffCardsToQuestions(due.cards, blockIdsByQuestionId);
  }

  async exportAttempts(): Promise<string> {
    return serializeAttemptArchive(createAttemptArchive(
      await this.requireTinyBase().listAttemptEvents(),
      this.options.pluginVersion,
    ));
  }

  async previewImport(source: string): Promise<AttemptImportPreview> {
    return this.requireTinyBase().previewAttemptImport(source);
  }

  async confirmImport(source: string, token: string): Promise<AttemptImportResult> {
    return this.requireTinyBase().confirmAttemptImport(source, token);
  }

  async submitAttempt(
    input: Omit<NewAttemptInput, "attemptId">,
    dueCard?: RiffCard,
  ): Promise<AttemptSubmissionResult> {
    const event = createAttemptEvent({ ...input, attemptId: this.uuid() });
    log.info("attempt.created", {
      attemptId: event.attempt_id,
      questionId: event.question_id,
      selectedOptionIds: event.selected_option_ids,
      objectiveCorrect: event.objective_correct,
      masteryRating: event.mastery_rating,
    });
    const result = {status: await this.requireTinyBase().appendAttempt(event)};
    if (result.status !== "created") throw new Error(`Attempt '${event.attempt_id}' already exists`);
    const warnings: string[] = [];
    if (dueCard) {
      try {
        await submitRiffRating(this.client, dueCard, event.mastery_rating);
      } catch (error) {
        const message = `Attempt saved, but Riff rating failed: ${error instanceof Error ? error.message : String(error)}`;
        warnings.push(message);
        log.warn(message);
      }
    } else if (input.questionRelation && this.autoAddQuickCardsEnabled()) {
      try {
        const aggregate = (await this.loadAggregates()).get(event.question_id);
        if (shouldAutoCreateQuickCard(aggregate, this.autoCardThresholds())) {
          await addQuickRiffCards(this.client, [input.questionRelation]);
        }
      } catch (error) {
        const message = `Attempt saved, but automatic quick-card creation failed: ${error instanceof Error ? error.message : String(error)}`;
        warnings.push(message);
        log.warn(message);
      }
    }
    return { event, warnings };
  }

  getRecentScope(): RecentScope | undefined {
    const value = this.options.getSetting(recentScopeSetting);
    if (!value || typeof value !== "object") return undefined;
    const scope = value as Partial<RecentScope>;
    if (!scope.documentId || !nodeIdPattern.test(scope.documentId)) return undefined;
    return {
      documentId: scope.documentId,
      headingBlockId: scope.headingBlockId && nodeIdPattern.test(scope.headingBlockId)
        ? scope.headingBlockId
        : undefined,
      topicId: typeof scope.topicId === "string" ? scope.topicId : undefined,
    };
  }

  saveRecentScope(scope: RecentScope): void {
    this.options.setSetting(recentScopeSetting, {
      documentId: scope.documentId,
      headingBlockId: scope.headingBlockId,
    });
  }

  getPracticePreferences(): PracticePreferences {
    const defaults = normalizePracticeDefaults({
      order: this.options.getSetting("defaultQuestionOrder"),
      optionOrder: this.options.getSetting("defaultOptionOrder"),
      filter: this.options.getSetting("defaultPracticeFilter"),
    });
    return resolvePracticePreferences(this.options.getSetting(recentPracticePreferencesSetting), defaults);
  }

  savePracticePreferences(preferences: PracticePreferences): void {
    this.options.setSetting(recentPracticePreferencesSetting, preferences);
  }

  private requireTinyBase(): TinyBaseRuntime {
    if (!this.options.tinybaseRuntime) throw new Error("TinyBase runtime is not configured");
    return this.options.tinybaseRuntime;
  }

  private requireTinyBaseCatalog(): TinyBaseSiyuanCatalogRuntime {
    if (!this.options.tinybaseCatalogRuntime) throw new Error("TinyBase catalog runtime is not configured");
    return this.options.tinybaseCatalogRuntime;
  }

  private autoAddQuickCardsEnabled(): boolean {
    return this.options.getSetting("autoAddQuickCards") !== false;
  }

  private autoCardThresholds(): { again: number; hard: number } {
    return {
      again: this.getPositiveIntegerSetting("autoCardAgainThreshold", 2),
      hard: this.getPositiveIntegerSetting("autoCardHardThreshold", 1),
    };
  }

  private getPositiveIntegerSetting(key: string, fallback: number): number {
    const value = Number(this.options.getSetting(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
