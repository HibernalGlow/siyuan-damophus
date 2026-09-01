import { questionOptionsFromOrder, restoreQuestionOptions } from "@/question-bank/core/shuffle";
import {
  createPracticeOptionOrder,
  createPracticeQueue,
  type PracticeOptionOrder,
  type PracticeOrder,
} from "@/question-bank/application/practice";
import { PracticeSessionRuntime } from "@/question-bank/application/practice-runtime";
import {
  replacePracticeSession,
  resumePracticeSession,
  startPracticeSession,
  type PracticeSessionActivation,
} from "@/question-bank/application/practice-lifecycle";
import {
  createPracticeSessionSnapshot,
  type PracticeSessionRecoveryIssue,
  type PracticeSessionSnapshot,
} from "@/question-bank/core";
import type { PracticeFilter } from "@/question-bank/core/scope";
import type {
  AttemptAggregate,
  ObjectiveAnswer,
  Question,
  QuestionBookmark,
  ShuffledOption,
  ShuffledQuestion,
  TopicNode,
} from "@/question-bank/core/types";
import type { RiffCard } from "@/question-bank/adapters/siyuan/riff";
import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
import type { QuestionBankUiController, SourceBlockIdentity } from "../controller";
import type { PracticeSessionActorSnapshot, PracticeSessionSaveStatus } from "@/question-bank/application/practice-runtime";
import type { StoredPracticeSession } from "../session-host";

/** Live view of the component state the practice-session flows drive. */
export interface PracticeSessionActionsState {
  practiceRuntime: PracticeSessionRuntime | undefined;
  practiceState: PracticeSessionActorSnapshot | undefined;
  sessionId: string;
  queue: Question[];
  completedQuestionIndices: number[];
  questionIndex: number;
  complete: boolean;
  submitting: boolean;
  timerNow: number;
  currentQuestion: Question | undefined;
  currentQuestionBlockId: string | undefined;
  shuffled: ShuffledQuestion | undefined;
  displayedOptions: ShuffledOption[];
  selectedOptionIds: string[];
  revealed: boolean;
  objectiveCorrect: boolean | null;
  subjectiveScore: number | undefined;
  rootElement: HTMLElement | undefined;
  questions: Question[];
  practiceSourceQuestions: Question[];
  topics: TopicNode[];
  topicId: string;
  filter: PracticeFilter;
  order: PracticeOrder;
  optionOrder: PracticeOptionOrder;
  aggregates: ReadonlyMap<string, AttemptAggregate>;
  dueCards: ReadonlyMap<string, RiffCard>;
  bookmarks: ReadonlyMap<string, QuestionBookmark>;
  reviewThreshold: number;
  documentId: string;
  preview: QuestionIndexPreview | undefined;
  assembledQuestions: Question[] | undefined;
  assembledBlockIdsByQuestionId: ReadonlyMap<string, string>;
  assembledSourceKey: string;
  assembledSourceLabel: string;
  sourceIdentity: SourceBlockIdentity | undefined;
  recoverableSession: PracticeSessionSnapshot | undefined;
  recoveryIssues: PracticeSessionRecoveryIssue[];
  pendingReplacement: boolean;
  endConfirmation: boolean;
  answerCardOpen: boolean;
  practiceSaveStatus: PracticeSessionSaveStatus;
  practiceSaveError: string;
  error: string;
}

export function createPracticeSessionActions(deps: {
  state: PracticeSessionActionsState;
  controller: QuestionBankUiController;
  run: (operation: () => Promise<void>) => Promise<void>;
  label: (key: string, fallback: string) => string;
  now: () => number;
  uuid: () => string;
  random: () => number;
  prepareSourceBlock: ((blockId: string) => Promise<void>) | undefined;
  getQuestionRenderMode: () => "html" | "native" | "embed";
  getPauseOnAnswerReveal: () => boolean;
  refreshStoredSessions: () => Promise<void>;
  timer: { startTimer(): void; clearTimer(): void; clearAutoPaused(): void };
  scan: {
    invalidateDocumentTarget(): void;
    scanDocument(revealScanSummary?: boolean): void;
  };
}) {
  const { state, controller, run } = deps;
  let unsubscribePracticeState: (() => void) | undefined;
  let unsubscribeSaveStatus: (() => void) | undefined;
  let completionHandledSessionId = "";
  let sourcePreloadTimer: ReturnType<typeof setTimeout> | undefined;

  function syncPracticeView(snapshot: PracticeSessionActorSnapshot): void {
    state.practiceState = snapshot;
    const session = snapshot.context.session;
    state.sessionId = session.session_id;
    state.queue = session.queue_question_ids
      .map((questionId) => state.questions.find((question) => question.id === questionId))
      .filter((question): question is Question => Boolean(question));
    state.completedQuestionIndices = session.completed_question_ids
      .map((questionId) => session.queue_question_ids.indexOf(questionId))
      .filter((index) => index >= 0);
    state.questionIndex = Math.max(0, session.queue_question_ids.indexOf(session.current_question_id));
    state.complete = snapshot.matches("completed");
    state.submitting = snapshot.matches("submitting");
    state.timerNow = deps.now();
    const host = state.rootElement?.closest<HTMLElement>(".damophus-question-bank-host, .damophus-question-bank-dialog");
    if (host) host.dataset.practiceActive = String(
      snapshot.matches("active") || snapshot.matches("paused") || snapshot.matches("reviewing"),
    );
    state.currentQuestion = state.complete ? undefined : state.queue[state.questionIndex];
    if (!state.currentQuestion) {
      state.shuffled = undefined;
      state.displayedOptions = [];
      return;
    }

    const draft = session.drafts[state.currentQuestion.id];
    const attempt = snapshot.context.attemptsByQuestionId[state.currentQuestion.id];
    state.shuffled = questionOptionsFromOrder(state.currentQuestion, attempt?.option_order ?? draft?.option_order ?? []);
    state.selectedOptionIds = [...(attempt?.selected_option_ids ?? draft?.selected_option_ids ?? [])];
    state.revealed = Boolean(attempt) || Boolean(draft?.revealed);
    state.objectiveCorrect = attempt?.objective_correct ?? draft?.objective_correct ?? null;
    state.subjectiveScore = attempt?.subjective_score ?? draft?.subjective_score;
    state.displayedOptions = state.revealed ? restoreQuestionOptions(state.currentQuestion, state.shuffled) : state.shuffled.options;
    scheduleSourcePreload();
  }

  function sourceBlockId(question: Question | undefined): string | undefined {
    return question
      ? (state.assembledQuestions ? state.assembledBlockIdsByQuestionId : state.preview?.scan.blockIdsByQuestionId)?.get(question.id)
      : undefined;
  }

  function correctCurrentAnswer(answer: ObjectiveAnswer): void {
    const question = state.currentQuestion;
    const blockId = state.currentQuestionBlockId;
    if (!question || !blockId || !controller.correctQuestionAnswer || !question.answer) return;
    void run(async () => {
      await controller.correctQuestionAnswer!(blockId, question, answer);
      const updated = { ...question, answer };
      state.queue = state.queue.map((item) => item.id === updated.id ? updated : item);
      state.currentQuestion = updated;
    });
  }

  function scheduleSourcePreload(): void {
    if (sourcePreloadTimer) clearTimeout(sourcePreloadTimer);
    sourcePreloadTimer = undefined;
    if (deps.getQuestionRenderMode() === "html" || !deps.prepareSourceBlock) return;
    const currentBlockId = sourceBlockId(state.currentQuestion);
    if (currentBlockId) void deps.prepareSourceBlock(currentBlockId);
    const nextBlockId = sourceBlockId(state.queue[state.questionIndex + 1]);
    if (!nextBlockId) return;
    sourcePreloadTimer = setTimeout(() => {
      void deps.prepareSourceBlock?.(nextBlockId);
    }, 50);
  }

  async function activateRuntime(activation: PracticeSessionActivation): Promise<void> {
    const { snapshot, attempts, persistedRevision } = activation;
    unsubscribePracticeState?.();
    unsubscribeSaveStatus?.();
    if (state.practiceRuntime) await state.practiceRuntime.dispose();
    completionHandledSessionId = "";
    const runtime = new PracticeSessionRuntime({
      host: controller,
      input: { snapshot, attempts, now: deps.now(), pauseOnAnswerReveal: deps.getPauseOnAnswerReveal() },
      persistedRevision,
    });
    state.practiceRuntime = runtime;
    unsubscribePracticeState = runtime.subscribeState((subscribed) => {
      syncPracticeView(subscribed);
      if (subscribed.matches("completed") && completionHandledSessionId !== subscribed.context.session.session_id) {
        completionHandledSessionId = subscribed.context.session.session_id;
        deps.timer.clearTimer();
        void runtime.complete()
          .then(deps.refreshStoredSessions)
          .catch((reason) => { state.error = reason instanceof Error ? reason.message : String(reason); });
      }
    });
    unsubscribeSaveStatus = runtime.subscribeSaveStatus((status, reason) => {
      state.practiceSaveStatus = status;
      state.practiceSaveError = reason?.message ?? "";
    });
    state.recoverableSession = undefined;
    state.recoveryIssues = activation.recoveryIssues;
    state.pendingReplacement = false;
    state.endConfirmation = false;
    state.answerCardOpen = false;
    if (!runtime.actor.getSnapshot().matches("completed")) deps.timer.startTimer();
  }


  function practiceQueue(filterOverride: PracticeFilter = state.filter): Question[] {
    if (state.assembledQuestions) return [...state.assembledQuestions];
    return createPracticeQueue({
      questions: state.questions,
      topics: state.topics,
      rootTopicId: state.topicId || undefined,
      filter: filterOverride,
      order: state.order,
      aggregates: state.aggregates,
      dueQuestionIds: new Set([...state.dueCards.keys()]),
      bookmarkedQuestionIds: new Set([...state.bookmarks.keys()].filter((id) => !state.bookmarks.get(id)?.isArchived)),
      reviewThreshold: state.reviewThreshold,
      random: deps.random,
    });
  }

  function startPractice(): void {
    if (!state.preview) return;
    const nextQueue = practiceQueue();
    if (nextQueue.length === 0) {
      state.queue = [];
      state.complete = true;
      deps.timer.clearTimer();
      return;
    }
    if (state.recoverableSession) {
      state.pendingReplacement = true;
      return;
    }
    void run(() => beginNewPractice(nextQueue));
  }

  // Launches a redo session scoped to active bookmarks without touching the
  // user's workspace filter selection (the launcher button passes the DOM
  // event straight through, so startPractice must stay zero-arg).
  function startBookmarkPractice(): void {
    if (!state.preview) return;
    const nextQueue = practiceQueue("bookmarked");
    if (nextQueue.length === 0) return;
    if (state.recoverableSession) {
      state.pendingReplacement = true;
      return;
    }
    void run(() => beginNewPractice(nextQueue, undefined, undefined, "bookmarked"));
  }

  async function beginNewPractice(
    nextQueue = practiceQueue(),
    sourceKey = state.assembledSourceKey || state.documentId,
    sourceLabel = state.assembledSourceLabel || state.sourceIdentity?.content,
    filterOverride?: PracticeFilter,
  ): Promise<void> {
    if ((!state.preview && !state.assembledQuestions) || nextQueue.length === 0) return;
    if (deps.getQuestionRenderMode() !== "html" && deps.prepareSourceBlock) {
      const initialBlockIds = nextQueue.slice(0, 2)
        .map((question) => sourceBlockId(question))
        .filter((blockId): blockId is string => Boolean(blockId));
      await Promise.allSettled(initialBlockIds.map((blockId) => deps.prepareSourceBlock!(blockId)));
    }
    await startPracticeSession({
      host: controller,
      sourceKey,
      createSnapshot: () => createNewPracticeSnapshot(nextQueue, sourceKey, sourceLabel, filterOverride),
      activate: activateRuntime,
    });
  }

  function createNewPracticeSnapshot(
    nextQueue = practiceQueue(),
    sourceKey = state.assembledSourceKey || state.documentId,
    sourceLabel = state.assembledSourceLabel || state.sourceIdentity?.content,
    filterOverride?: PracticeFilter,
  ): PracticeSessionSnapshot {
    if ((!state.preview && !state.assembledQuestions) || nextQueue.length === 0) throw new Error("A practice session requires at least one question");
    if (!state.assembledQuestions && state.preview) {
      controller.saveRecentScope({
        documentId: state.documentId,
        headingBlockId: state.topicId ? state.preview.scan.topicBlockIdsByTopicId.get(state.topicId) : undefined,
      });
    }
    return createPracticeSessionSnapshot({
      sessionId: deps.uuid(),
      sourceKey,
      sourceLabel,
      scopeId: state.assembledQuestions ? undefined : state.topicId || undefined,
      filter: state.assembledQuestions ? "all" : filterOverride ?? state.filter,
      order: state.assembledQuestions ? "sequential" : state.order,
      queue: nextQueue.map((question) => ({
        question,
        optionOrder: createPracticeOptionOrder(
          question,
          state.assembledQuestions ? "random" : state.optionOrder,
          deps.random,
        ),
      })),
      now: new Date(deps.now()),
    });
  }

  function resumePractice(): void {
    const snapshot = state.recoverableSession;
    if (!snapshot || (!state.preview && !state.assembledQuestions)) return;
    void run(async () => {
      await resumePracticeSession({
        host: controller,
        snapshot,
        questions: state.practiceSourceQuestions,
        now: new Date(deps.now()),
        activate: activateRuntime,
      });
    });
  }

  function confirmRestartPractice(): void {
    const previous = state.recoverableSession;
    if (!previous) {
      state.pendingReplacement = false;
      return;
    }
    void run(async () => {
      await replacePracticeSession({
        host: controller,
        previous,
        createSnapshot: createNewPracticeSnapshot,
        activate: activateRuntime,
      });
      await deps.refreshStoredSessions();
    });
  }

  function goToQuestion(index: number): void {
    const questionId = state.practiceState?.context.session.queue_question_ids[index];
    if (!state.practiceRuntime || !questionId || (index === state.questionIndex && !state.practiceState?.matches("completed"))) {
      state.answerCardOpen = false;
      return;
    }
    state.practiceRuntime.actor.send({
      type: state.practiceState?.matches("completed") ? "REVIEW" : "NAVIGATE",
      questionId,
      now: deps.now(),
    });
    state.answerCardOpen = false;
  }

  function previousQuestion(): void {
    if (state.questionIndex > 0) goToQuestion(state.questionIndex - 1);
  }

  function nextQuestion(): void {
    if (state.questionIndex < state.queue.length - 1) goToQuestion(state.questionIndex + 1);
  }

  function pausePractice(): void {
    if (!state.practiceRuntime || !state.practiceState?.matches("active")) return;
    void run(async () => {
      const runtime = state.practiceRuntime!;
      await runtime.pause(deps.now());
      await leavePracticeRuntime(runtime);
      await deps.refreshStoredSessions();
    });
  }

  function requestEndPractice(): void {
    state.endConfirmation = true;
  }

  function confirmEndPractice(): void {
    if (!state.practiceRuntime) return;
    void run(async () => {
      const runtime = state.practiceRuntime!;
      await runtime.end(deps.now());
      await leavePracticeRuntime(runtime);
      await deps.refreshStoredSessions();
    });
  }

  async function leavePracticeRuntime(runtime?: PracticeSessionRuntime): Promise<void> {
    deps.timer.clearTimer();
    deps.timer.clearAutoPaused();
    unsubscribePracticeState?.();
    unsubscribePracticeState = undefined;
    unsubscribeSaveStatus?.();
    unsubscribeSaveStatus = undefined;
    if (runtime) await runtime.dispose();
    if (state.practiceRuntime === runtime) state.practiceRuntime = undefined;
    state.practiceState = undefined;
    state.queue = [];
    state.currentQuestion = undefined;
    state.complete = false;
    state.answerCardOpen = false;
    state.completedQuestionIndices = [];
    state.endConfirmation = false;
  }

  function retryPracticeSave(): void {
    if (!state.practiceRuntime) return;
    void run(() => state.practiceRuntime!.retrySave());
  }

  function openStoredSession(stored: StoredPracticeSession): void {
    const parsedStored = stored.result;
    if (parsedStored.status === "ok"
      && controller.hydrateQuestionSources
      && !/^\d{14}-[a-z0-9]{7}$/u.test(stored.sourceKey)) {
      void run(async () => {
        const hydrated = await controller.hydrateQuestionSources!(parsedStored.snapshot.queue_question_ids);
        state.assembledQuestions = hydrated.questions;
        state.assembledBlockIdsByQuestionId = hydrated.blockIdsByQuestionId;
        state.assembledSourceKey = stored.sourceKey;
        state.assembledSourceLabel = parsedStored.snapshot.source_label ?? deps.label("questionSet", "跨文档组卷");
        await resumePracticeSession({
          host: controller,
          snapshot: parsedStored.snapshot,
          questions: hydrated.questions,
          now: new Date(deps.now()),
          activate: activateRuntime,
        });
      });
      return;
    }
    state.documentId = stored.sourceKey;
    deps.scan.invalidateDocumentTarget();
    deps.scan.scanDocument(false);
  }

  function resetPractice(): void {
    void run(async () => {
      await leavePracticeRuntime();
      state.error = "";
      state.aggregates = await controller.loadAggregates();
      await deps.refreshStoredSessions();
    });
  }

  function exitReview(): void {
    state.practiceRuntime?.actor.send({ type: "EXIT_REVIEW", now: deps.now() });
  }

  function dispose(): void {
    unsubscribePracticeState?.();
    unsubscribePracticeState = undefined;
    unsubscribeSaveStatus?.();
    unsubscribeSaveStatus = undefined;
    if (sourcePreloadTimer) clearTimeout(sourcePreloadTimer);
    if (state.practiceRuntime) void state.practiceRuntime.dispose();
  }

  return {
    sourceBlockId,
    correctCurrentAnswer,
    practiceQueue,
    startPractice,
    startBookmarkPractice,
    beginNewPractice,
    resumePractice,
    confirmRestartPractice,
    goToQuestion,
    previousQuestion,
    nextQuestion,
    pausePractice,
    requestEndPractice,
    confirmEndPractice,
    retryPracticeSave,
    openStoredSession,
    resetPractice,
    exitReview,
    dispose,
  };
}
