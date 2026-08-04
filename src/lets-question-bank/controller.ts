import { createAttemptEvent, type NewAttemptInput } from "@/question-bank/core/attempts";
import type { AttemptAggregate, AttemptEvent } from "@/question-bank/core/types";
import {
  appendAttemptEvent,
  confirmQuestionBankInitialization,
  previewQuestionBankInitialization,
  QuestionBankBindingSchema,
  rebuildAttemptStatistics,
  siyuanKernelClient,
  type QuestionBankBinding,
  type QuestionBankInitializationPreview,
  type SiyuanKernelClient,
} from "@/question-bank/adapters/siyuan";
import {
  confirmQuestionIndexSync,
  previewQuestionIndexSync,
  type QuestionIndexPreview,
} from "@/question-bank/application";

export interface RecentScope {
  documentId: string;
  topicId?: string;
}

export interface QuestionBankUiController {
  getBinding(): QuestionBankBinding | undefined;
  previewInitialization(documentId: string): Promise<QuestionBankInitializationPreview>;
  confirmInitialization(preview: QuestionBankInitializationPreview): Promise<QuestionBankBinding>;
  previewSync(documentId: string): Promise<QuestionIndexPreview>;
  confirmSync(documentId: string, token: string): Promise<QuestionIndexPreview>;
  loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>>;
  loadDueQuestionIds(): Promise<ReadonlySet<string>>;
  submitAttempt(input: Omit<NewAttemptInput, "attemptId">): Promise<AttemptEvent>;
  getRecentScope(): RecentScope | undefined;
  saveRecentScope(scope: RecentScope): void;
}

export interface QuestionBankControllerOptions {
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void;
  client?: SiyuanKernelClient;
  nodeId?: () => string;
  uuid?: () => string;
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
    const parsed = QuestionBankBindingSchema.safeParse(this.options.getSetting(bindingSetting));
    return parsed.success ? parsed.data as QuestionBankBinding : undefined;
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

  async previewSync(documentId: string): Promise<QuestionIndexPreview> {
    return previewQuestionIndexSync(this.client, this.requireBinding(), documentId);
  }

  async confirmSync(documentId: string, token: string): Promise<QuestionIndexPreview> {
    return confirmQuestionIndexSync(this.client, this.requireBinding(), documentId, token);
  }

  async loadAggregates(): Promise<ReadonlyMap<string, AttemptAggregate>> {
    return (await rebuildAttemptStatistics(this.client, this.requireBinding())).aggregates;
  }

  async loadDueQuestionIds(): Promise<ReadonlySet<string>> {
    return new Set();
  }

  async submitAttempt(input: Omit<NewAttemptInput, "attemptId">): Promise<AttemptEvent> {
    const event = createAttemptEvent({ ...input, attemptId: this.uuid() });
    const result = await appendAttemptEvent(this.client, this.requireBinding(), event, this.nodeId);
    if (result.status !== "created") throw new Error(`Attempt '${event.attempt_id}' already exists`);
    return event;
  }

  getRecentScope(): RecentScope | undefined {
    const value = this.options.getSetting(recentScopeSetting);
    if (!value || typeof value !== "object") return undefined;
    const scope = value as Partial<RecentScope>;
    if (!scope.documentId || !nodeIdPattern.test(scope.documentId)) return undefined;
    return { documentId: scope.documentId, topicId: scope.topicId };
  }

  saveRecentScope(scope: RecentScope): void {
    this.options.setSetting(recentScopeSetting, scope);
  }

  private requireBinding(): QuestionBankBinding {
    const binding = this.getBinding();
    if (!binding) throw new Error("Damophus is not initialized");
    return binding;
  }
}
