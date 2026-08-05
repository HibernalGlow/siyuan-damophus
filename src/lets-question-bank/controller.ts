import { createAttemptEvent, type NewAttemptInput } from "@/question-bank/core/attempts";
import { createAttemptArchive, serializeAttemptArchive } from "@/question-bank/core/recovery";
import type { AttemptAggregate, AttemptEvent } from "@/question-bank/core/types";
import { getLogger } from "@/libs/logger";
import {
  addQuickRiffCards,
  appendAttemptEvent,
  confirmQuestionBankInitialization,
  confirmQuestionBankRebinding,
  getDueRiffCards,
  mapDueRiffCardsToQuestions,
  migrateQuestionBankBinding,
  previewQuestionBankInitialization,
  previewQuestionBankRebinding,
  QuestionBankBindingSchema,
  rebuildAttemptStatistics,
  siyuanKernelClient,
  submitRiffRating,
  type QuestionBankBinding,
  type QuestionBankInitializationPreview,
  type QuestionBankRebindingPreview,
  type RiffCard,
  type SiyuanKernelClient,
} from "@/question-bank/adapters/siyuan";
import {
  confirmQuestionIndexSync,
  confirmAttemptImport,
  previewQuestionIndexSync,
  previewAttemptImport,
  shouldAutoCreateQuickCard,
  type AttemptImportPreview,
  type AttemptImportResult,
  type QuestionIndexPreview,
} from "@/question-bank/application";
import { loadSourceBlockIdentity, type SourceBlockIdentity } from "./source-identity";

export type { SourceBlockIdentity } from "./source-identity";

const log = getLogger("lets-question-bank");

export interface RecentScope {
  documentId: string;
  headingBlockId?: string;
  /** Read-only compatibility for pre-release settings. */
  topicId?: string;
}

export interface QuestionBankUiController {
  getBinding(): QuestionBankBinding | undefined;
  previewInitialization(documentId: string): Promise<QuestionBankInitializationPreview>;
  confirmInitialization(preview: QuestionBankInitializationPreview): Promise<QuestionBankBinding>;
  previewRebinding(systemDocumentId: string): Promise<QuestionBankRebindingPreview>;
  confirmRebinding(systemDocumentId: string, token: string): Promise<QuestionBankBinding>;
  loadSourceIdentity(blockId: string): Promise<SourceBlockIdentity>;
  previewSync(documentId: string): Promise<QuestionIndexPreview>;
  confirmSync(documentId: string, token: string): Promise<QuestionIndexPreview>;
  loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>>;
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
}

const bindingSetting = "binding";
const recentScopeSetting = "recentScope";
const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

export class QuestionBankController implements QuestionBankUiController {
  private readonly client: SiyuanKernelClient;
  private readonly nodeId: () => string;
  private readonly uuid: () => string;

  constructor(private readonly options: QuestionBankControllerOptions) {
    this.client = options.client ?? siyuanKernelClient;
    this.nodeId = options.nodeId ?? (() => window.Lute.NewNodeID());
    this.uuid = options.uuid ?? (() => crypto.randomUUID());
  }

  getBinding(): QuestionBankBinding | undefined {
    const stored = this.options.getSetting(bindingSetting);
    const binding = migrateQuestionBankBinding(stored);
    if (binding && !QuestionBankBindingSchema.safeParse(stored).success) {
      this.options.setSetting(bindingSetting, binding);
    }
    return binding;
  }

  async previewInitialization(documentId: string): Promise<QuestionBankInitializationPreview> {
    if (!nodeIdPattern.test(documentId)) throw new Error("Invalid SiYuan document ID");
    const blocks = await this.client.request<Array<{ box?: string }>>("/api/query/sql", {
      stmt: `SELECT box FROM blocks WHERE id = '${documentId}' LIMIT 1`,
    });
    const notebookId = blocks[0]?.box;
    if (!notebookId || !nodeIdPattern.test(notebookId)) {
      throw new Error("Cannot resolve the notebook for the selected document");
    }
    const existing = await this.client.request<string[]>("/api/filetree/getIDsByHPath", {
      notebook: notebookId,
      path: "/Damophus",
    });
    if (existing.length > 0) {
      throw new Error(`A Damophus system document already exists (${existing[0]}); reconnect it instead of creating another one`);
    }
    return previewQuestionBankInitialization({
      notebookId,
      path: "/Damophus",
      idGenerator: this.nodeId,
    });
  }

  async confirmInitialization(preview: QuestionBankInitializationPreview): Promise<QuestionBankBinding> {
    const binding = await confirmQuestionBankInitialization(this.client, preview, preview.token);
    this.options.setSetting(bindingSetting, binding);
    return binding;
  }

  async previewRebinding(systemDocumentId: string): Promise<QuestionBankRebindingPreview> {
    if (!nodeIdPattern.test(systemDocumentId)) throw new Error("Invalid SiYuan system document ID");
    return previewQuestionBankRebinding(this.client, systemDocumentId);
  }

  async confirmRebinding(systemDocumentId: string, token: string): Promise<QuestionBankBinding> {
    const binding = await confirmQuestionBankRebinding(this.client, systemDocumentId, token);
    this.options.setSetting(bindingSetting, binding);
    return binding;
  }

  async loadSourceIdentity(blockId: string): Promise<SourceBlockIdentity> {
    return loadSourceBlockIdentity(this.client, blockId);
  }

  async previewSync(documentId: string): Promise<QuestionIndexPreview> {
    return previewQuestionIndexSync(this.client, this.requireBinding(), documentId);
  }

  async confirmSync(documentId: string, token: string): Promise<QuestionIndexPreview> {
    return confirmQuestionIndexSync(this.client, this.requireBinding(), documentId, token);
  }

  async loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>> {
    return (await rebuildAttemptStatistics(this.client, this.requireBinding())).aggregates;
  }

  async loadDueCards(
    blockIdsByQuestionId: ReadonlyMap<string, string>,
  ): Promise<ReadonlyMap<string, RiffCard>> {
    const due = await getDueRiffCards(this.client);
    return mapDueRiffCardsToQuestions(due.cards, blockIdsByQuestionId);
  }

  async exportAttempts(): Promise<string> {
    const result = await rebuildAttemptStatistics(this.client, this.requireBinding());
    if (result.issues.length > 0) {
      throw new Error(`Cannot export while attempt rows are invalid: ${result.issues.map((issue) => issue.message).join("; ")}`);
    }
    return serializeAttemptArchive(createAttemptArchive(result.events, this.options.pluginVersion));
  }

  async previewImport(source: string): Promise<AttemptImportPreview> {
    return previewAttemptImport(this.client, this.requireBinding(), source);
  }

  async confirmImport(source: string, token: string): Promise<AttemptImportResult> {
    return confirmAttemptImport(
      this.client,
      this.requireBinding(),
      source,
      token,
      this.nodeId,
    );
  }

  async submitAttempt(
    input: Omit<NewAttemptInput, "attemptId">,
    dueCard?: RiffCard,
  ): Promise<AttemptSubmissionResult> {
    const event = createAttemptEvent({ ...input, attemptId: this.uuid() });
    const result = await appendAttemptEvent(this.client, this.requireBinding(), event, this.nodeId);
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
        const aggregate = (await rebuildAttemptStatistics(this.client, this.requireBinding()))
          .aggregates.get(event.question_id);
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

  private requireBinding(): QuestionBankBinding {
    const binding = this.getBinding();
    if (!binding) throw new Error("Damophus is not initialized");
    return binding;
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
