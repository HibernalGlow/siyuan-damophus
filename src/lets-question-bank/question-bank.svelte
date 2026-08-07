<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { BlockBreadcrumbItem } from "@/api";
  import { normalizeBreadcrumbTextDisplay, type BreadcrumbTextDisplay, type BreadcrumbOverflowPriority } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
  import { getLogger } from "@/libs/logger";
  import {
    questionOptionsFromOrder,
    restoreQuestionOptions,
    shuffleQuestionOptions,
  } from "@/question-bank/core/shuffle";
  import type {
    AttemptAggregate,
    Question,
    QuestionGroup,
    QuestionType,
    ScanMessage,
    ShuffledOption,
    ShuffledQuestion,
  } from "@/question-bank/core/types";
  import { normalizeOptionIds } from "@/question-bank/core/answer";
  import { buildStatistics, type StatisticsRange, type StatisticsSnapshot, type StatisticsSort } from "@/question-bank/core/statistics";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import {
    createPracticeQueue,
    PracticeSessionRuntime,
    replacePracticeSession,
    resumePracticeSession,
    startPracticeSession,
    suggestedMasteryRating,
    type PracticeOrder,
    type PracticeSessionActivation,
    type PracticeSessionActorSnapshot,
    type PracticeSessionSaveStatus,
  } from "@/question-bank/application";
  import {
    createPracticeSessionSnapshot,
    practiceQuestionElapsedMs,
    practiceSessionElapsedMs,
    type PracticeSessionRecoveryIssue,
    type PracticeSessionSnapshot,
  } from "@/question-bank/core";
  import type {
    AttemptImportPreview,
    AttemptImportResult,
    QuestionIndexBatchPreview,
    QuestionIndexPreview,
  } from "@/question-bank/application";
  import type {
    QuestionBankInitializationPreview,
    QuestionBankRebindingPreview,
  } from "@/question-bank/adapters/siyuan";
  import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
  import type { FrozenQuestionSet, QuestionCatalogEntry, QuestionSetBlueprint } from "@/question-bank/assembly";
  import QuestionBankView from "./QuestionBankView.svelte";
  import type { RiffCard } from "@/question-bank/adapters/siyuan";
  import { renderMarkdownHtml } from "@/question-bank/markdown";
  import type { QuestionBankUiController, SourceBlockIdentity } from "./controller";
  import type { StoredPracticeSession } from "./session-host";
  import { createPracticeActions } from "./question-bank-practice-actions";
  import { compareAttemptDuration } from "./attempt-duration-comparison";
  import {
    completionStatusLabel as getCompletionStatusLabel,
    copyText,
    createLatestBreadcrumbLoader,
    formatDuration,
    getBuildRevision,
    messageClipboardText as getMessageClipboardText,
    messageContext as getMessageContext,
    optionMarkdown as getOptionMarkdown,
    practiceErrorMessage,
    questionTypeLabel as getQuestionTypeLabel,
    scanLogText as getScanLogText,
    sourceTypeLabel as getSourceTypeLabel,
  } from "./question-bank-display";
  export let controller: QuestionBankUiController;
  export let initialDocumentId: string | undefined = undefined;
  export let translations: Record<string, string> = {};
  export let reviewThreshold = 2;
  export let random: () => number = Math.random;
  export let uuid: () => string = () => crypto.randomUUID();
  export let openQuestionSource: ((blockId: string) => void) | undefined = undefined;
  export let inheritSourceStyles = true;
  export let questionRenderMode: "html" | "native" | "embed" = "native";
  export let durationComparisonPosition: "answer" | "rating" | "header" = "rating";
  export let renderQuestionMarkdown: ((markdown: string, inheritStyles: boolean) => string | undefined) | undefined = undefined;
  export let mountSourceBlock: ((target: HTMLElement, blockId: string, editable: boolean, section?: "stem" | "solution", renderMode?: "native" | "embed") => (() => void) | Promise<() => void>) | undefined = undefined;
  export let prepareSourceBlock: ((blockId: string) => Promise<void>) | undefined = undefined;
  export let autoSyncIndex = false;
  export let onAutoSyncIndexChange: ((value: boolean) => void) | undefined = undefined;
  export let autoScanDocument = false;
  export let onAutoScanDocumentChange: ((value: boolean) => void) | undefined = undefined;
  export let timingEnabled = true;
  export let pauseOnAnswerReveal = true;
  export let now: () => number = Date.now;
  export let mobileBreadcrumb = false;
  export let breadcrumbPriority: BreadcrumbOverflowPriority = "tail";
  export let breadcrumbTextDisplay: BreadcrumbTextDisplay = normalizeBreadcrumbTextDisplay("full", 16, 160);
  export let loadBreadcrumb: ((blockId: string) => Promise<BlockBreadcrumbItem[]>) | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;

  const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
  const log = getLogger("question-bank.practice");
  const questionTypeLabel = (type: QuestionType) => getQuestionTypeLabel(type, label);
  const sourceTypeLabel = (type: string) => getSourceTypeLabel(type, label);
  const completionStatusLabel = (attempted: number, total: number) => getCompletionStatusLabel(attempted, total, label);
  const messageContext = (message: ScanMessage) => getMessageContext(message, label);
  const messageClipboardText = (message: ScanMessage) => getMessageClipboardText(message, label);
  const scanLogText = () => getScanLogText(scanMessageGroups, label);
  const optionMarkdown = (option: ShuffledOption) => getOptionMarkdown(option, currentQuestion?.type, label);
  const buildRevision = getBuildRevision();
  const recent = controller.getRecentScope();
  let documentId = initialDocumentId ?? recent?.documentId ?? "";
  let binding = controller.getBinding();
  let initializationPreview: QuestionBankInitializationPreview | undefined;
  let systemDocumentId = "";
  let rebindingPreview: QuestionBankRebindingPreview | undefined;
  let preview: QuestionIndexPreview | undefined;
  let sourceIdentity: SourceBlockIdentity | undefined;
  let aggregates: ReadonlyMap<string, AttemptAggregate> = new Map();
  let dueCards: ReadonlyMap<string, RiffCard> = new Map();
  let topicId = "";
  let order: PracticeOrder = "sequential";
  let filter: PracticeFilter = "all";
  let busy = false;
  let error = "";
  let syncComplete = false;
  let fileInput: HTMLInputElement | null = null;
  let importSource = "";
  let importPreview: AttemptImportPreview | undefined;
  let importResult: AttemptImportResult | undefined;
  let queue: Question[] = [];
  let questionIndex = 0;
  let currentQuestion: Question | undefined;
  let breadcrumbItems: BlockBreadcrumbItem[] = [];
  let breadcrumbBlockId = "";
  let shuffled: ShuffledQuestion | undefined;
  let displayedOptions: ShuffledOption[] = [];
  let selectedOptionIds: string[] = [];
  let revealed = false;
  let objectiveCorrect: boolean | null = null;
  let subjectiveScore: number | undefined;
  let submitting = false;
  let sessionId = "";
  let timerNow = Date.now();
  let timer: ReturnType<typeof setInterval> | undefined;
  let autoScanTimer: ReturnType<typeof setTimeout> | undefined;
  let sourcePreloadTimer: ReturnType<typeof setTimeout> | undefined;
  let answerCardOpen = false;
  let completedQuestionIndices: number[] = [];
  let complete = false;
  let practiceRuntime: PracticeSessionRuntime | undefined;
  let practiceState: PracticeSessionActorSnapshot | undefined;
  let practiceSaveStatus: PracticeSessionSaveStatus = "saved";
  let practiceSaveError = "";
  let storedSessions: StoredPracticeSession[] = [];
  let recoverableSession: PracticeSessionSnapshot | undefined;
  let recoveryIssues: PracticeSessionRecoveryIssue[] = [];
  let pendingReplacement = false;
  let endConfirmation = false;
  let rootElement: HTMLElement;
  let workspaceResizeObserver: ResizeObserver | undefined;
  let unsubscribePracticeState: (() => void) | undefined;
  let unsubscribeSaveStatus: (() => void) | undefined;
  let completionHandledSessionId = "";
  let scanPanelOpen = false;
  let dataPanelOpen = false;
  let scanPanelUserControlled = false;
  let dataPanelUserControlled = false;
  let scanDetailsOpen = false;
  let scanMessageGroups: Array<{ key: string; messages: ScanMessage[] }> = [];
  let view: "practice" | "statistics" = "practice";
  let statisticsSnapshot: StatisticsSnapshot | undefined;
  let statisticsLoading = false;
  let statisticsRange: StatisticsRange = 30;
  let statisticsSort: StatisticsSort = "weakness";
  let examMode = false;
  let composerOpen = false;
  let sourceDocuments: QuestionSourceDocument[] = [];
  let questionCatalog: QuestionCatalogEntry[] = [];
  let questionSetBlueprints: QuestionSetBlueprint[] = [];
  let assembledQuestions: Question[] | undefined;
  let assembledBlockIdsByQuestionId: ReadonlyMap<string, string> = new Map();
  let assembledSourceKey = "";
  let assembledSourceLabel = "";
  let pendingFrozenSetLabel = "";
  const loadPracticeBreadcrumb = createLatestBreadcrumbLoader(
    () => loadBreadcrumb,
    (items) => { breadcrumbItems = items; },
  );

  const practiceActions = createPracticeActions({
    getState: () => ({
      currentQuestion,
      shuffled,
      practiceRuntime,
      selectedOptionIds,
      revealed,
      readOnlyQuestion,
      submitting,
      timingEnabled,
      previewBlockIds: preview?.scan.blockIdsByQuestionId,
      sessionId,
      filter,
      dueCards,
      log,
    }),
    now,
    setError: (value) => { error = value; },
    setSubmitting: (value) => { submitting = value; },
    label,
    controller,
  });
  $: questions = preview?.scan.report.document.questions ?? [];
  $: practiceSourceQuestions = assembledQuestions ?? questions;
  $: progressQuestions = questions.filter((question) => question.type !== "group");
  $: examQuestions = createPracticeQueue({
    questions,
    topics,
    rootTopicId: topicId || undefined,
    filter: "all",
    order: "sequential",
  });
  $: attemptedQuestions = progressQuestions.filter(
    (question) => (aggregates.get(question.id)?.attempts ?? 0) > 0,
  ).length;
  $: untouchedQuestions = Math.max(0, progressQuestions.length - attemptedQuestions);
  $: reviewQuestions = progressQuestions.filter(
    (question) => (aggregates.get(question.id)?.consecutiveReviewCount ?? 0) >= reviewThreshold,
  ).length;
  $: completionPercent = progressQuestions.length === 0
    ? 0
    : Math.round((attemptedQuestions / progressQuestions.length) * 100);
  $: groups = preview?.scan.report.document.groups ?? [];
  $: topics = preview?.scan.report.document.topics ?? [];
  $: currentGroup = currentQuestion?.metadata.parentId
    ? groups.find((group: QuestionGroup) => group.id === currentQuestion?.metadata.parentId)
    : undefined;
  $: currentQuestionBlockId = currentQuestion
    ? preview?.scan.blockIdsByQuestionId.get(currentQuestion.id)
    : undefined;
  $: scanMessageGroups = preview ? [
    { key: "inferences", messages: preview.scan.report.inferences },
    { key: "issues", messages: preview.scan.report.issues },
    { key: "conflicts", messages: preview.scan.report.conflicts },
    { key: "sourceProblems", messages: preview.scan.sourceIssues },
  ] : [];
  $: pendingSync = Boolean(preview && !syncComplete && (
    preview.actions.length > 0
    || preview.bindingRepairs.length > 0
    || preview.ialWriteActions.length > 0
  ));
  $: suggestedRating = revealed
    ? suggestedMasteryRating(objectiveCorrect, subjectiveScore)
    : undefined;

  $: if (currentQuestionBlockId && currentQuestionBlockId !== breadcrumbBlockId) {
    breadcrumbBlockId = currentQuestionBlockId;
    void loadPracticeBreadcrumb(currentQuestionBlockId);
  }
  $: sessionElapsedMs = timingEnabled && practiceState
    ? practiceSessionElapsedMs(practiceState.context, timerNow)
    : 0;
  $: questionElapsedMs = timingEnabled && practiceState
    ? practiceQuestionElapsedMs(practiceState.context, timerNow)
    : 0;
  $: currentAttempt = currentQuestion
    ? practiceState?.context.attemptsByQuestionId[currentQuestion.id]
    : undefined;
  $: currentDraft = currentQuestion
    ? practiceState?.context.session.drafts[currentQuestion.id]
    : undefined;
  $: revealDurationMs = timingEnabled && revealed
    ? currentAttempt ? currentAttempt.duration_ms : currentDraft?.elapsed_ms
    : undefined;
  $: durationComparisons = compareAttemptDuration({
    currentDurationMs: revealDurationMs,
    aggregate: currentQuestion ? aggregates.get(currentQuestion.id) : undefined,
    currentAttemptId: currentAttempt?.attempt_id,
  });
  $: readOnlyQuestion = Boolean(currentAttempt);
  $: sessionAttempts = practiceState
    ? Object.values(practiceState.context.attemptsByQuestionId)
    : [];
  $: completionCorrect = sessionAttempts.filter((attempt) => attempt.objective_correct === true).length;
  $: completionDurationMs = sessionAttempts.reduce((total, attempt) => total + (attempt.duration_ms ?? 0), 0);
  $: touchedDrafts = practiceState
    ? Object.values(practiceState.context.session.drafts).filter((draft) => (
        !practiceState?.context.session.completed_question_ids.includes(draft.question_id)
        && (draft.selected_option_ids.length > 0 || draft.revealed || draft.subjective_score !== undefined || draft.elapsed_ms > 0)
      )).length
    : 0;
  $: reviewing = Boolean(practiceState?.matches("reviewing"));
  $: timerPaused = Boolean(practiceState?.matches("paused"));
  $: answerTimerPaused = Boolean(revealed && pauseOnAnswerReveal && practiceState?.matches("active"));
  $: timerEffectivelyPaused = timerPaused || answerTimerPaused;

  onMount(() => {
    const host = rootElement.closest<HTMLElement>(".damophus-question-bank-host");
    const command = (event: Event) => {
      const detail = (event as CustomEvent<"previous" | "next" | "pause">).detail;
      if (detail === "previous") previousQuestion();
      else if (detail === "next") nextQuestion();
      else if (detail === "pause") void pausePractice();
    };
    host?.addEventListener("damophus-practice-command", command);
    const updateAdaptivePanels = () => {
      const availableHeight = rootElement.getBoundingClientRect().height || window.innerHeight;
      const compactViewport = window.matchMedia("(max-width: 760px)").matches;
      const scanOpenThreshold = compactViewport ? 900 : 680;
      if (!scanPanelUserControlled) scanPanelOpen = availableHeight >= scanOpenThreshold;
      if (!dataPanelUserControlled) dataPanelOpen = availableHeight >= 900;
    };
    updateAdaptivePanels();
    workspaceResizeObserver = new ResizeObserver(updateAdaptivePanels);
    workspaceResizeObserver.observe(rootElement);
    void run(refreshStoredSessions);
    scheduleAutoScan(250);
    return () => host?.removeEventListener("damophus-practice-command", command);
  });

  onDestroy(() => {
    clearTimer();
    workspaceResizeObserver?.disconnect();
    if (autoScanTimer) clearTimeout(autoScanTimer);
    if (sourcePreloadTimer) clearTimeout(sourcePreloadTimer);
    unsubscribePracticeState?.();
    unsubscribeSaveStatus?.();
    if (practiceRuntime) void practiceRuntime.dispose();
  });

  function clearTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }
  function startTimer(): void {
    clearTimer();
    timerNow = now();
    if (!timingEnabled) return;
    timer = setInterval(() => {
      timerNow = now();
    }, 1000);
  }

  async function run(operation: () => Promise<void>): Promise<void> {
    busy = true;
    error = "";
    try {
      await operation();
    } catch (reason) {
      error = practiceErrorMessage(reason, label);
    } finally {
      busy = false;
    }
  }

  function validDocument(): boolean {
    return /^\d{14}-[a-z0-9]{7}$/u.test(documentId);
  }

  function invalidateDocumentTarget(): void {
    clearTimer();
    initializationPreview = undefined;
    preview = undefined;
    sourceIdentity = undefined;
    syncComplete = false;
    topicId = "";
    queue = [];
    currentQuestion = undefined;
    complete = false;
    answerCardOpen = false;
    completedQuestionIndices = [];
    recoverableSession = undefined;
    scanPanelUserControlled = false;
    scheduleAutoScan();
  }

  function scheduleAutoScan(delay = 450): void {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = undefined;
    if (!autoScanDocument || !validDocument()) return;
    autoScanTimer = setTimeout(() => {
      autoScanTimer = undefined;
      if (busy) {
        scheduleAutoScan(250);
        return;
      }
      scanDocument(false);
    }, delay);
  }

  function invalidateSystemDocumentTarget(): void {
    rebindingPreview = undefined;
  }

  function previewInitialization(): void {
    void run(async () => {
      initializationPreview = await controller.previewInitialization(documentId);
    });
  }

  function confirmInitialization(): void {
    if (!initializationPreview) return;
    void run(async () => {
      binding = await controller.confirmInitialization(initializationPreview!);
      initializationPreview = undefined;
    });
  }

  function previewRebinding(): void {
    void run(async () => {
      rebindingPreview = await controller.previewRebinding(systemDocumentId);
    });
  }

  function confirmRebinding(): void {
    if (!rebindingPreview) return;
    void run(async () => {
      binding = await controller.confirmRebinding(systemDocumentId, rebindingPreview!.token);
      rebindingPreview = undefined;
    });
  }

  function scanDocument(revealScanSummary = true): void {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = undefined;
    if (revealScanSummary) {
      scanPanelUserControlled = true;
      scanPanelOpen = true;
    }
    void run(async () => {
      const [nextPreview, nextSourceIdentity, stored] = await Promise.all([
        controller.previewSync(documentId),
        controller.loadSourceIdentity(documentId),
        controller.loadPracticeSession(documentId),
      ]);
      preview = nextPreview;
      if (nextPreview.blockers.length > 0) scanPanelOpen = true;
      sourceIdentity = nextSourceIdentity;
      recoverableSession = stored?.status === "ok" ? stored.snapshot : undefined;
      syncComplete = false;
      if (autoSyncIndex && hasPendingSync(nextPreview) && nextPreview.blockers.length === 0) {
        preview = await applyIndexSync(nextPreview);
      }
      if (preview.bindingRepairs.length === 0) {
        [aggregates, dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadDueCards(preview.scan.blockIdsByQuestionId),
        ]);
      } else {
        aggregates = new Map();
        dueCards = new Map();
      }
      const saved = controller.getRecentScope();
      const savedHeadingBlockId = saved?.documentId === documentId ? saved.headingBlockId : undefined;
      const savedTopicId = savedHeadingBlockId
        ? [...preview.scan.topicBlockIdsByTopicId].find(([, blockId]) => blockId === savedHeadingBlockId)?.[0]
        : saved?.documentId === documentId ? saved.topicId : undefined;
      const topicExists = savedTopicId
        ? preview.scan.report.document.topics.some((topic) => topic.id === savedTopicId)
        : false;
      topicId = topicExists ? savedTopicId! : "";
      if ((savedHeadingBlockId || savedTopicId) && !topicExists) controller.saveRecentScope({ documentId });
      await refreshStoredSessions();
    });
  }

  function loadStatistics(): void {
    if (!controller.loadStatisticsQuestions || !controller.loadAttemptEvents) {
      statisticsSnapshot = undefined;
      return;
    }
    void run(async () => {
      statisticsLoading = true;
      try {
        const [statisticsQuestions, attempts] = await Promise.all([
          controller.loadStatisticsQuestions!(),
          controller.loadAttemptEvents!(),
        ]);
        statisticsSnapshot = buildStatistics(
          statisticsQuestions,
          attempts,
          statisticsRange,
          now(),
          statisticsSort,
        );
      } finally {
        statisticsLoading = false;
      }
    });
  }

  function selectView(next: "practice" | "statistics"): void {
    view = next;
    if (next === "statistics") loadStatistics();
  }

  function changeStatisticsRange(value: StatisticsRange): void {
    statisticsRange = value;
    loadStatistics();
  }

  function changeStatisticsSort(value: StatisticsSort): void {
    statisticsSort = value;
    loadStatistics();
  }

  function confirmSync(): void {
    if (!preview) return;
    void run(async () => {
      preview = await applyIndexSync(preview!);
      if (syncComplete) {
        [aggregates, dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadDueCards(preview.scan.blockIdsByQuestionId),
        ]);
      }
    });
  }

  function exportAttempts(): void {
    void run(async () => {
      const source = await controller.exportAttempts();
      const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `damophus-attempts-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  async function selectImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await run(async () => {
      importSource = await file.text();
      importResult = undefined;
      importPreview = await controller.previewImport(importSource);
    });
    input.value = "";
  }

  function confirmImport(): void {
    if (!importPreview) return;
    void run(async () => {
      importResult = await controller.confirmImport(importSource, importPreview!.token);
      importPreview = undefined;
      aggregates = await controller.loadAggregates();
    });
  }

  async function refreshStoredSessions(): Promise<void> {
    storedSessions = await controller.listPracticeSessions();
    const current = storedSessions.find((stored) => stored.sourceKey === documentId);
    recoverableSession = current?.result.status === "ok" ? current.result.snapshot : undefined;
  }

  function syncPracticeView(snapshot: PracticeSessionActorSnapshot): void {
    practiceState = snapshot;
    const session = snapshot.context.session;
    sessionId = session.session_id;
    queue = session.queue_question_ids
      .map((questionId) => questions.find((question) => question.id === questionId))
      .filter((question): question is Question => Boolean(question));
    completedQuestionIndices = session.completed_question_ids
      .map((questionId) => session.queue_question_ids.indexOf(questionId))
      .filter((index) => index >= 0);
    questionIndex = Math.max(0, session.queue_question_ids.indexOf(session.current_question_id));
    complete = snapshot.matches("completed");
    submitting = snapshot.matches("submitting");
    timerNow = now();
    const host = rootElement?.closest<HTMLElement>(".damophus-question-bank-host, .damophus-question-bank-dialog");
    if (host) host.dataset.practiceActive = String(
      snapshot.matches("active") || snapshot.matches("paused") || snapshot.matches("reviewing"),
    );
    currentQuestion = complete ? undefined : queue[questionIndex];
    if (!currentQuestion) {
      shuffled = undefined;
      displayedOptions = [];
      return;
    }

    const draft = session.drafts[currentQuestion.id];
    const attempt = snapshot.context.attemptsByQuestionId[currentQuestion.id];
    shuffled = questionOptionsFromOrder(currentQuestion, attempt?.option_order ?? draft?.option_order ?? []);
    selectedOptionIds = [...(attempt?.selected_option_ids ?? draft?.selected_option_ids ?? [])];
    revealed = Boolean(attempt) || Boolean(draft?.revealed);
    objectiveCorrect = attempt?.objective_correct ?? draft?.objective_correct ?? null;
    subjectiveScore = attempt?.subjective_score ?? draft?.subjective_score;
    displayedOptions = revealed ? restoreQuestionOptions(currentQuestion, shuffled) : shuffled.options;
    scheduleSourcePreload();
  }

  function sourceBlockId(question: Question | undefined): string | undefined {
    return question
      ? (assembledQuestions ? assembledBlockIdsByQuestionId : preview?.scan.blockIdsByQuestionId)?.get(question.id)
      : undefined;
  }

  function correctCurrentAnswer(): void {
    const question = currentQuestion;
    const blockId = currentQuestionBlockId;
    if (!question || !blockId || !controller.correctQuestionAnswer || !question.answer) return;
    const current = question.answer.kind === "boolean"
      ? String(question.answer.value)
      : question.answer.optionIds.join(",");
    const input = window.prompt(label("correctAnswerPrompt", "Enter the correct answer (for example A or A,C)"), current);
    if (input === null) return;
    const value = input.trim();
    const answer = question.answer.kind === "boolean"
      ? value.toLowerCase() === "true"
        ? { kind: "boolean" as const, value: true }
        : value.toLowerCase() === "false"
          ? { kind: "boolean" as const, value: false }
          : undefined
      : { kind: "options" as const, optionIds: normalizeOptionIds(value.split(/[，,\s]+/u)) };
    if (!answer) {
      error = label("invalidCorrectAnswer", "Enter true or false");
      return;
    }
    void run(async () => {
      await controller.correctQuestionAnswer!(blockId, question, answer);
      const updated = { ...question, answer };
      queue = queue.map((item) => item.id === updated.id ? updated : item);
      currentQuestion = updated;
    });
  }

  function scheduleSourcePreload(): void {
    if (sourcePreloadTimer) clearTimeout(sourcePreloadTimer);
    sourcePreloadTimer = undefined;
    if (questionRenderMode !== "embed" || !prepareSourceBlock) return;
    const currentBlockId = sourceBlockId(currentQuestion);
    if (currentBlockId) void prepareSourceBlock(currentBlockId);
    const nextBlockId = sourceBlockId(queue[questionIndex + 1]);
    if (!nextBlockId) return;
    sourcePreloadTimer = setTimeout(() => {
      void prepareSourceBlock?.(nextBlockId);
    }, 350);
  }

  async function activateRuntime(activation: PracticeSessionActivation): Promise<void> {
    const { snapshot, attempts, persistedRevision } = activation;
    unsubscribePracticeState?.();
    unsubscribeSaveStatus?.();
    if (practiceRuntime) await practiceRuntime.dispose();
    completionHandledSessionId = "";
    const runtime = new PracticeSessionRuntime({
      host: controller,
      input: { snapshot, attempts, now: now(), pauseOnAnswerReveal },
      persistedRevision,
    });
    practiceRuntime = runtime;
    unsubscribePracticeState = runtime.subscribeState((state) => {
      syncPracticeView(state);
      if (state.matches("completed") && completionHandledSessionId !== state.context.session.session_id) {
        completionHandledSessionId = state.context.session.session_id;
        clearTimer();
        void runtime.complete()
          .then(refreshStoredSessions)
          .catch((reason) => { error = reason instanceof Error ? reason.message : String(reason); });
      }
    });
    unsubscribeSaveStatus = runtime.subscribeSaveStatus((status, reason) => {
      practiceSaveStatus = status;
      practiceSaveError = reason?.message ?? "";
    });
    recoverableSession = undefined;
    recoveryIssues = activation.recoveryIssues;
    pendingReplacement = false;
    endConfirmation = false;
    answerCardOpen = false;
    if (!runtime.actor.getSnapshot().matches("completed")) startTimer();
  }

  function practiceQueue(): Question[] {
    if (assembledQuestions) return [...assembledQuestions];
    return createPracticeQueue({
      questions,
      topics,
      rootTopicId: topicId || undefined,
      filter,
      order,
      aggregates,
      dueQuestionIds: new Set(dueCards.keys()),
      reviewThreshold,
      random,
    });
  }

  function hasPendingSync(target: QuestionIndexPreview): boolean {
    return target.actions.length > 0
      || target.bindingRepairs.length > 0
      || target.ialWriteActions.length > 0;
  }

  async function applyIndexSync(target: QuestionIndexPreview): Promise<QuestionIndexPreview> {
    const synced = await controller.confirmSync(documentId, target.token);
    const failures = synced.results.filter((result) => result.status === "failed");
    syncComplete = failures.length === 0;
    if (failures.length > 0) {
      error = failures.map((failure) => `${failure.questionId}: ${failure.message ?? "failed"}`).join("; ");
    }
    return synced;
  }

  function startPractice(): void {
    if (!preview) return;
    const nextQueue = practiceQueue();
    if (nextQueue.length === 0) {
      queue = [];
      complete = true;
      clearTimer();
      return;
    }
    if (recoverableSession) {
      pendingReplacement = true;
      return;
    }
    void run(() => beginNewPractice(nextQueue));
  }

  async function beginNewPractice(
    nextQueue = practiceQueue(),
    sourceKey = assembledSourceKey || documentId,
    sourceLabel = assembledSourceLabel || sourceIdentity?.content,
  ): Promise<void> {
    if ((!preview && !assembledQuestions) || nextQueue.length === 0) return;
    if (questionRenderMode === "embed" && prepareSourceBlock) {
      const initialBlockIds = nextQueue.slice(0, 2)
        .map((question) => sourceBlockId(question))
        .filter((blockId): blockId is string => Boolean(blockId));
      await Promise.allSettled(initialBlockIds.map((blockId) => prepareSourceBlock!(blockId)));
    }
    await startPracticeSession({
      host: controller,
      sourceKey,
      createSnapshot: () => createNewPracticeSnapshot(nextQueue, sourceKey, sourceLabel),
      activate: activateRuntime,
    });
  }

  function createNewPracticeSnapshot(
    nextQueue = practiceQueue(),
    sourceKey = assembledSourceKey || documentId,
    sourceLabel = assembledSourceLabel || sourceIdentity?.content,
  ): PracticeSessionSnapshot {
    if ((!preview && !assembledQuestions) || nextQueue.length === 0) throw new Error("A practice session requires at least one question");
    if (!assembledQuestions && preview) {
      controller.saveRecentScope({
        documentId,
        headingBlockId: topicId ? preview.scan.topicBlockIdsByTopicId.get(topicId) : undefined,
      });
    }
    return createPracticeSessionSnapshot({
      sessionId: uuid(),
      sourceKey,
      sourceLabel,
      scopeId: assembledQuestions ? undefined : topicId || undefined,
      filter: assembledQuestions ? "all" : filter,
      order: assembledQuestions ? "sequential" : order,
      queue: nextQueue.map((question) => ({
        question,
        optionOrder: shuffleQuestionOptions(question, random).optionOrder,
      })),
      now: new Date(now()),
    });
  }

  function resumePractice(snapshot = recoverableSession): void {
    if (!snapshot || (!preview && !assembledQuestions)) return;
    void run(async () => {
      await resumePracticeSession({
        host: controller,
        snapshot,
        questions: practiceSourceQuestions,
        now: new Date(now()),
        activate: activateRuntime,
      });
    });
  }

  function confirmRestartPractice(): void {
    const previous = recoverableSession;
    if (!previous) {
      pendingReplacement = false;
      return;
    }
    void run(async () => {
      await replacePracticeSession({
        host: controller,
        previous,
        createSnapshot: createNewPracticeSnapshot,
        activate: activateRuntime,
      });
      await refreshStoredSessions();
    });
  }

  function goToQuestion(index: number): void {
    const questionId = practiceState?.context.session.queue_question_ids[index];
    if (!practiceRuntime || !questionId || (index === questionIndex && !practiceState?.matches("completed"))) {
      answerCardOpen = false;
      return;
    }
    practiceRuntime.actor.send({
      type: practiceState?.matches("completed") ? "REVIEW" : "NAVIGATE",
      questionId,
      now: now(),
    });
    answerCardOpen = false;
  }

  function previousQuestion(): void {
    if (questionIndex > 0) goToQuestion(questionIndex - 1);
  }

  function nextQuestion(): void {
    if (questionIndex < queue.length - 1) goToQuestion(questionIndex + 1);
  }

  const toggleOption = practiceActions.toggleOption;
  const revealAnswer = practiceActions.revealAnswer;
  const retry = practiceActions.retry;
  const resetQuestionTimer = practiceActions.resetQuestionTimer;
  const changeSubjectiveScore = practiceActions.changeSubjectiveScore;
  const submitRating = practiceActions.submitRating;
  function pausePractice(): void {
    if (!practiceRuntime || !practiceState?.matches("active")) return;
    void run(async () => {
      const runtime = practiceRuntime!;
      await runtime.pause(now());
      await leavePracticeRuntime(runtime);
      await refreshStoredSessions();
    });
  }

  function togglePracticeTimer(): void {
    if (!practiceRuntime || submitting || reviewing) return;
    const current = practiceRuntime.actor.getSnapshot();
    if (current.matches("active")) {
      practiceRuntime.actor.send({ type: "PAUSE", now: now() });
      clearTimer();
    } else if (current.matches("paused")) {
      practiceRuntime.actor.send({ type: "RESUME", now: now() });
      startTimer();
    }
  }

  function requestEndPractice(): void {
    endConfirmation = true;
  }

  function confirmEndPractice(): void {
    if (!practiceRuntime) return;
    void run(async () => {
      const runtime = practiceRuntime!;
      await runtime.end(now());
      await leavePracticeRuntime(runtime);
      await refreshStoredSessions();
    });
  }

  async function leavePracticeRuntime(runtime = practiceRuntime): Promise<void> {
    clearTimer();
    unsubscribePracticeState?.();
    unsubscribePracticeState = undefined;
    unsubscribeSaveStatus?.();
    unsubscribeSaveStatus = undefined;
    if (runtime) await runtime.dispose();
    if (practiceRuntime === runtime) practiceRuntime = undefined;
    practiceState = undefined;
    queue = [];
    currentQuestion = undefined;
    complete = false;
    answerCardOpen = false;
    completedQuestionIndices = [];
    endConfirmation = false;
  }

  function retryPracticeSave(): void {
    if (!practiceRuntime) return;
    void run(() => practiceRuntime!.retrySave());
  }

  function openStoredSession(stored: StoredPracticeSession): void {
    const parsedStored = stored.result;
    if (parsedStored.status === "ok"
      && controller.hydrateQuestionSources
      && !/^\d{14}-[a-z0-9]{7}$/u.test(stored.sourceKey)) {
      void run(async () => {
        const hydrated = await controller.hydrateQuestionSources!(parsedStored.snapshot.queue_question_ids);
        assembledQuestions = hydrated.questions;
        assembledBlockIdsByQuestionId = hydrated.blockIdsByQuestionId;
        assembledSourceKey = stored.sourceKey;
        assembledSourceLabel = parsedStored.snapshot.source_label ?? label("questionSet", "跨文档组卷");
        await resumePracticeSession({
          host: controller,
          snapshot: parsedStored.snapshot,
          questions: hydrated.questions,
          now: new Date(now()),
          activate: activateRuntime,
        });
      });
      return;
    }
    documentId = stored.sourceKey;
    invalidateDocumentTarget();
    scanDocument(false);
  }

  async function loadQuestionSetData(): Promise<void> {
    if (!controller.listQuestionSourceDocuments || !controller.loadQuestionCatalog || !controller.listQuestionSetBlueprints) return;
    [sourceDocuments, questionCatalog, questionSetBlueprints] = await Promise.all([
      controller.listQuestionSourceDocuments(),
      controller.loadQuestionCatalog(),
      controller.listQuestionSetBlueprints(),
    ]);
  }

  function openQuestionSetComposer(): void {
    composerOpen = true;
    void run(loadQuestionSetData);
  }

  async function previewSourceSync(documentIds: readonly string[]): Promise<QuestionIndexBatchPreview> {
    if (!controller.previewSyncBatch) throw new Error(label("questionSetIndexUnavailable", "跨文档入库服务尚未连接"));
    return controller.previewSyncBatch(documentIds);
  }

  async function confirmSourceSync(target: QuestionIndexBatchPreview): Promise<QuestionIndexBatchPreview> {
    if (!controller.confirmSyncBatch) throw new Error(label("questionSetIndexUnavailable", "跨文档入库服务尚未连接"));
    const confirmed = await controller.confirmSyncBatch(target.documentIds, target.token);
    await loadQuestionSetData();
    return confirmed;
  }

  function assembleBlueprint(blueprint: QuestionSetBlueprint): FrozenQuestionSet {
    if (!controller.assembleQuestionSet) throw new Error(label("questionSetAssemblyUnavailable", "组卷服务尚未连接"));
    pendingFrozenSetLabel = blueprint.name;
    return controller.assembleQuestionSet({
      blueprint,
      catalog: questionCatalog,
      sourceRevision: questionCatalog.map((entry) => `${entry.questionId}:${entry.blockId}:${entry.indexedAt ?? ""}`).sort().join("|"),
      setId: crypto.randomUUID(),
      seed: crypto.randomUUID(),
    });
  }

  async function saveBlueprint(blueprint: QuestionSetBlueprint): Promise<void> {
    await controller.saveQuestionSetBlueprint?.(blueprint);
    questionSetBlueprints = await controller.listQuestionSetBlueprints?.() ?? questionSetBlueprints;
  }

  async function removeBlueprint(blueprintId: string): Promise<void> {
    await controller.removeQuestionSetBlueprint?.(blueprintId);
    questionSetBlueprints = await controller.listQuestionSetBlueprints?.() ?? [];
  }

  async function useFrozenPracticeSet(frozen: FrozenQuestionSet): Promise<void> {
    if (!controller.hydrateQuestionSources) throw new Error(label("questionSetHydrationUnavailable", "跨文档题源加载服务尚未连接"));
    const hydrated = await controller.hydrateQuestionSources(frozen.question_ids);
    assembledQuestions = frozen.question_ids
      .map((questionId) => hydrated.questions.find((question) => question.id === questionId))
      .filter((question): question is Question => Boolean(question));
    assembledBlockIdsByQuestionId = hydrated.blockIdsByQuestionId;
    assembledSourceKey = frozen.set_id;
    assembledSourceLabel = pendingFrozenSetLabel || label("questionSet", "跨文档组卷");
    composerOpen = false;
    await beginNewPractice(assembledQuestions, assembledSourceKey, assembledSourceLabel);
  }

  function exportSessionDiagnostic(sourceKey: string): void {
    void run(async () => {
      const source = await controller.exportPracticeSessionDiagnostic(sourceKey);
      const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `damophus-session-${sourceKey}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  function exitReview(): void {
    practiceRuntime?.actor.send({ type: "EXIT_REVIEW", now: now() });
  }

  function resetPractice(): void {
    void run(async () => {
      await leavePracticeRuntime();
      error = "";
      aggregates = await controller.loadAggregates();
      await refreshStoredSessions();
    });
  }

  function renderedQuestionContent(markdown: string, sourceStyles: boolean): string {
    if (questionRenderMode === "html") return renderMarkdownHtml(markdown);
    return renderQuestionMarkdown?.(markdown, sourceStyles) ?? renderMarkdownHtml(markdown);
  }

  function toggleAutoSyncIndex(checked: boolean): void {
    autoSyncIndex = checked;
    onAutoSyncIndexChange?.(checked);
  }

  function toggleAutoScanDocument(checked: boolean): void {
    autoScanDocument = checked;
    onAutoScanDocumentChange?.(checked);
    if (checked) scheduleAutoScan(0);
    else if (autoScanTimer) clearTimeout(autoScanTimer);
  }
</script>

<QuestionBankView
  bind:rootElement bind:documentId bind:initializationPreview bind:systemDocumentId bind:rebindingPreview
  bind:view bind:composerOpen bind:examMode bind:autoScanDocument bind:dataPanelOpen bind:dataPanelUserControlled bind:fileInput
  bind:scanPanelOpen bind:scanPanelUserControlled bind:scanDetailsOpen bind:pendingReplacement bind:topicId bind:order bind:filter
  bind:endConfirmation bind:answerCardOpen
  {currentQuestion} {buildRevision} {label} {translations} {onClose} {busy} {questionIndex} {queue} {completedQuestionIndices}
  {timingEnabled} {sessionElapsedMs} {breadcrumbItems} {currentQuestionBlockId} {mobileBreadcrumb} {breadcrumbPriority}
  {breadcrumbTextDisplay} {openQuestionSource} {submitting} {reviewing} {answerTimerPaused} {timerEffectivelyPaused}
  {previousQuestion} {nextQuestion} {togglePracticeTimer} {exitReview} {pausePractice} {requestEndPractice} {error} {binding}
  {validDocument} {previewInitialization} {confirmInitialization} {invalidateSystemDocumentTarget} {previewRebinding}
  {confirmRebinding} {invalidateDocumentTarget} {practiceRuntime} {complete} {selectView} {questionCatalog} {sourceDocuments}
  {questionSetBlueprints} {run} {loadQuestionSetData} {previewSourceSync} {confirmSourceSync} {assembleBlueprint} {saveBlueprint}
  {removeBlueprint} {useFrozenPracticeSet} {statisticsSnapshot} {statisticsLoading} {statisticsRange} {statisticsSort}
  {changeStatisticsRange} {changeStatisticsSort} {controller} {examQuestions} {preview} {sourceIdentity} {uuid} {random}
  {renderQuestionMarkdown} {refreshStoredSessions} {scanDocument} {toggleAutoScanDocument} {storedSessions} {openStoredSession}
  {exportSessionDiagnostic} {exportAttempts} {selectImportFile} {importPreview} {confirmImport} {importResult} {progressQuestions}
  {completionPercent} {attemptedQuestions} {untouchedQuestions} {reviewQuestions} {pendingSync} {syncComplete} {autoSyncIndex}
  {scanMessageGroups} {sourceTypeLabel} {completionStatusLabel} {messageContext} {messageClipboardText} {scanLogText} {copyText}
  {confirmSync} {toggleAutoSyncIndex} {recoverableSession} {resumePractice} {confirmRestartPractice} {topics} {startPractice}
  {openQuestionSetComposer} {currentGroup} {displayedOptions} {selectedOptionIds} {revealed} {readOnlyQuestion}
  {objectiveCorrect} {subjectiveScore} {currentAttempt} {durationComparisons} {durationComparisonPosition} {inheritSourceStyles} {questionRenderMode} {renderedQuestionContent}
  {mountSourceBlock} {questionTypeLabel} {optionMarkdown} {formatDuration} {toggleOption} {changeSubjectiveScore}
  {questionElapsedMs} {resetQuestionTimer} {confirmEndPractice} {practiceSaveStatus} {practiceSaveError} {retryPracticeSave}
  {correctCurrentAnswer}
  {recoveryIssues} {goToQuestion} {suggestedRating} {revealAnswer} {retry} {submitRating} {sessionAttempts}
  {completionCorrect} {completionDurationMs} {touchedDrafts} {resetPractice}
/>
