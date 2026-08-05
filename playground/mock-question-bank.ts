import type {
  AttemptImportPreview,
  AttemptImportResult,
  QuestionIndexPreview,
} from "@/question-bank/application";
import type {
  QuestionBankBinding,
  QuestionBankInitializationPreview,
  QuestionBankRebindingPreview,
  RiffCard,
} from "@/question-bank/adapters/siyuan";
import type { NewAttemptInput } from "@/question-bank/core/attempts";
import type { PracticeSessionSnapshot, PracticeSessionSnapshotParseResult } from "@/question-bank/core";
import type { AttemptEvent, Question, TopicNode } from "@/question-bank/core/types";
import type {
  AttemptSubmissionResult,
  QuestionBankUiController,
  RecentScope,
  SourceBlockIdentity,
} from "@/lets-question-bank/controller";
import type { StoredPracticeSession } from "@/lets-question-bank/session-host";

const documentId = "20260805120000-damodev";
const systemDocumentId = "20260805110000-system1";
const blockIds = {
  objective: "20260805120001-object1",
  judgment: "20260805120002-judge01",
  subjective: "20260805120003-subject",
  single: "20260805120004-single1",
  indefinite: "20260805120005-indef1",
};

const topics: TopicNode[] = [
  { id: "civil", title: "民法", level: 2, childIds: ["contract"], explicit: true },
  { id: "contract", title: "合同效力", level: 3, parentId: "civil", childIds: [], explicit: true },
  { id: "procedure", title: "民事诉讼法", level: 2, childIds: [], explicit: true },
];

const questions: Question[] = [
  {
    id: "dev-objective",
    type: "multiple",
    title: "合同效力判断",
    stemMarkdown: "甲无权代理乙与丙订立合同。关于该合同效力，下列哪些说法正确？",
    options: [
      { id: "A", markdown: "乙追认前，丙有权催告乙在合理期限内追认。" },
      { id: "B", markdown: "乙追认前，善意的丙有撤销权。" },
      { id: "C", markdown: "乙拒绝追认后，合同自始无效。" },
      { id: "D", markdown: "只要甲事后取得代理权，合同当然对乙生效。" },
    ],
    answer: { kind: "options", optionIds: ["A", "B", "C"] },
    solutionMarkdown: "**答案：ABC。** 无权代理须经被代理人追认才对其发生效力；相对人享有催告权，善意相对人在追认前享有撤销权。",
    metadata: { topicId: "contract", topicPath: ["民法", "合同效力"] },
  },
  {
    id: "dev-judgment",
    type: "true-false",
    title: "举证责任",
    stemMarkdown: "当事人对自己提出的主张，有责任提供证据。",
    options: [],
    answer: { kind: "boolean", value: true },
    solutionMarkdown: "正确。这是民事诉讼举证责任的一般规则。",
    metadata: { topicId: "procedure", topicPath: ["民事诉讼法", "证据"] },
  },
  {
    id: "dev-subjective",
    type: "subjective",
    title: "请求权基础分析",
    stemMarkdown: "请简要说明合同解除后损害赔偿请求权的审查顺序。",
    options: [],
    solutionMarkdown: "可依次审查：解除是否有效、损害是否存在、因果关系、可预见性及减损规则。",
    metadata: { topicId: "contract", topicPath: ["民法", "合同效力"] },
  },
  {
    id: "dev-single",
    type: "single",
    title: "撤销权行使",
    stemMarkdown: "下列关于善意相对人撤销权的说法，哪一项正确？",
    options: [
      { id: "A", markdown: "只能在被代理人追认后行使。" },
      { id: "B", markdown: "应当在被代理人追认前行使。" },
      { id: "C", markdown: "不以通知方式作出。" },
      { id: "D", markdown: "恶意相对人同样享有撤销权。" },
    ],
    answer: { kind: "options", optionIds: ["B"] },
    solutionMarkdown: "**答案：B。** 善意相对人可以在被代理人追认前撤销合同。",
    metadata: { topicId: "contract", topicPath: ["民法", "合同效力"] },
  },
  {
    id: "dev-indefinite",
    type: "indefinite",
    title: "无权代理综合判断",
    stemMarkdown: "关于无权代理，下列说法正确的有几项？",
    options: [
      { id: "A", markdown: "被代理人可以追认。" },
      { id: "B", markdown: "善意相对人可以在追认前撤销。" },
      { id: "C", markdown: "相对人不得催告被代理人追认。" },
      { id: "D", markdown: "行为必然对被代理人发生效力。" },
    ],
    answer: { kind: "options", optionIds: ["A", "B"] },
    solutionMarkdown: "**答案：AB。** 不定项题允许一个或多个正确选项。",
    metadata: { topicId: "contract", topicPath: ["民法", "合同效力"] },
  },
];

function createPreview(): QuestionIndexPreview {
  const ids = new Map([
    [questions[0].id, blockIds.objective],
    [questions[1].id, blockIds.judgment],
    [questions[2].id, blockIds.subjective],
    [questions[3].id, blockIds.single],
    [questions[4].id, blockIds.indefinite],
  ]);
  return {
    token: "dev-preview-token",
    generatedAt: new Date().toISOString(),
    documentId,
    scan: {
      documentId,
      kramdown: "",
      report: {
        document: { questions, topics, groups: [] },
        inferences: [{
          code: "dev-inferred-type",
          message: "已从题目标题推断出多选题类型",
          questionId: questions[0].id,
          line: 12,
          title: questions[0].title,
          sourceMarkdown: `##### ${questions[0].title}`,
        }],
        conflicts: [],
        issues: [],
        ialUpdates: [],
      },
      blockIdsByQuestionId: ids,
      topicBlockIdsByTopicId: new Map([
        ["civil", "20260805120010-civil00"],
        ["contract", "20260805120011-contract"],
        ["procedure", "20260805120012-procedu"],
      ]),
      ialWriteActions: [],
      sourceIssues: [],
    },
    actions: questions.map((question) => ({
      kind: "add" as const,
      question,
      blockId: ids.get(question.id) as string,
    })),
    staleQuestionIds: [],
    blockers: [],
    bindingRepairs: [],
    ialWriteActions: [],
    results: [],
  };
}

function createAttempt(input: Omit<NewAttemptInput, "attemptId">): AttemptEvent {
  return {
    schema_version: 1,
    attempt_id: crypto.randomUUID(),
    question_id: input.questionId,
    question_relation: input.questionRelation,
    session_id: input.sessionId,
    answered_at: new Date().toISOString(),
    question_type: input.questionType,
    option_order: input.optionOrder ?? [],
    selected_option_ids: input.selectedOptionIds ?? [],
    objective_correct: input.objectiveCorrect,
    mastery_rating: input.masteryRating,
    subjective_score: input.subjectiveScore,
    duration_ms: input.durationMs,
  };
}

const binding = { schemaVersion: 2 } as unknown as QuestionBankBinding;

export const devDocumentId = documentId;

export class DevQuestionBankController implements QuestionBankUiController {
  private recentScope: RecentScope | undefined;
  private readonly preview = createPreview();
  private synchronized = false;
  private practiceSession: PracticeSessionSnapshot | undefined;
  private readonly attempts: AttemptEvent[] = [];

  getBinding(): QuestionBankBinding {
    return binding;
  }

  async previewInitialization(): Promise<QuestionBankInitializationPreview> {
    return {
      token: "dev-init-token",
      notebookId: "20260805110000-noteboo",
      path: "/Damophus Dev",
      questionBlockId: "20260805110001-questio",
      questionAvId: "20260805110002-questav",
      attemptBlockId: "20260805110003-attempt",
      attemptAvId: "20260805110004-attempt",
      questionColumns: [],
      attemptColumns: [],
    };
  }

  async confirmInitialization(): Promise<QuestionBankBinding> {
    return binding;
  }

  async previewRebinding(): Promise<QuestionBankRebindingPreview> {
    return { token: "dev-rebind-token", systemDocumentId, binding, bindingRepairs: [] };
  }

  async confirmRebinding(): Promise<QuestionBankBinding> {
    return binding;
  }

  async loadSourceIdentity(): Promise<SourceBlockIdentity> {
    return {
      id: documentId,
      rootId: documentId,
      type: "d",
      content: "2021 Civil Procedure Gold Questions",
      hpath: "/Legal Exam/Civil Procedure/2021 Gold Questions",
    };
  }

  async listPracticeSessions(): Promise<StoredPracticeSession[]> {
    return this.practiceSession ? [{
      sourceKey: this.practiceSession.source_key,
      result: { status: "ok", snapshot: structuredClone(this.practiceSession) },
    }] : [];
  }

  async loadPracticeSession(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined> {
    return this.practiceSession?.source_key === sourceKey
      ? { status: "ok", snapshot: structuredClone(this.practiceSession) }
      : undefined;
  }

  async savePracticeSession(snapshot: PracticeSessionSnapshot): Promise<void> {
    this.practiceSession = structuredClone(snapshot);
  }

  async removePracticeSession(sourceKey: string, sessionId?: string): Promise<void> {
    if (this.practiceSession?.source_key !== sourceKey) return;
    if (sessionId && this.practiceSession.session_id !== sessionId) return;
    this.practiceSession = undefined;
  }

  async exportPracticeSessionDiagnostic(): Promise<string> {
    return JSON.stringify(this.practiceSession, null, 2);
  }

  async acquirePracticeSession(): Promise<boolean> {
    return true;
  }

  async releasePracticeSession(): Promise<void> {}

  async loadSessionAttempts(sessionId: string): Promise<AttemptEvent[]> {
    return this.attempts.filter((attempt) => attempt.session_id === sessionId);
  }

  async previewSync(): Promise<QuestionIndexPreview> {
    return this.synchronized
      ? { ...this.preview, actions: [], ialWriteActions: [] }
      : this.preview;
  }

  async confirmSync(): Promise<QuestionIndexPreview> {
    this.synchronized = true;
    return {
      ...this.preview,
      actions: [],
      ialWriteActions: [],
      results: this.preview.actions.map((action) => ({
        questionId: action.question.id,
        status: "synced" as const,
      })),
    };
  }

  async loadAggregates() {
    return new Map([
      [questions[0].id, {
        questionId: questions[0].id,
        attempts: 2,
        objectiveAttempts: 2,
        objectiveCorrect: 0,
        objectiveIncorrect: 2,
        consecutiveReviewCount: 2,
        consecutiveAgainCount: 2,
        consecutiveHardCount: 0,
        latestRating: "again" as const,
      }],
    ]);
  }

  async loadDueCards(): Promise<ReadonlyMap<string, RiffCard>> {
    return new Map();
  }

  async exportAttempts(): Promise<string> {
    return JSON.stringify({ schemaVersion: 1, attempts: [] }, null, 2);
  }

  async previewImport(): Promise<AttemptImportPreview> {
    return {
      token: "dev-import-token",
      schemaVersion: 1,
      pluginVersion: "dev",
      total: 3,
      importable: 2,
      duplicateAttemptIds: ["dev-duplicate"],
      orphanQuestionIds: [],
      existingRowIssues: [],
    };
  }

  async confirmImport(): Promise<AttemptImportResult> {
    return {
      ...(await this.previewImport()),
      imported: 2,
      failures: [],
    };
  }

  async submitAttempt(
    input: Omit<NewAttemptInput, "attemptId">,
  ): Promise<AttemptSubmissionResult> {
    const event = createAttempt(input);
    this.attempts.push(event);
    return { event, warnings: [] };
  }

  getRecentScope(): RecentScope | undefined {
    return this.recentScope;
  }

  saveRecentScope(scope: RecentScope): void {
    this.recentScope = scope;
  }
}
