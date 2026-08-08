import { afterEach, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import "@/styles/damophus.css";
import { en } from "@/translations/parts/lets-question-bank";
import type { AttemptAggregate, AttemptEvent, Question, TopicNode } from "@/question-bank/core/types";
import type { PracticeSessionSnapshot } from "@/question-bank/core";
import type { PracticePreferences } from "./practice-preferences";
import type { QuestionIndexPreview } from "@/question-bank/application";
import type {
  QuestionBankBinding,
  QuestionBankInitializationPreview,
  QuestionBankRebindingPreview,
  TopicRelationPreview,
  TopicResourceProjection,
} from "@/question-bank/adapters/siyuan";
import { QUICK_RIFF_DECK_ID, type RiffCard } from "@/question-bank/adapters/siyuan/riff";
import QuestionBank from "./question-bank.svelte";
import type { QuestionBankUiController, RecentScope, SourceBlockIdentity } from "./controller";

export const documentId = "20260804120000-abcdefg";
export const blockId = "20260804120001-abcdefg";
export const systemDocumentId = "20260804110000-system1";

export const topics: TopicNode[] = [
  { id: "root", title: "Root topic", level: 2, childIds: ["child"], explicit: true },
  { id: "child", title: "Child topic", level: 3, parentId: "root", childIds: [], explicit: true },
];

export const objectiveQuestion: Question = {
  id: "q-objective",
  type: "multiple",
  title: "Objective question",
  stemMarkdown: "Select the correct options.",
  options: [
    { id: "A", markdown: "Alpha" },
    { id: "B", markdown: "Beta" },
    { id: "C", markdown: "Gamma" },
  ],
  answer: { kind: "options", optionIds: ["A", "C"] },
  solutionMarkdown: "**Answer:** A and C",
  metadata: { topicId: "child", topicPath: ["Root topic", "Child topic"] },
};

export const indefiniteQuestion: Question = {
  ...objectiveQuestion,
  id: "q-indefinite",
  type: "indefinite",
  title: "Indefinite question",
  answer: { kind: "options", optionIds: ["A"] },
};

export const subjectiveQuestion: Question = {
  id: "q-subjective",
  type: "subjective",
  title: "Subjective question",
  stemMarkdown: "Explain the rule.",
  options: [],
  solutionMarkdown: "Reference answer.",
  metadata: { topicId: "root", topicPath: ["Root topic"] },
};

export const dueCard: RiffCard = {
  deckID: QUICK_RIFF_DECK_ID,
  cardID: "card-1",
  blockID: blockId,
  lapses: 0,
  reps: 1,
  state: 2,
  lastReview: 1785825600000,
  nextDues: { "1": "1 minute", "2": "6 minutes", "3": "1 day", "4": "4 days" },
};

export function makePreview(questions: Question[] = [objectiveQuestion, subjectiveQuestion]): QuestionIndexPreview {
  return {
    token: "preview-token",
    generatedAt: "2026-08-04T12:00:00.000Z",
    documentId,
    scan: {
      documentId,
      kramdown: "",
      report: {
        document: { questions, topics, groups: [] },
        inferences: [],
        conflicts: [],
        issues: [],
        ialUpdates: [],
      },
      blockIdsByQuestionId: new Map(questions.map((question) => [question.id, blockId])),
      topicBlockIdsByTopicId: new Map([
        ["root", "20260804120002-abcdefg"],
        ["child", "20260804120003-abcdefg"],
      ]),
      ialWriteActions: [],
      sourceIssues: [],
    },
    actions: questions.map((question) => ({ kind: "add" as const, question, blockId })),
    staleQuestionIds: [],
    blockers: [],
    bindingRepairs: [],
    ialWriteActions: [],
    results: [],
  };
}

function initializationPreview(): QuestionBankInitializationPreview {
  return {
    token: "init-token",
    notebookId: "20260804110000-abcdefg",
    path: "/Damophus",
    questionBlockId: "20260804110001-abcdefg",
    questionAvId: "20260804110002-abcdefg",
    topicBlockId: "20260804110003-abcdefg",
    topicAvId: "20260804110004-abcdefg",
    attemptBlockId: "20260804110005-abcdefg",
    attemptAvId: "20260804110006-abcdefg",
    questionColumns: [],
    topicColumns: [],
    attemptColumns: [],
  };
}

function binding(): QuestionBankBinding {
  return { schemaVersion: 2 } as unknown as QuestionBankBinding;
}

function rebindingPreview(): QuestionBankRebindingPreview {
  return { token: "rebind-token", systemDocumentId, binding: binding(), bindingRepairs: [] };
}

export function attempt(input: Parameters<QuestionBankUiController["submitAttempt"]>[0]): AttemptEvent {
  return {
    schema_version: 1,
    attempt_id: "attempt-1",
    question_id: input.questionId,
    question_relation: input.questionRelation,
    session_id: input.sessionId,
    answered_at: "2026-08-04T12:00:00.000Z",
    question_type: input.questionType,
    option_order: input.optionOrder ?? [],
    selected_option_ids: input.selectedOptionIds ?? [],
    objective_correct: input.objectiveCorrect,
    mastery_rating: input.masteryRating,
    subjective_score: input.subjectiveScore,
    duration_ms: input.durationMs,
  };
}

export function mockController(options: {
  initialized?: boolean;
  preview?: QuestionIndexPreview;
  dueCards?: ReadonlyMap<string, RiffCard>;
  recent?: RecentScope;
  aggregates?: ReadonlyMap<string, AttemptAggregate>;
  sourceIdentity?: SourceBlockIdentity;
  topicRelationPreview?: TopicRelationPreview;
  topicRelationConfirmResult?: TopicRelationPreview;
  topicResources?: TopicResourceProjection[];
  practicePreferences?: PracticePreferences;
} = {}) {
  let currentBinding = options.initialized === false ? undefined : binding();
  let recent = options.recent;
  let practicePreferences = options.practicePreferences ?? {
    order: "sequential" as const,
    optionOrder: "random" as const,
    filter: "all" as const,
  };
  const practiceSessions = new Map<string, PracticeSessionSnapshot>();
  const sessionAttempts: AttemptEvent[] = [];
  const preview = options.preview ?? makePreview();
  const submitAttempt = vi.fn(async (
    input: Parameters<QuestionBankUiController["submitAttempt"]>[0],
    _dueCard?: RiffCard,
  ) => ({
    event: attempt(input),
    warnings: [],
  }));
  const saveRecentScope = vi.fn((scope: RecentScope) => { recent = scope; });
  const previewImport = vi.fn(async () => ({
    token: "import-token",
    schemaVersion: 1 as const,
    pluginVersion: "0.25.3",
    total: 3,
    importable: 1,
    duplicateAttemptIds: ["duplicate-1"],
    orphanQuestionIds: ["missing-question"],
    existingRowIssues: [],
  }));
  const confirmImport = vi.fn(async () => ({
    ...(await previewImport()),
    imported: 1,
    failures: [],
  }));
  const previewTopicRelationSync = vi.fn(async () => options.topicRelationPreview ?? ({
    token: "topic-relation-token",
    generatedAt: "2026-08-07T12:00:00.000Z",
    mode: "merge" as const,
    assignments: [],
    actions: [],
    issues: [],
    results: [],
  }));
  const confirmTopicRelationSync = vi.fn(async () => options.topicRelationConfirmResult ?? options.topicRelationPreview ?? ({
    token: "topic-relation-token",
    generatedAt: "2026-08-07T12:00:00.000Z",
    mode: "merge" as const,
    assignments: [],
    actions: [],
    issues: [],
    results: [],
  }));
  const persistQuestionTopicResource = vi.fn(async (input: Parameters<NonNullable<QuestionBankUiController["persistQuestionTopicResource"]>>[0]) => ({
    blockId: "20260807160000-persist",
    resourceIdentity: `${input.projection.topicId}:persisted`,
  }));
  const controller: QuestionBankUiController = {
    getBinding: () => currentBinding,
    previewInitialization: vi.fn(async () => initializationPreview()),
    confirmInitialization: vi.fn(async () => {
      currentBinding = binding();
      return currentBinding;
    }),
    previewRebinding: vi.fn(async () => rebindingPreview()),
    confirmRebinding: vi.fn(async () => {
      currentBinding = binding();
      return currentBinding;
    }),
    loadSourceIdentity: vi.fn(async () => options.sourceIdentity ?? ({
      id: documentId,
      rootId: documentId,
      type: "d",
      content: "2021 Civil Procedure Gold Questions",
      hpath: "/Legal Exam/Civil Procedure/2021 Gold Questions",
    })),
    listPracticeSessions: vi.fn(async () => [...practiceSessions.entries()].map(([sourceKey, snapshot]) => ({
      sourceKey,
      result: { status: "ok" as const, snapshot },
    }))),
    loadPracticeSession: vi.fn(async (sourceKey: string) => {
      const snapshot = practiceSessions.get(sourceKey);
      return snapshot ? { status: "ok" as const, snapshot } : undefined;
    }),
    savePracticeSession: vi.fn(async (snapshot: PracticeSessionSnapshot) => {
      practiceSessions.set(snapshot.source_key, structuredClone(snapshot));
    }),
    removePracticeSession: vi.fn(async (sourceKey: string) => {
      practiceSessions.delete(sourceKey);
    }),
    exportPracticeSessionDiagnostic: vi.fn(async (sourceKey: string) => JSON.stringify(practiceSessions.get(sourceKey))),
    acquirePracticeSession: vi.fn(async () => true),
    releasePracticeSession: vi.fn(async () => undefined),
    loadSessionAttempts: vi.fn(async (sessionId: string) => sessionAttempts.filter((event) => event.session_id === sessionId)),
    previewSync: vi.fn(async () => preview),
    confirmSync: vi.fn(async () => preview),
    previewTopicRelationSync,
    confirmTopicRelationSync,
    loadQuestionTopicResources: vi.fn(async () => options.topicResources ?? []),
    persistQuestionTopicResource,
    loadAggregates: vi.fn(async () => options.aggregates ?? new Map([
      [objectiveQuestion.id, {
        questionId: objectiveQuestion.id,
        attempts: 1,
        timedAttempts: 0,
        totalDurationMs: 0,
        objectiveAttempts: 1,
        objectiveCorrect: 0,
        objectiveIncorrect: 1,
        consecutiveReviewCount: 2,
        consecutiveAgainCount: 2,
        consecutiveHardCount: 0,
      }],
    ])),
    loadDueCards: vi.fn(async () => options.dueCards ?? new Map()),
    exportAttempts: vi.fn(async () => "{}\n"),
    previewImport,
    confirmImport,
    submitAttempt: vi.fn(async (...args: Parameters<QuestionBankUiController["submitAttempt"]>) => {
      const result = await submitAttempt(...args);
      sessionAttempts.push(result.event);
      return result;
    }),
    getRecentScope: () => recent,
    saveRecentScope,
    getPracticePreferences: () => practicePreferences,
    savePracticePreferences: vi.fn((value: PracticePreferences) => { practicePreferences = value; }),
  };
  return {
    controller,
    submitAttempt,
    saveRecentScope,
    previewImport,
    confirmImport,
    previewTopicRelationSync,
    confirmTopicRelationSync,
    persistQuestionTopicResource,
    savePracticePreferences: vi.mocked(controller.savePracticePreferences),
    practiceSessions,
    sessionAttempts,
  };
}

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  await page.viewport(1024, 768);
});

export function render(controller: QuestionBankUiController, props: Record<string, unknown> = {}): void {
  const target = document.createElement("div");
  target.style.height = "100vh";
  document.body.appendChild(target);
  mounted = mount(QuestionBank, {
    target,
    props: {
      controller,
      initialDocumentId: documentId,
      translations: en,
      uuid: () => "session-1",
      ...props,
    },
  });
}

export async function flush(): Promise<void> {
  await Promise.resolve();
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
}

export function button(name: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === name || item.getAttribute("aria-label") === name);
  if (!result) throw new Error(`Missing button '${name}'`);
  return result;
}

export function option(name: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button.option")]
    .find((item) => item.textContent?.includes(name));
  if (!result) throw new Error(`Missing option '${name}'`);
  return result;
}

export async function selectScope(name: string): Promise<void> {
  await page.getByRole("button", { name: "Entire document", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await flush();
}

export async function scan(): Promise<void> {
  button("Scan document").click();
  await flush();
}

export async function scanAndSync(): Promise<void> {
  await scan();
  button("Confirm index sync").click();
  await flush();
}
