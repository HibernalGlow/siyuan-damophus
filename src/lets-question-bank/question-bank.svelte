<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    ArrowLeft,
    BarChart3,
    BookOpenCheck,
    ChevronLeft,
    ChevronDown,
    ChevronRight,
    CircleX,
    Clock3,
    Database,
    Download,
    LayoutGrid,
    List,
    ListOrdered,
    Pause,
    Play,
    RotateCcw,
    ScanLine,
    Shuffle,
    Upload,
    X,
  } from "lucide-svelte";
  import type { BlockBreadcrumbItem } from "@/api";
  import {
    normalizeBreadcrumbPriority,
    normalizeBreadcrumbTextDisplay,
    ScrollableBreadcrumb,
    type BreadcrumbTextDisplay,
    type BreadcrumbOverflowPriority,
  } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
  import * as Alert from "@/components/ui/alert";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import * as Collapsible from "@/components/ui/collapsible";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import * as ScrollArea from "@/components/ui/scroll-area";
  import * as Select from "@/components/ui/select";
  import { Switch } from "@/components/ui/switch";
  import * as Tabs from "@/components/ui/tabs";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import { gradeQuestion } from "@/question-bank/core/answer";
  import {
    questionOptionsFromOrder,
    restoreQuestionOptions,
    shuffleQuestionOptions,
  } from "@/question-bank/core/shuffle";
  import type {
    AttemptAggregate,
    MasteryRating,
    Question,
    QuestionGroup,
    QuestionType,
    ScanMessage,
    ShuffledOption,
    ShuffledQuestion,
    TopicNode,
  } from "@/question-bank/core/types";
  import { buildStatistics, type StatisticsRange, type StatisticsSnapshot, type StatisticsSort } from "@/question-bank/core/statistics";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import {
    createPracticeQueue,
    PracticeSessionLifecycleError,
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
    QuestionIndexPreview,
  } from "@/question-bank/application";
  import type {
    QuestionBankInitializationPreview,
    QuestionBankRebindingPreview,
  } from "@/question-bank/adapters/siyuan";
  import PracticeQuestionContent from "./PracticeQuestionContent.svelte";
  import PracticeCompletion from "./PracticeCompletion.svelte";
  import PracticeScanSummary from "./PracticeScanSummary.svelte";
  import ExamWorkspace from "./ExamWorkspace.svelte";
  import Statistics from "./Statistics.svelte";
  import type { RiffCard } from "@/question-bank/adapters/siyuan";
  import { renderMarkdownHtml } from "@/question-bank/markdown";
  import type { QuestionBankUiController, SourceBlockIdentity } from "./controller";
  import type { StoredPracticeSession } from "./session-host";

  export let controller: QuestionBankUiController;
  export let initialDocumentId: string | undefined = undefined;
  export let translations: Record<string, string> = {};
  export let reviewThreshold = 2;
  export let random: () => number = Math.random;
  export let uuid: () => string = () => crypto.randomUUID();
  export let openQuestionSource: ((blockId: string) => void) | undefined = undefined;
  export let inheritSourceStyles = true;
  export let questionRenderMode: "html" | "native" | "embed" = "native";
  export let renderQuestionMarkdown: ((markdown: string, inheritStyles: boolean) => string | undefined) | undefined = undefined;
  export let mountSourceBlock: ((target: HTMLElement, blockId: string, editable: boolean, section?: "stem" | "solution") => (() => void) | Promise<() => void>) | undefined = undefined;
  export let prepareSourceBlock: ((blockId: string) => Promise<void>) | undefined = undefined;
  export let autoSyncIndex = false;
  export let onAutoSyncIndexChange: ((value: boolean) => void) | undefined = undefined;
  export let autoScanDocument = false;
  export let onAutoScanDocumentChange: ((value: boolean) => void) | undefined = undefined;
  export let timingEnabled = true;
  export let now: () => number = Date.now;
  export let mobileBreadcrumb = false;
  export let breadcrumbPriority: BreadcrumbOverflowPriority = "tail";
  export let breadcrumbTextDisplay: BreadcrumbTextDisplay = normalizeBreadcrumbTextDisplay("full", 16, 160);
  export let loadBreadcrumb: ((blockId: string) => Promise<BlockBreadcrumbItem[]>) | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;

  const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
  const buildRevision = process.env.DAMOPHUS_BUILD_REVISION ?? "dev-unknown";
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
  let breadcrumbRequest = 0;
  let breadcrumbScroller: ScrollableBreadcrumb | undefined;
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

  const entireDocumentScope = "__damophus_entire_document__";

  $: questions = preview?.scan.report.document.questions ?? [];
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
      if (!scanPanelUserControlled) scanPanelOpen = availableHeight >= 680;
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

  function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  async function run(operation: () => Promise<void>): Promise<void> {
    busy = true;
    error = "";
    try {
      await operation();
    } catch (reason) {
      if (reason instanceof PracticeSessionLifecycleError && reason.code === "session-in-use") {
        error = label("sessionInUse", "This practice session is open in another window");
      } else if (reason instanceof PracticeSessionLifecycleError && reason.code === "session-has-no-questions") {
        error = label("sessionHasNoQuestions", "None of this session's questions still exist");
      } else {
        error = reason instanceof Error ? reason.message : String(reason);
      }
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
    return question ? preview?.scan.blockIdsByQuestionId.get(question.id) : undefined;
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
      input: { snapshot, attempts, now: now() },
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

  async function beginNewPractice(nextQueue = practiceQueue()): Promise<void> {
    if (!preview || nextQueue.length === 0) return;
    if (questionRenderMode === "embed" && prepareSourceBlock) {
      const initialBlockIds = nextQueue.slice(0, 2)
        .map((question) => sourceBlockId(question))
        .filter((blockId): blockId is string => Boolean(blockId));
      await Promise.allSettled(initialBlockIds.map((blockId) => prepareSourceBlock!(blockId)));
    }
    await startPracticeSession({
      host: controller,
      sourceKey: documentId,
      createSnapshot: () => createNewPracticeSnapshot(nextQueue),
      activate: activateRuntime,
    });
  }

  function createNewPracticeSnapshot(nextQueue = practiceQueue()): PracticeSessionSnapshot {
    if (!preview || nextQueue.length === 0) throw new Error("A practice session requires at least one question");
    controller.saveRecentScope({
      documentId,
      headingBlockId: topicId ? preview.scan.topicBlockIdsByTopicId.get(topicId) : undefined,
    });
    return createPracticeSessionSnapshot({
      sessionId: uuid(),
      sourceKey: documentId,
      sourceLabel: sourceIdentity?.content,
      scopeId: topicId || undefined,
      filter,
      order,
      queue: nextQueue.map((question) => ({
        question,
        optionOrder: shuffleQuestionOptions(question, random).optionOrder,
      })),
      now: new Date(now()),
    });
  }

  function resumePractice(snapshot = recoverableSession): void {
    if (!snapshot || !preview) return;
    void run(async () => {
      await resumePracticeSession({
        host: controller,
        snapshot,
        questions,
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

  function toggleOption(optionId: string): void {
    if (!currentQuestion || revealed || readOnlyQuestion || !practiceRuntime) return;
    const nextSelection = currentQuestion.type === "multiple" || currentQuestion.type === "indefinite"
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: currentQuestion.id,
      patch: { selected_option_ids: nextSelection },
      now: now(),
    });
  }

  function revealAnswer(): void {
    if (!currentQuestion || !shuffled || !practiceRuntime || readOnlyQuestion) return;
    if (currentQuestion.type !== "subjective" && selectedOptionIds.length === 0) {
      error = label("selectAnswer", "Select an answer before revealing");
      return;
    }
    error = "";
    practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: currentQuestion.id,
      patch: {
        revealed: true,
        objective_correct: gradeQuestion(currentQuestion, selectedOptionIds),
      },
      now: now(),
    });
  }

  function retry(): void {
    if (!currentQuestion || !practiceRuntime || readOnlyQuestion) return;
    practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: currentQuestion.id,
      patch: {
        selected_option_ids: [],
        revealed: false,
        objective_correct: null,
        subjective_score: undefined,
      },
      now: now(),
    });
    error = "";
  }

  function changeSubjectiveScore(event: Event): void {
    if (!currentQuestion || !practiceRuntime || readOnlyQuestion) return;
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
    practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: currentQuestion.id,
      patch: { subjective_score: Number.isFinite(value) ? value : undefined },
      now: now(),
    });
  }

  function submitRating(rating: MasteryRating): void {
    if (!currentQuestion || !shuffled || !revealed || submitting || !practiceRuntime || readOnlyQuestion) return;
    submitting = true;
    error = "";
    const question = currentQuestion;
    const runtime = practiceRuntime;
    runtime.actor.send({ type: "BEGIN_SUBMIT", questionId: question.id, now: now() });
    const draft = runtime.actor.getSnapshot().context.session.drafts[question.id];
    const durationMs = timingEnabled ? draft.elapsed_ms : undefined;
    void controller.submitAttempt({
      questionId: question.id,
      questionRelation: preview?.scan.blockIdsByQuestionId.get(question.id),
      sessionId,
      questionType: question.type,
      optionOrder: shuffled.optionOrder,
      selectedOptionIds: draft.selected_option_ids,
      objectiveCorrect: draft.objective_correct,
      masteryRating: rating,
      subjectiveScore: draft.subjective_score,
      durationMs,
    }, filter === "due" ? dueCards.get(question.id) : undefined).then((result) => {
      if (result.warnings.length > 0) error = result.warnings.join("; ");
      runtime.actor.send({ type: "SUBMIT_SUCCEEDED", attempt: result.event, now: now() });
    }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      error = message;
      runtime.actor.send({ type: "SUBMIT_FAILED", message, now: now() });
    }).finally(() => {
      submitting = false;
    });
  }

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
    documentId = stored.sourceKey;
    invalidateDocumentTarget();
    scanDocument(false);
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

  function topicLabel(topic: TopicNode): string {
    const depth = Math.max(0, topic.level - 1);
    return `${"  ".repeat(depth)}${topic.title}`;
  }

  function messageContext(message: ScanMessage): string {
    return [
      message.questionId ? `${label("question", "Question")}: ${message.questionId}` : "",
      message.line ? `${label("line", "Line")}: ${message.line}` : "",
    ].filter(Boolean).join(" / ");
  }

  function questionTypeLabel(type: QuestionType): string {
    const labels: Record<QuestionType, string> = {
      single: label("questionTypeSingle", "Single choice"),
      multiple: label("questionTypeMultiple", "Multiple choice"),
      indefinite: label("questionTypeIndefinite", "Indefinite choice"),
      "true-false": label("questionTypeTrueFalse", "True or false"),
      subjective: label("questionTypeSubjective", "Subjective"),
      group: label("questionTypeGroup", "Question group"),
    };
    return labels[type];
  }

  async function loadPracticeBreadcrumb(blockId: string): Promise<void> {
    const request = ++breadcrumbRequest;
    if (!loadBreadcrumb) {
      breadcrumbItems = [];
      return;
    }
    try {
      const items = await loadBreadcrumb(blockId);
      if (request === breadcrumbRequest) breadcrumbItems = items;
    } catch {
      if (request === breadcrumbRequest) breadcrumbItems = [];
    }
  }

  function practiceBreadcrumb(node: HTMLElement, state: {
    items: BlockBreadcrumbItem[];
    activeId?: string;
    fallback: string;
  }) {
    breadcrumbScroller = new ScrollableBreadcrumb(node, {
      priority: mobileBreadcrumb ? normalizeBreadcrumbPriority(breadcrumbPriority) : "head",
      onNavigate: (id) => openQuestionSource?.(id),
    });

    const render = (next: typeof state): void => {
      if (next.items.length > 0 && next.items.some((item) => item.name.trim().length > 0)) {
        breadcrumbScroller?.renderMobileItems(
          next.items,
          next.activeId,
          label("expand", "Expand"),
          mobileBreadcrumb
            ? breadcrumbTextDisplay
            : normalizeBreadcrumbTextDisplay("full", 16, 160),
        );
      } else renderFallbackBreadcrumb(node, next.fallback);
    };
    render(state);
    return {
      update: render,
      destroy: () => {
        breadcrumbScroller?.destroy();
        breadcrumbScroller = undefined;
      },
    };
  }

  function renderFallbackBreadcrumb(node: HTMLElement, fallback: string): void {
    const parts = fallback.split(/\s*\/\s*/u).filter(Boolean);
    const fragment = document.createDocumentFragment();
    parts.forEach((part, index) => {
      const text = document.createElement("span");
      text.className = "practice-breadcrumb-fallback-item";
      text.textContent = part;
      fragment.append(text);
      if (index >= parts.length - 1) return;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("stroke-linecap", "round");
      icon.setAttribute("stroke-linejoin", "round");
      icon.setAttribute("aria-hidden", "true");
      icon.classList.add("practice-breadcrumb-separator");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "m9 18 6-6-6-6");
      icon.append(path);
      fragment.append(icon);
    });
    node.replaceChildren(fragment);
  }

  function sourceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      d: label("sourceTypeDocument", "Document"),
      h: label("sourceTypeHeading", "Heading"),
      p: label("sourceTypeParagraph", "Paragraph"),
      l: label("sourceTypeList", "List"),
      i: label("sourceTypeListItem", "List item"),
      t: label("sourceTypeTable", "Table"),
    };
    return labels[type] ?? label("sourceTypeBlock", "Block");
  }

  function completionStatusLabel(attempted: number, total: number): string {
    if (attempted === 0) return label("notStarted", "Not started");
    if (attempted >= total) return label("completed", "Completed");
    return label("inProgress", "In progress");
  }

  function messageClipboardText(message: ScanMessage): string {
    return [
      `[${message.code}] ${message.message}`,
      message.title ? `${label("heading", "Heading")}: ${message.title}` : "",
      messageContext(message),
      message.sourceMarkdown ? `${label("sourceMarkdown", "Original Markdown")}\n${message.sourceMarkdown}` : "",
    ].filter(Boolean).join("\n");
  }

  function scanLogText(): string {
    return scanMessageGroups
      .filter((group) => group.messages.length > 0)
      .map((group) => [
        label(group.key, group.key),
        ...group.messages.map(messageClipboardText),
      ].join("\n\n"))
      .join("\n\n---\n\n");
  }

  async function copyText(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function optionMarkdown(option: ShuffledOption): string {
    if (currentQuestion?.type !== "true-false" || option.markdown) return option.markdown;
    return option.originalId === "true"
      ? label("trueAnswer", "True")
      : label("falseAnswer", "False");
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

<main
  bind:this={rootElement}
  class="question-bank damophus-theme-root damophus-question-bank-theme flex h-full min-h-0 flex-col overflow-hidden"
  data-testid="question-bank"
  data-practice-active={currentQuestion ? "true" : "false"}
>
  <header class="app-header">
    <div>
      <h1>Damophus</h1>
      <span>{label("displayName", "Question Bank")}</span>
      <code class="build-revision" title={buildRevision}>{buildRevision}</code>
    </div>
    <div class="header-actions">
      {#if busy}<span class="status">{label("loading", "Working...")}</span>{/if}
      {#if onClose}
        <Button
          variant="ghost"
          size="icon-sm"
          title={translations["settings.close"] ?? "Close"}
          aria-label={translations["settings.close"] ?? "Close"}
          onclick={onClose}
        >
          <X />
        </Button>
      {/if}
    </div>
  </header>

  {#if error}
    <Alert.Root variant="destructive" class="mx-5 mt-3 w-auto shrink-0">
      <Alert.Title>{label("error", "Operation failed")}</Alert.Title>
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if !binding}
    <section class="setup min-h-0 flex-1 overflow-y-auto" aria-label={label("initialize", "Initialize")}>
      <FormLabel class="mb-2" for="document-id">{label("documentId", "Document ID")}</FormLabel>
      <div class="document-row">
        <Input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" oninput={invalidateDocumentTarget} />
        <Button disabled={!validDocument() || busy} onclick={previewInitialization}>
          {label("previewInitialization", "Preview initialization")}
        </Button>
      </div>
      {#if initializationPreview}
        <div class="preview-line">
          <span>{label("initializationReady", "System document and databases are ready to create")}</span>
          <code>{initializationPreview.path}</code>
          <Button disabled={busy} onclick={confirmInitialization}>
            {label("confirmInitialization", "Create system document")}
          </Button>
        </div>
      {/if}
      <div class="rebind-setup">
        <FormLabel class="mb-2" for="system-document-id">{label("systemDocumentId", "Existing Damophus system document ID")}</FormLabel>
        <div class="document-row">
          <Input id="system-document-id" name="system-document-id" bind:value={systemDocumentId} autocomplete="off" spellcheck="false" oninput={invalidateSystemDocumentTarget} />
          <Button variant="outline" disabled={!/^\d{14}-[a-z0-9]{7}$/u.test(systemDocumentId) || busy} onclick={previewRebinding}>
            {label("previewRebinding", "Preview reconnection")}
          </Button>
        </div>
        {#if rebindingPreview}
          <div class="preview-line">
            <span>{label("rebindingReady", "Question index and attempt log are ready to reconnect")}</span>
            {#if rebindingPreview.bindingRepairs.length > 0}
              <span>{rebindingPreview.bindingRepairs.length} {label("bindingRepairs", "Database repairs")}</span>
            {/if}
            <Button disabled={busy} onclick={confirmRebinding}>
              {label("confirmRebinding", "Reconnect")}
            </Button>
          </div>
        {/if}
      </div>
    </section>
  {:else}
    {#if !currentQuestion && !practiceRuntime && !complete && !examMode}
      <Tabs.Root bind:value={view} class="mx-4 mt-3 shrink-0" onValueChange={(value) => selectView(value as "practice" | "statistics")}>
        <Tabs.List class="grid w-full grid-cols-2">
          <Tabs.Trigger value="practice">
            <BookOpenCheck size={16} aria-hidden="true" />
            {label("practice", "练习")}
          </Tabs.Trigger>
          <Tabs.Trigger value="statistics">
            <BarChart3 size={16} aria-hidden="true" />
            {label("statistics", "统计")}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
    {/if}

    {#if view === "statistics" && !currentQuestion && !practiceRuntime && !complete && !examMode}
      <Statistics
        snapshot={statisticsSnapshot}
        loading={statisticsLoading}
        range={statisticsRange}
        sort={statisticsSort}
        onRangeChange={changeStatisticsRange}
        onSortChange={changeStatisticsSort}
        {label}
      />
    {:else if examMode}
      <ExamWorkspace
        controller={controller}
        questions={examQuestions}
        blockIdsByQuestionId={preview?.scan.blockIdsByQuestionId ?? new Map()}
        sourceKey={documentId}
        sourceLabel={sourceIdentity?.content ?? documentId}
        {translations}
        {uuid}
        {random}
        {renderQuestionMarkdown}
        onClose={() => { examMode = false; void refreshStoredSessions(); }}
      />
    {:else if queue.length === 0 && !complete}
    <section class="workspace min-h-0 flex-1 overflow-y-auto">
      <div class="workspace-toolbar">
        <div class="document-row">
          <FormLabel class="document-id-label" for="document-id">{label("documentId", "Document ID")}</FormLabel>
          <Input id="document-id" name="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" oninput={invalidateDocumentTarget} />
          <Button variant="outline" size="icon" title={label("scan", "Scan document")} aria-label={label("scan", "Scan document")} disabled={!validDocument() || busy} onclick={() => scanDocument(true)}>
            <ScanLine aria-hidden="true" />
          </Button>
          <label class="auto-scan-control" for="auto-scan-document" title={label("autoScanDocument", "Automatically scan document")}>
            <Switch
              id="auto-scan-document"
              size="sm"
              checked={autoScanDocument}
              onCheckedChange={toggleAutoScanDocument}
              aria-label={label("autoScanDocument", "Automatically scan document")}
            />
            <span>{label("autoScanDocument", "Auto scan")}</span>
          </label>
        </div>
      </div>
        {#if storedSessions.length > 0}
        <section class="unfinished-sessions" aria-label={label("unfinishedSessions", "Unfinished sessions")}>
          <div class="section-heading">
            <strong>{label("unfinishedSessions", "Unfinished sessions")}</strong>
            <Badge variant="secondary">{storedSessions.length}</Badge>
          </div>
          <div class="unfinished-list">
            {#each storedSessions as stored (stored.sourceKey)}
              <div class="unfinished-row">
                {#if stored.result.status === "ok"}
                  <div>
                    <strong>{stored.result.snapshot.source_label ?? stored.sourceKey}</strong>
                    <span>{stored.result.snapshot.completed_question_ids.length} / {stored.result.snapshot.queue_question_ids.length}</span>
                    <small>{new Date(stored.result.snapshot.updated_at).toLocaleString()}</small>
                  </div>
                  <Button variant="outline" size="sm" onclick={() => openStoredSession(stored)}>
                    {label("openSession", "Open")}
                  </Button>
                {:else}
                  <div>
                    <strong>{stored.sourceKey}</strong>
                    <span>{stored.result.status === "unsupported"
                      ? `${label("unsupportedSession", "Unsupported session version")} ${stored.result.schemaVersion}`
                      : label("invalidSession", "Invalid saved session")}</span>
                  </div>
                  <Button variant="outline" size="sm" onclick={() => exportSessionDiagnostic(stored.sourceKey)}>
                    {label("exportDiagnostic", "Export diagnostic")}
                  </Button>
                {/if}
              </div>
            {/each}
          </div>
        </section>
        {/if}

      <Collapsible.Root bind:open={dataPanelOpen} class="workspace-panel data-panel">
        <Collapsible.Trigger class="workspace-panel-trigger" onclick={() => dataPanelUserControlled = true}>
          <span class="workspace-panel-heading">
            <Database aria-hidden="true" />
            <span>
              <strong>{label("attemptData", "Attempt data")}</strong>
              <small>{label("exportAttempts", "Export attempts")} · {label("importAttempts", "Import attempts")}</small>
            </span>
          </span>
          <ChevronDown class={dataPanelOpen ? "open" : ""} aria-hidden="true" />
        </Collapsible.Trigger>
        <Collapsible.Content class="workspace-panel-content">
          <div class="recovery-actions">
            <Button variant="outline" disabled={busy} onclick={exportAttempts}>
              <Download data-icon="inline-start" aria-hidden="true" />
              {label("exportAttempts", "Export attempts")}
            </Button>
            <Button variant="outline" disabled={busy} onclick={() => fileInput?.click()}>
              <Upload data-icon="inline-start" aria-hidden="true" />
              {label("importAttempts", "Import attempts")}
            </Button>
            <Input data-import-file class="hidden" bind:ref={fileInput} type="file" accept="application/json,.json" onchange={selectImportFile} />
          </div>
      {#if importPreview}
        <section class="import-report" aria-label={label("importPreview", "Import preview")}>
          <span><strong>{importPreview.importable}</strong>{label("importable", "Importable")}</span>
          <span><strong>{importPreview.duplicateAttemptIds.length}</strong>{label("duplicates", "Duplicates")}</span>
          <span><strong>{importPreview.orphanQuestionIds.length}</strong>{label("orphans", "Orphans")}</span>
          <Button disabled={busy} onclick={confirmImport}>{label("confirmImport", "Confirm import")}</Button>
          {#if importPreview.orphanQuestionIds.length > 0}
            <code>{importPreview.orphanQuestionIds.join(", ")}</code>
          {/if}
          {#if importPreview.existingRowIssues.length > 0}
            <code>{importPreview.existingRowIssues.map((issue) => issue.message).join("; ")}</code>
          {/if}
        </section>
      {/if}

      {#if importResult}
        <section class="import-report result">
          <span><strong>{importResult.imported}</strong>{label("imported", "Imported")}</span>
          <span><strong>{importResult.duplicateAttemptIds.length}</strong>{label("duplicates", "Duplicates")}</span>
          <span><strong>{importResult.orphanQuestionIds.length}</strong>{label("orphans", "Orphans")}</span>
          <span class:danger={importResult.failures.length > 0}><strong>{importResult.failures.length}</strong>{label("failures", "Failures")}</span>
          {#if importResult.failures.length > 0}
            <code>{importResult.failures.map((failure) => failure.attemptId).join(", ")}</code>
          {/if}
        </section>
      {/if}
        </Collapsible.Content>
      </Collapsible.Root>

      {#if preview}
        <Collapsible.Root bind:open={scanPanelOpen} class="workspace-panel scan-panel">
          <Collapsible.Trigger class="workspace-panel-trigger" onclick={() => scanPanelUserControlled = true}>
            <span class="workspace-panel-heading">
              <ScanLine aria-hidden="true" />
              <span>
                <strong>{label("scanSummary", "Scan summary")}</strong>
                <small>{progressQuestions.length} {label("questions", "questions")} · {preview.scan.report.issues.length} {label("issues", "issues")}</small>
              </span>
            </span>
            <span class="workspace-panel-meta">
              {#if preview.blockers.length > 0}<Badge variant="destructive">{preview.blockers.length}</Badge>{/if}
              <ChevronDown class={scanPanelOpen ? "open" : ""} aria-hidden="true" />
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content class="workspace-panel-content">
        <PracticeScanSummary
          {preview}
          {sourceIdentity}
          progressQuestionCount={progressQuestions.length}
          {completionPercent}
          {attemptedQuestions}
          {untouchedQuestions}
          {reviewQuestions}
          {pendingSync}
          {busy}
          {syncComplete}
          {autoSyncIndex}
          bind:scanDetailsOpen
          {scanMessageGroups}
          {sourceTypeLabel}
          {completionStatusLabel}
          {messageContext}
          {messageClipboardText}
          {scanLogText}
          {copyText}
          {confirmSync}
          {toggleAutoSyncIndex}
          {label}
        />
          </Collapsible.Content>
        </Collapsible.Root>

        <section class="practice-section" aria-labelledby="practice-settings-heading">
          <div class="practice-section-heading">
            <BookOpenCheck aria-hidden="true" />
            <div>
              <h2 id="practice-settings-heading">{label("practice", "Practice")}</h2>
              <span>{label("scope", "Scope")} · {label("order", "Order")} · {label("filter", "Filter")}</span>
            </div>
          </div>
        <section class="practice-settings">
          {#if recoverableSession}
            <div class="session-recovery">
              <div>
                <strong>{label("unfinishedFound", "Unfinished practice found")}</strong>
                <span>{recoverableSession.completed_question_ids.length} / {recoverableSession.queue_question_ids.length}</span>
              </div>
              <div class="session-recovery-actions">
                <Button onclick={() => resumePractice()}>{label("continue", "Continue")}</Button>
                <Button variant="outline" onclick={() => pendingReplacement = true}>{label("newSettings", "Use current settings")}</Button>
              </div>
            </div>
          {/if}

          {#if pendingReplacement && recoverableSession}
            <Alert.Root variant="destructive" class="col-span-full w-auto">
              <Alert.Title>{label("replaceSession", "Replace unfinished practice?")}</Alert.Title>
              <Alert.Description>{label("replaceSessionDescription", "Draft progress will be removed. Submitted attempts are preserved.")}</Alert.Description>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button variant="destructive" size="sm" onclick={confirmRestartPractice}>{label("confirmRestart", "Replace and start")}</Button>
                <Button variant="outline" size="sm" onclick={() => pendingReplacement = false}>{label("cancel", "Cancel")}</Button>
              </div>
            </Alert.Root>
          {/if}

          <div class="scope-control grid gap-2">
            <FormLabel>{label("scope", "Scope")}</FormLabel>
            <Select.Root
              type="single"
              value={topicId || entireDocumentScope}
              onValueChange={(value) => topicId = value === entireDocumentScope ? "" : value}
            >
              <Select.Trigger class="w-full">
                {topicId ? topicLabel(topics.find((topic) => topic.id === topicId) ?? topics[0]) : label("entireDocument", "Entire document")}
              </Select.Trigger>
              <Select.Content>
                <Select.Group>
                  <Select.Item value={entireDocumentScope} label={label("entireDocument", "Entire document")} />
                  {#each topics as topic (topic.id)}
                    <Select.Item value={topic.id} label={topicLabel(topic)} />
                  {/each}
                </Select.Group>
              </Select.Content>
            </Select.Root>
          </div>

          <fieldset class="order-control">
            <legend>{label("order", "Order")}</legend>
            <ToggleGroup.Root
              type="single"
              variant="outline"
              class="grid w-full grid-cols-2"
              value={order}
              onValueChange={(value) => { if (value) order = value as PracticeOrder; }}
            >
              <ToggleGroup.Item value="sequential" title={label("sequential", "Sequential")} aria-label={label("sequential", "Sequential")}>
                <ListOrdered aria-hidden="true" />
                <span class="control-copy">{label("sequential", "Sequential")}</span>
              </ToggleGroup.Item>
              <ToggleGroup.Item value="random" title={label("random", "Random")} aria-label={label("random", "Random")}>
                <Shuffle aria-hidden="true" />
                <span class="control-copy">{label("random", "Random")}</span>
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          </fieldset>

          <fieldset class="filter-control">
            <legend>{label("filter", "Filter")}</legend>
            <ToggleGroup.Root
              type="single"
              variant="outline"
              class="grid w-full grid-cols-4 max-[520px]:grid-cols-2"
              value={filter}
              onValueChange={(value) => { if (value) filter = value as PracticeFilter; }}
            >
              <ToggleGroup.Item value="all" title={label("all", "All")} aria-label={label("all", "All")}>
                <List aria-hidden="true" />
                <span class="control-copy">{label("all", "All")}</span>
              </ToggleGroup.Item>
              <ToggleGroup.Item value="wrong" title={label("wrong", "Wrong")} aria-label={label("wrong", "Wrong")}>
                <CircleX aria-hidden="true" />
                <span class="control-copy">{label("wrong", "Wrong")}</span>
              </ToggleGroup.Item>
              <ToggleGroup.Item value="review" title={label("review", "Review")} aria-label={label("review", "Review")}>
                <RotateCcw aria-hidden="true" />
                <span class="control-copy">{label("review", "Review")}</span>
              </ToggleGroup.Item>
              <ToggleGroup.Item value="due" title={label("due", "Due")} aria-label={label("due", "Due")}>
                <Clock3 aria-hidden="true" />
                <span class="control-copy">{label("due", "Due")}</span>
              </ToggleGroup.Item>
            </ToggleGroup.Root>
          </fieldset>

          <Button
            class="start max-[760px]:w-full"
            disabled={busy || preview.blockers.length > 0 || preview.bindingRepairs.length > 0 || (!syncComplete && preview.actions.some((action) => action.kind === "add"))}
            onclick={startPractice}
          >
            <BookOpenCheck data-icon="inline-start" aria-hidden="true" />
            <span>{label("start", "Start practice")}</span>
          </Button>
          <Button
            class="max-[760px]:w-full"
            variant="outline"
            disabled={busy || preview.blockers.length > 0 || preview.bindingRepairs.length > 0 || (!syncComplete && preview.actions.some((action) => action.kind === "add"))}
            onclick={() => examMode = true}
          >
            <Clock3 data-icon="inline-start" aria-hidden="true" />
            <span>{label("startExam", "Start exam")}</span>
          </Button>
        </section>
        </section>
      {/if}
    </section>
  {:else if currentQuestion}
    <section class="practice min-h-0 flex-1 overflow-hidden" aria-live="polite">
      <div class="practice-bar">
        <div class="practice-status">
          <span class="progress-copy">
            <span class="progress-label">{label("progress", "Progress")} </span>
            {questionIndex + 1} / {queue.length}
            <span class="submitted-copy"> · {completedQuestionIndices.length} {label("submitted", "submitted")}</span>
          </span>
          {#if timingEnabled}
            <span class="timer" title={label("sessionElapsed", "Session elapsed time")}>
              <svg aria-hidden="true"><use href="#iconClock"></use></svg>
              {formatDuration(sessionElapsedMs)}
            </span>
          {/if}
        </div>
        <div
          class="practice-topic practice-breadcrumb"
          use:practiceBreadcrumb={{
            items: breadcrumbItems,
            activeId: currentQuestionBlockId,
            fallback: currentQuestion.metadata.topicPath.join(" / "),
          }}
          aria-label="Breadcrumb"
        ></div>
        <div class="practice-controls">
          <Button variant="ghost" size="icon" disabled={questionIndex === 0 || submitting} title={label("previous", "Previous question")} aria-label={label("previous", "Previous question")} onclick={previousQuestion}>
            <ChevronLeft size={17} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" disabled={questionIndex >= queue.length - 1 || submitting} title={label("next", "Next question")} aria-label={label("next", "Next question")} onclick={nextQuestion}>
            <ChevronRight size={17} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            data-practice-timer-toggle
            disabled={submitting || reviewing}
            title={timerPaused ? label("resumeTimer", "Resume timer") : label("pauseTimer", "Pause timer")}
            aria-label={timerPaused ? label("resumeTimer", "Resume timer") : label("pauseTimer", "Pause timer")}
            aria-pressed={timerPaused}
            onclick={togglePracticeTimer}
          >
            {#if timerPaused}
              <Play size={17} aria-hidden="true" />
            {:else}
              <Pause size={17} aria-hidden="true" />
            {/if}
          </Button>
          {#if reviewing}
            <Button variant="ghost" size="icon" data-practice-return title={label("exitReview", "Return to summary")} aria-label={label("exitReview", "Return to summary")} onclick={exitReview}>
              <ArrowLeft size={17} aria-hidden="true" />
            </Button>
          {:else}
            <Button variant="ghost" size="icon" data-practice-return disabled={submitting} title={label("pause", "Pause and return")} aria-label={label("pause", "Pause and return")} onclick={pausePractice}>
              <ArrowLeft size={17} aria-hidden="true" />
            </Button>
          {/if}
          <Button variant="ghost" size="icon" disabled={submitting} title={label("end", "End practice")} aria-label={label("end", "End practice")} onclick={requestEndPractice}>
            <X size={17} aria-hidden="true" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="answer-card-button"
          title={label("answerCard", "Answer card")}
          aria-label={label("answerCard", "Answer card")}
          aria-expanded={answerCardOpen}
          onclick={() => answerCardOpen = !answerCardOpen}
        >
          <LayoutGrid size={17} aria-hidden="true" />
        </Button>
      </div>
      {#if endConfirmation}
        <Alert.Root variant="destructive" class="mx-5 mt-3 w-auto shrink-0">
          <Alert.Title>{label("confirmEnd", "End this practice?")}</Alert.Title>
          <Alert.Description>{label("confirmEndDescription", "Draft progress will be removed. Submitted attempts are preserved.")}</Alert.Description>
          <div class="mt-3 flex gap-2">
            <Button variant="destructive" size="sm" onclick={confirmEndPractice}>{label("endNow", "End practice")}</Button>
            <Button variant="outline" size="sm" onclick={() => endConfirmation = false}>{label("cancel", "Cancel")}</Button>
          </div>
        </Alert.Root>
      {/if}
      {#if practiceSaveStatus === "error"}
        <Alert.Root variant="destructive" class="mx-5 mt-3 w-auto shrink-0">
          <Alert.Title>{label("saveFailed", "Progress was not saved")}</Alert.Title>
          <Alert.Description>{practiceSaveError}</Alert.Description>
          <Button class="mt-3" variant="outline" size="sm" onclick={retryPracticeSave}>{label("retrySave", "Retry save")}</Button>
        </Alert.Root>
      {:else if practiceSaveStatus === "saving"}
        <span class="save-status">{label("saving", "Saving...")}</span>
      {/if}
      {#if recoveryIssues.length > 0}
        <Alert.Root class="mx-5 mt-3 w-auto shrink-0">
          <Alert.Title>{label("recoveryChanges", "Source changes were reconciled")}</Alert.Title>
          <Alert.Description>{recoveryIssues.map((issue) => `${issue.questionId}: ${label(issue.code, issue.code)}`).join("; ")}</Alert.Description>
        </Alert.Root>
      {/if}
      {#if answerCardOpen}
        <button
          class="answer-card-scrim"
          aria-label={label("closeAnswerCard", "Close answer card")}
          onclick={() => answerCardOpen = false}
        ></button>
        <aside class="answer-card-panel" aria-label={label("answerCard", "Answer card")}>
          <header>
            <strong>{label("answerCard", "Answer card")}</strong>
            <span>{completedQuestionIndices.length} / {queue.length}</span>
            <Button
              variant="ghost"
              size="icon"
              title={label("closeAnswerCard", "Close answer card")}
              aria-label={label("closeAnswerCard", "Close answer card")}
              onclick={() => answerCardOpen = false}
            >
              <svg aria-hidden="true"><use href="#iconClose"></use></svg>
            </Button>
          </header>
          <div class="answer-card-grid">
            {#each queue as question, index (question.id)}
              <Button
                variant={index === questionIndex ? "default" : completedQuestionIndices.includes(index) ? "secondary" : "outline"}
                class="h-auto min-h-9 w-full min-w-0 aspect-square p-1 tabular-nums disabled:opacity-100"
                aria-current={index === questionIndex ? "step" : undefined}
                aria-label={`${label("question", "Question")} ${index + 1}`}
                onclick={() => goToQuestion(index)}
              >{index + 1}</Button>
            {/each}
          </div>
        </aside>
      {/if}
      <ScrollArea.Root class="practice-content min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
        <PracticeQuestionContent
          {currentQuestion}
          {currentGroup}
          {currentQuestionBlockId}
          {displayedOptions}
          {selectedOptionIds}
          {revealed}
          {readOnlyQuestion}
          {objectiveCorrect}
          {subjectiveScore}
          {currentAttempt}
          {inheritSourceStyles}
          {questionRenderMode}
          {openQuestionSource}
          renderQuestionContent={renderedQuestionContent}
          {mountSourceBlock}
          {questionTypeLabel}
          {optionMarkdown}
          {formatDuration}
          {toggleOption}
          {changeSubjectiveScore}
          {label}
        />
      </ScrollArea.Root>

      {#if readOnlyQuestion}
        <div class="action-bar review-navigation">
          <Button variant="outline" disabled={questionIndex === 0} onclick={previousQuestion}>{label("previous", "Previous question")}</Button>
          <Button variant="outline" disabled={questionIndex >= queue.length - 1} onclick={nextQuestion}>{label("next", "Next question")}</Button>
        </div>
      {:else if !revealed}
        <div class="action-bar">
          {#if timingEnabled}
            <span class="question-timer">{formatDuration(questionElapsedMs)}</span>
          {/if}
          <Button onclick={revealAnswer}>
            <svg data-icon="inline-start" aria-hidden="true"><use href="#iconEye"></use></svg>
            {label("reveal", "Reveal answer")}
          </Button>
        </div>
      {:else}
        <div class="rating-bar">
          <Button variant="outline" size="icon" class="mr-1" title={label("retry", "Undo and retry")} aria-label={label("retry", "Undo and retry")} disabled={submitting} onclick={retry}>
            <svg aria-hidden="true"><use href="#iconUndo"></use></svg>
          </Button>
          {#each ["again", "hard", "good", "easy"] as rating}
            <Button variant={suggestedRating === rating ? "secondary" : "outline"} class="min-w-0 px-1" disabled={submitting} onclick={() => submitRating(rating as MasteryRating)}>{label(rating, rating)}</Button>
          {/each}
        </div>
      {/if}
    </section>
  {:else if complete}
    <PracticeCompletion
      {queue}
      submittedCount={sessionAttempts.length}
      correctCount={completionCorrect}
      {completionDurationMs}
      {touchedDrafts}
      {formatDuration}
      {goToQuestion}
      {resetPractice}
      {label}
    />
    {/if}
  {/if}
</main>

<style>
  /* Keep the reset inside the question-bank surface. A document-wide `*`
     reset also reaches SiYuan's SVG sprite and breaks native icons in the
     mobile WebView when a theme supplies duplicate symbol ids. */
  :global(.question-bank), :global(.question-bank *) { box-sizing: border-box; }
  :global(.question-bank button), :global(.question-bank input), :global(.question-bank select) { font: inherit; letter-spacing: 0; }
  :global(.question-bank .lucide) { fill: none !important; stroke: currentColor; stroke-width: 2; }
  .question-bank { color: var(--b3-theme-on-background); background: var(--b3-theme-background); font-family: var(--b3-font-family); font-size: var(--b3-font-size); container-type: inline-size; }
  .question-bank :global(button), .question-bank :global([role="button"]) { touch-action: manipulation; -webkit-tap-highlight-color: color-mix(in srgb, var(--b3-theme-primary) 14%, transparent); }
  .app-header { min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .app-header > div { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h1 { margin: 0; font-size: 20px; line-height: 1.2; }
  h2 { margin: 0; font-size: 18px; line-height: 1.45; }
  .app-header span, .status { color: var(--b3-theme-on-surface); font-size: 13px; }
  .build-revision { color: var(--b3-theme-on-surface-light); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  section { padding: 18px 20px; }
  .workspace-toolbar { position: relative; z-index: 2; }
  .document-row { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto auto; align-items: center; gap: 10px; }
  .auto-scan-control { min-width: max-content; display: inline-flex; align-items: center; gap: 7px; color: var(--b3-theme-on-surface); font-size: 12px; cursor: pointer; }
  :global(.workspace-panel) { margin-top: 12px; border: 1px solid var(--b3-border-color); border-radius: 10px; background: var(--b3-theme-surface); overflow: hidden; }
  :global(.workspace-panel-trigger) { width: 100%; min-height: 58px; padding: 10px 14px; border: 0; background: transparent; color: inherit; display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; cursor: pointer; }
  :global(.workspace-panel-trigger:hover) { background: var(--b3-list-hover); }
  :global(.workspace-panel-trigger:focus-visible) { outline: 2px solid var(--b3-theme-primary); outline-offset: -2px; }
  .workspace-panel-heading, .workspace-panel-meta { min-width: 0; display: flex; align-items: center; gap: 10px; }
  .workspace-panel-heading > :global(svg) { width: 19px; height: 19px; flex: 0 0 19px; color: var(--b3-theme-primary); }
  .workspace-panel-heading > span { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .workspace-panel-heading strong { font-size: 14px; }
  .workspace-panel-heading small { color: var(--b3-theme-on-surface); font-size: 11px; overflow-wrap: anywhere; }
  .workspace-panel-meta > :global(svg), :global(.workspace-panel-trigger > svg) { width: 17px; height: 17px; flex: 0 0 17px; color: var(--b3-theme-on-surface); transition: transform 160ms ease; }
  .workspace-panel-meta > :global(svg.open), :global(.workspace-panel-trigger > svg.open) { transform: rotate(180deg); }
  :global(.workspace-panel-content) { border-top: 1px solid var(--b3-border-color); }
  .setup { max-width: 760px; }
  .setup .document-row { grid-template-columns: minmax(220px, 1fr) auto; }
  .rebind-setup { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--b3-border-color); }
  .preview-line { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
  .recovery-actions { padding: 14px 16px 0; display: flex; justify-content: flex-end; gap: 8px; }
  .unfinished-sessions { margin: 14px -20px 0; padding: 14px 20px; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .section-heading { display: flex; align-items: center; gap: 8px; }
  .unfinished-list { margin-top: 10px; display: grid; gap: 1px; background: var(--b3-border-color); }
  .unfinished-row { min-width: 0; padding: 10px 12px; background: var(--b3-theme-surface); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .unfinished-row > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; }
  .unfinished-row strong { overflow-wrap: anywhere; }
  .unfinished-row span, .unfinished-row small { color: var(--b3-theme-on-surface); font-size: 12px; }
  .unfinished-row small { grid-column: 1 / -1; }
  .import-report { margin-top: 12px; padding: 12px 16px; border-top: 1px solid var(--b3-border-color); display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
  .import-report span { min-width: 76px; display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 12px; }
  .import-report strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .import-report code { flex-basis: 100%; overflow-wrap: anywhere; }
  .practice-section { margin-top: 16px; padding: 16px; border: 1px solid var(--b3-border-color); border-radius: 10px; }
  .practice-section-heading { display: flex; align-items: center; gap: 10px; }
  .practice-section-heading > :global(svg) { width: 20px; height: 20px; flex: 0 0 20px; color: var(--b3-theme-primary); }
  .practice-section-heading h2 { font-size: 16px; text-wrap: balance; }
  .practice-section-heading span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .practice-settings { padding: 16px 0 0; display: grid; grid-template-columns: minmax(180px, 1.3fr) minmax(190px, 0.9fr) minmax(320px, 1.6fr) auto; gap: 14px; align-items: end; }
  .session-recovery { grid-column: 1 / -1; padding: 12px; border: 1px solid var(--b3-border-color); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .session-recovery > div:first-child { display: flex; align-items: baseline; gap: 10px; }
  .session-recovery span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .session-recovery-actions { display: flex; gap: 8px; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 6px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .practice { position: relative; min-height: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
  .practice-bar { min-height: 44px; padding: 5px 14px 5px 20px; border-bottom: 1px solid var(--b3-border-color); display: grid; grid-template-columns: max-content minmax(0, 1fr) max-content 34px; align-items: center; gap: 12px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .practice-status { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
  .timer { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .timer svg { width: 14px; height: 14px; fill: currentColor; }
  .practice-topic { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  .practice-breadcrumb :global(.practice-breadcrumb-fallback-item) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .practice-breadcrumb :global(.practice-breadcrumb-separator) { width: 13px; height: 13px; flex: 0 0 13px; opacity: 0.58; }
  .practice-controls { display: flex; align-items: center; min-width: max-content; }
  .save-status { padding: 4px 20px; color: var(--b3-theme-on-surface); font-size: 11px; text-align: right; }
  .answer-card-scrim { position: absolute; z-index: 3; inset: 44px 0 58px; width: 100%; min-height: 0; padding: 0; border: 0; border-radius: 0; background: color-mix(in srgb, var(--b3-theme-background) 54%, transparent); }
  .answer-card-panel { position: absolute; z-index: 4; top: 52px; right: 12px; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 122px); padding: 14px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-background); box-shadow: var(--b3-dialog-shadow); overflow: auto; }
  .answer-card-panel header { min-height: 34px; display: grid; grid-template-columns: minmax(0, 1fr) auto 34px; align-items: center; gap: 10px; }
  .answer-card-panel header span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .answer-card-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(5, minmax(38px, 1fr)); gap: 8px; }
  .action-bar, .rating-bar { min-height: 58px; padding: 10px 20px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .action-bar:has(.question-timer) { justify-content: space-between; }
  .question-timer { color: var(--b3-theme-on-surface); font-size: 12px; font-variant-numeric: tabular-nums; }
  :global(.damophus-question-bank-mobile-dialog .b3-dialog__header) { display: none !important; }
  :global(.damophus-question-bank-mobile-dialog .b3-dialog__container) { padding-top: 0 !important; }
  .rating-bar { display: grid; grid-template-columns: 34px repeat(4, minmax(76px, 112px)); }

  @container (max-width: 960px) {
    .question-bank[data-practice-active="true"] .app-header { display: none; }
    .app-header { padding-inline: 14px; }
    .app-header { align-items: flex-start; }
    .header-actions { flex-direction: column; align-items: flex-end; gap: 6px; }
    section { padding: 14px; }
    .document-row { grid-template-columns: minmax(0, 1fr) 34px auto; }
    :global(.document-id-label) { display: none; }
    .recovery-actions { justify-content: stretch; }
    .practice-settings {
      grid-template-columns: minmax(0, 1fr) minmax(190px, 0.75fr);
      gap: 12px;
    }
    .filter-control, .practice-settings :global(button.start) { grid-column: 1 / -1; }
    .practice-settings :global(button.start) { width: 100%; }
    .unfinished-sessions { margin-inline: -14px; padding-inline: 14px; }
    .unfinished-row { align-items: flex-start; }
    .unfinished-row > div { grid-template-columns: 1fr; }
    .unfinished-row small { grid-column: auto; }
    .session-recovery { align-items: stretch; flex-direction: column; }
    .session-recovery-actions > :global(*) { flex: 1; }
    .practice-bar {
      min-height: 68px;
      padding: 5px 8px 4px 10px;
      grid-template-columns: auto minmax(0, 1fr) auto 32px;
      grid-template-rows: 34px 20px;
      grid-template-areas:
        "timer spacer controls card"
        "topic topic topic progress";
      column-gap: 4px;
      row-gap: 2px;
    }
    .practice-status { display: contents; }
    .progress-copy { grid-area: progress; justify-self: end; align-self: center; font-variant-numeric: tabular-nums; }
    .progress-label, .submitted-copy { display: none; }
    .timer { grid-area: timer; align-self: center; }
    .practice-topic { grid-area: topic; display: block; text-align: left; align-self: center; font-size: 12px; }
    .practice-controls { grid-area: controls; gap: 1px; justify-self: end; }
    .practice-controls :global(button), .practice-bar > :global(.answer-card-button) { width: 32px; height: 32px; }
    .practice-controls :global(button[data-practice-return]) { order: -1; }
    .practice-bar > :global(.answer-card-button) { grid-area: card; }
    .answer-card-panel { top: 68px; right: 0; bottom: 48px; width: 100%; max-height: none; border-width: 0 0 1px; border-radius: 0; box-shadow: none; }
    .answer-card-grid { grid-template-columns: repeat(5, minmax(36px, 1fr)); }
    .action-bar, .rating-bar { min-height: 48px; }
    .action-bar { padding: 6px 10px; }
    .action-bar .question-timer { display: none; }
    .rating-bar { grid-template-columns: 34px repeat(4, minmax(0, 1fr)); padding: 8px; gap: 5px; }
  }

  @container (max-width: 760px) {
    .workspace { padding-top: 0; }
    .workspace-toolbar {
      position: sticky;
      top: 0;
      margin: -14px -14px 0;
      padding: 10px 14px 8px;
      border-bottom: 1px solid var(--b3-border-color);
      background: color-mix(in srgb, var(--b3-theme-background) 94%, transparent);
      backdrop-filter: blur(14px);
    }
    :global(.workspace-panel) { margin-top: 10px; }
    :global(.workspace-panel-trigger) { min-height: 54px; padding: 9px 12px; }
    .recovery-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .document-row :global(button) { width: 44px; height: 44px; }
    .auto-scan-control { min-height: 44px; }
    .practice-settings :global([data-slot="toggle-group-item"]),
    .practice-settings :global(button.start) { min-height: 44px; }
    .practice-section { margin-top: 10px; padding: 12px; }
    .practice-settings { padding-top: 12px; }
  }

  @container (max-width: 430px) {
    .document-row { grid-template-columns: minmax(0, 1fr) 44px; }
    .auto-scan-control { grid-column: 1 / -1; justify-self: end; }
    .practice-settings { grid-template-columns: 1fr; }
    .filter-control, .practice-settings :global(button.start) { grid-column: auto; }
  }

  @media (prefers-reduced-motion: reduce) {
    .workspace-panel-meta > :global(svg), :global(.workspace-panel-trigger > svg) { transition: none; }
  }
</style>
