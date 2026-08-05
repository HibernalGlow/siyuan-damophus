<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { ArrowLeft, ChevronLeft, ChevronRight, Pause, X } from "lucide-svelte";
  import * as Alert from "@/components/ui/alert";
  import { Badge } from "@/components/ui/badge";
  import { Button, buttonVariants } from "@/components/ui/button";
  import * as Collapsible from "@/components/ui/collapsible";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import * as Progress from "@/components/ui/progress";
  import * as ScrollArea from "@/components/ui/scroll-area";
  import * as Select from "@/components/ui/select";
  import { Switch } from "@/components/ui/switch";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import { gradeQuestion } from "@/question-bank/core/answer";
  import {
    questionOptionsFromOrder,
    restoreQuestionOptions,
    shuffleQuestionOptions,
  } from "@/question-bank/core/shuffle";
  import type {
    AttemptAggregate,
    AttemptEvent,
    MasteryRating,
    Question,
    QuestionGroup,
    QuestionType,
    ScanMessage,
    ShuffledOption,
    ShuffledQuestion,
    TopicNode,
  } from "@/question-bank/core/types";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import {
    createPracticeQueue,
    PracticeSessionRuntime,
    suggestedMasteryRating,
    type PracticeOrder,
    type PracticeSessionActorSnapshot,
    type PracticeSessionSaveStatus,
  } from "@/question-bank/application";
  import {
    createPracticeSessionSnapshot,
    practiceQuestionElapsedMs,
    practiceSessionElapsedMs,
    reconcilePracticeSession,
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
  export let renderQuestionMarkdown: ((markdown: string, inheritStyles: boolean) => string | undefined) | undefined = undefined;
  export let onInheritSourceStylesChange: ((value: boolean) => void) | undefined = undefined;
  export let timingEnabled = true;
  export let now: () => number = Date.now;

  const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
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
  let unsubscribePracticeState: (() => void) | undefined;
  let unsubscribeSaveStatus: (() => void) | undefined;
  let completionHandledSessionId = "";
  let scanDetailsOpen = false;
  let scanMessageGroups: Array<{ key: string; messages: ScanMessage[] }> = [];

  const entireDocumentScope = "__damophus_entire_document__";

  $: questions = preview?.scan.report.document.questions ?? [];
  $: progressQuestions = questions.filter((question) => question.type !== "group");
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

  onMount(() => {
    const host = rootElement.closest<HTMLElement>(".damophus-question-bank-host");
    const command = (event: Event) => {
      const detail = (event as CustomEvent<"previous" | "next" | "pause">).detail;
      if (detail === "previous") previousQuestion();
      else if (detail === "next") nextQuestion();
      else if (detail === "pause") void pausePractice();
    };
    host?.addEventListener("damophus-practice-command", command);
    void refreshStoredSessions();
    return () => host?.removeEventListener("damophus-practice-command", command);
  });

  onDestroy(() => {
    clearTimer();
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
      error = reason instanceof Error ? reason.message : String(reason);
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

  function scanDocument(): void {
    void run(async () => {
      const [nextPreview, nextSourceIdentity, stored] = await Promise.all([
        controller.previewSync(documentId),
        controller.loadSourceIdentity(documentId),
        controller.loadPracticeSession(documentId),
      ]);
      preview = nextPreview;
      sourceIdentity = nextSourceIdentity;
      recoverableSession = stored?.status === "ok" ? stored.snapshot : undefined;
      if (preview.bindingRepairs.length === 0) {
        [aggregates, dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadDueCards(preview.scan.blockIdsByQuestionId),
        ]);
      } else {
        aggregates = new Map();
        dueCards = new Map();
      }
      syncComplete = false;
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

  function confirmSync(): void {
    if (!preview) return;
    void run(async () => {
      preview = await controller.confirmSync(documentId, preview!.token);
      const failures = preview.results.filter((result) => result.status === "failed");
      syncComplete = failures.length === 0;
      if (failures.length > 0) {
        error = failures.map((failure) => `${failure.questionId}: ${failure.message ?? "failed"}`).join("; ");
      } else {
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
    if (host) host.dataset.practiceActive = String(snapshot.matches("active") || snapshot.matches("reviewing"));
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
  }

  async function activateRuntime(
    snapshot: PracticeSessionSnapshot,
    attempts: ReadonlyMap<string, AttemptEvent>,
    persistedRevision: number,
  ): Promise<void> {
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
    recoveryIssues = [];
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
    if (!await controller.acquirePracticeSession(documentId)) {
      throw new Error(label("sessionInUse", "This practice session is open in another window"));
    }
    controller.saveRecentScope({
      documentId,
      headingBlockId: topicId ? preview.scan.topicBlockIdsByTopicId.get(topicId) : undefined,
    });
    const snapshot = createPracticeSessionSnapshot({
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
    await activateRuntime(snapshot, new Map(), -1);
  }

  function resumePractice(snapshot = recoverableSession): void {
    if (!snapshot || !preview) return;
    void run(async () => {
      if (!await controller.acquirePracticeSession(snapshot.source_key)) {
        throw new Error(label("sessionInUse", "This practice session is open in another window"));
      }
      try {
        const attempts = await controller.loadSessionAttempts(snapshot.session_id);
        const recovery = reconcilePracticeSession(snapshot, questions, attempts, new Date(now()));
        if (!recovery.snapshot) {
          throw new Error(label("sessionHasNoQuestions", "None of this session's questions still exist"));
        }
        recoveryIssues = recovery.issues;
        await activateRuntime(recovery.snapshot, recovery.attemptsByQuestionId, snapshot.revision);
      } catch (reason) {
        await controller.releasePracticeSession(snapshot.source_key);
        throw reason;
      }
    });
  }

  function confirmRestartPractice(): void {
    const previous = recoverableSession;
    if (!previous) {
      pendingReplacement = false;
      return;
    }
    void run(async () => {
      await controller.removePracticeSession(previous.source_key, previous.session_id);
      recoverableSession = undefined;
      pendingReplacement = false;
      await beginNewPractice();
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
    scanDocument();
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
    return renderQuestionMarkdown?.(markdown, sourceStyles) ?? renderMarkdownHtml(markdown);
  }

  function toggleSourceStyles(checked: boolean): void {
    inheritSourceStyles = checked;
    onInheritSourceStylesChange?.(checked);
  }
</script>

<main bind:this={rootElement} class="question-bank damophus-theme-root damophus-question-bank-theme flex h-full min-h-0 flex-col overflow-hidden" data-testid="question-bank">
  <header class="app-header">
    <div>
      <h1>Damophus</h1>
      <span>{label("displayName", "Question Bank")}</span>
    </div>
    <div class="header-actions">
      <FormLabel class="cursor-pointer gap-2" for="source-style-toggle">
        <Switch
          id="source-style-toggle"
          checked={inheritSourceStyles}
          onCheckedChange={toggleSourceStyles}
          aria-label={label("inheritSourceStyles", "Use source styles")}
        />
        <span>{inheritSourceStyles ? label("inheritSourceStyles", "Use source styles") : label("plainDisplay", "Plain display")}</span>
      </FormLabel>
      {#if busy}<span class="status">{label("loading", "Working...")}</span>{/if}
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
          <Input id="system-document-id" bind:value={systemDocumentId} autocomplete="off" spellcheck="false" oninput={invalidateSystemDocumentTarget} />
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
  {:else if queue.length === 0 && !complete}
    <section class="workspace min-h-0 flex-1 overflow-y-auto">
      <div class="document-row">
        <FormLabel class="max-[760px]:col-span-full" for="document-id">{label("documentId", "Document ID")}</FormLabel>
        <Input id="document-id" bind:value={documentId} autocomplete="off" spellcheck="false" oninput={invalidateDocumentTarget} />
        <Button variant="outline" size="icon" title={label("scan", "Scan document")} aria-label={label("scan", "Scan document")} disabled={!validDocument() || busy} onclick={scanDocument}>
          <svg aria-hidden="true"><use href="#iconRefresh"></use></svg>
        </Button>
      </div>
      <div class="recovery-actions">
        <Button class="max-[760px]:flex-1" variant="outline" disabled={busy} onclick={exportAttempts}>
          <svg data-icon="inline-start" aria-hidden="true"><use href="#iconDownload"></use></svg>
          {label("exportAttempts", "Export attempts")}
        </Button>
        <Button class="max-[760px]:flex-1" variant="outline" disabled={busy} onclick={() => fileInput?.click()}>
          <svg data-icon="inline-start" aria-hidden="true"><use href="#iconUpload"></use></svg>
          {label("importAttempts", "Import attempts")}
        </Button>
        <Input data-import-file class="hidden" bind:ref={fileInput} type="file" accept="application/json,.json" onchange={selectImportFile} />
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

      {#if preview}
        <section class="scan-summary" aria-label={label("scanSummary", "Scan summary")}>
          <div class="source-progress-overview">
            {#if sourceIdentity}
              <div class="source-identity" data-testid="source-identity">
                <div class="source-heading">
                  <Badge variant="outline">{sourceTypeLabel(sourceIdentity.type)}</Badge>
                  <strong>{sourceIdentity.content}</strong>
                </div>
                {#if sourceIdentity.hpath}<span>{sourceIdentity.hpath}</span>{/if}
                <code>{sourceIdentity.id}</code>
              </div>
            {/if}
            <div class="completion-overview" data-testid="completion-overview">
              <div class="completion-heading">
                <span>{label("completion", "Completion")}</span>
                <Badge variant={completionPercent === 100 ? "default" : attemptedQuestions > 0 ? "secondary" : "outline"}>
                  {completionStatusLabel(attemptedQuestions, progressQuestions.length)}
                </Badge>
                <strong>{completionPercent}%</strong>
              </div>
              <Progress.Root
                class="h-2"
                value={completionPercent}
                max={100}
                aria-label={label("completionProgress", "Question completion progress")}
              />
              <div class="progress-stats">
                <span><strong>{progressQuestions.length}</strong>{label("questions", "Questions")}</span>
                <span><strong>{attemptedQuestions}</strong>{label("attempted", "Attempted")}</span>
                <span><strong>{untouchedQuestions}</strong>{label("untouched", "Untouched")}</span>
                <span><strong>{reviewQuestions}</strong>{label("needsReview", "Needs review")}</span>
              </div>
            </div>
          </div>
          <div class="summary-grid">
            <span><strong>{preview.actions.filter((action) => action.kind === "add").length}</strong>{label("additions", "Additions")}</span>
            <span><strong>{preview.actions.filter((action) => action.kind === "update").length}</strong>{label("updates", "Updates")}</span>
            <span><strong>{preview.scan.report.inferences.length}</strong>{label("inferences", "Inferences")}</span>
            <span><strong>{preview.scan.report.issues.length}</strong>{label("issues", "Issues")}</span>
            <span class:danger={preview.blockers.length > 0}><strong>{preview.blockers.length}</strong>{label("blockers", "Blockers")}</span>
          </div>
          <Button
            variant={pendingSync ? "default" : "outline"}
            disabled={busy || preview.blockers.length > 0 || !pendingSync}
            onclick={confirmSync}
          >
            <svg data-icon="inline-start" aria-hidden="true"><use href="#iconCheck"></use></svg>
            {pendingSync ? label("confirmSync", "Confirm index sync") : label("indexCurrent", "Index is up to date")}
          </Button>
          {#if pendingSync}
            <span class="text-sm font-medium text-primary">
              {preview.blockers.length > 0
                ? label("syncBlocked", "Index changes detected; resolve blockers before syncing")
                : label("syncRequired", "Index changes detected; synchronization is required")}
            </span>
          {:else}
            <span class="text-sm text-muted-foreground">
              {syncComplete ? label("synced", "Question index synchronized") : label("indexCurrent", "Index is up to date")}
            </span>
          {/if}
          <Collapsible.Root bind:open={scanDetailsOpen} class="basis-full border-t border-border pt-2.5 select-text">
            <Collapsible.Trigger class={buttonVariants({ variant: "ghost", size: "sm" })}>
              <svg data-icon="inline-start" aria-hidden="true"><use href={scanDetailsOpen ? "#iconUp" : "#iconDown"}></use></svg>
              {label("scanDetails", "Scan details")}
            </Collapsible.Trigger>
            <Collapsible.Content>
            <div class="scan-detail-actions">
              <span>{label("inferenceNotice", "Inferences describe detected structure and are not errors.")}</span>
              {#if scanMessageGroups.some((group) => group.messages.length > 0)}
                <Button variant="outline" size="sm" type="button" onclick={() => void copyText(scanLogText())}>
                  <svg data-icon="inline-start" aria-hidden="true"><use href="#iconCopy"></use></svg>
                  {label("copyScanLog", "Copy scan log")}
                </Button>
              {/if}
            </div>
            {#each scanMessageGroups as group}
              {#if group.messages.length > 0}
                <div class="report-group">
                  <strong>{label(group.key, group.key)}</strong>
                  <ul>
                    {#each group.messages as message}
                      <li class="report-message">
                        <div class="report-message-heading">
                          <div>
                            <code>{message.code}</code>
                            <span>{message.message}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            type="button"
                            aria-label={label("copyFinding", "Copy finding")}
                            title={label("copyFinding", "Copy finding")}
                            onclick={() => void copyText(messageClipboardText(message))}
                          >
                            <svg aria-hidden="true"><use href="#iconCopy"></use></svg>
                          </Button>
                        </div>
                        {#if message.title}<strong class="message-title">{label("heading", "Heading")}: {message.title}</strong>{/if}
                        {#if messageContext(message)}<small>{messageContext(message)}</small>{/if}
                        {#if message.sourceMarkdown}
                            <Collapsible.Root class="message-source mt-1.5">
                            <Collapsible.Trigger class={buttonVariants({ variant: "ghost", size: "xs" })}>
                              {label("sourceMarkdown", "Original Markdown")}
                            </Collapsible.Trigger>
                            <Collapsible.Content>
                            <pre class="mt-1.5 mb-0 max-h-45 overflow-auto rounded-md border border-border bg-background p-2 whitespace-pre-wrap break-words"><code class="text-xs select-text">{message.sourceMarkdown}</code></pre>
                            </Collapsible.Content>
                          </Collapsible.Root>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            {/each}
            {#if preview.ialWriteActions.length > 0}
              <div class="report-group">
                <strong>{label("ialUpdates", "IAL updates")}</strong>
                <ul>
                  {#each preview.ialWriteActions as action}
                    <li>
                      <code>{action.reason}</code>
                      <span>{action.questionId}: {JSON.stringify(action.attributes)}</span>
                      <small>{action.blockId}</small>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if preview.bindingRepairs.length > 0}
              <div class="report-group">
                <strong>{label("bindingRepairs", "Database repairs")}</strong>
                <ul>
                  {#each preview.bindingRepairs as repair}
                    <li>
                      <code>{repair.database}</code>
                      <span>{String(repair.field)} ({repair.currentType ? `${repair.currentType} -> ` : ""}{repair.type})</span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
            {#if preview.staleQuestionIds.length > 0}
              <div class="report-group">
                <strong>{label("staleQuestions", "Stale questions")}</strong>
                <code>{preview.staleQuestionIds.join(", ")}</code>
              </div>
            {/if}
            </Collapsible.Content>
          </Collapsible.Root>
        </section>

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

          <div class="grid gap-2">
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

          <fieldset>
            <legend>{label("order", "Order")}</legend>
            <ToggleGroup.Root
              type="single"
              variant="outline"
              class="grid w-full grid-cols-2"
              value={order}
              onValueChange={(value) => { if (value) order = value as PracticeOrder; }}
            >
              <ToggleGroup.Item value="sequential">{label("sequential", "Sequential")}</ToggleGroup.Item>
              <ToggleGroup.Item value="random">{label("random", "Random")}</ToggleGroup.Item>
            </ToggleGroup.Root>
          </fieldset>

          <fieldset>
            <legend>{label("filter", "Filter")}</legend>
            <ToggleGroup.Root
              type="single"
              variant="outline"
              class="grid w-full grid-cols-4 max-[520px]:grid-cols-2"
              value={filter}
              onValueChange={(value) => { if (value) filter = value as PracticeFilter; }}
            >
              {#each ["all", "wrong", "review", "due"] as value}
                <ToggleGroup.Item value={value}>{label(value, value)}</ToggleGroup.Item>
              {/each}
            </ToggleGroup.Root>
          </fieldset>

          <Button
            class="start max-[760px]:w-full"
            disabled={busy || preview.blockers.length > 0 || preview.bindingRepairs.length > 0 || (!syncComplete && preview.actions.some((action) => action.kind === "add"))}
            onclick={startPractice}
          >
            <svg data-icon="inline-start" aria-hidden="true"><use href="#iconPlay"></use></svg>
            {label("start", "Start practice")}
          </Button>
        </section>
      {/if}
    </section>
  {:else if currentQuestion}
    <section class="practice min-h-0 flex-1 overflow-hidden" aria-live="polite">
      <div class="practice-bar">
        <div class="practice-status">
          <span>{label("progress", "Progress")} {questionIndex + 1} / {queue.length} · {completedQuestionIndices.length} {label("submitted", "submitted")}</span>
          {#if timingEnabled}
            <span class="timer" title={label("sessionElapsed", "Session elapsed time")}>
              <svg aria-hidden="true"><use href="#iconClock"></use></svg>
              {formatDuration(sessionElapsedMs)}
            </span>
          {/if}
        </div>
        <span class="practice-topic">{currentQuestion.metadata.topicPath.join(" / ")}</span>
        <div class="practice-controls">
          <Button variant="ghost" size="icon" disabled={questionIndex === 0 || submitting} title={label("previous", "Previous question")} aria-label={label("previous", "Previous question")} onclick={previousQuestion}>
            <ChevronLeft size={17} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" disabled={questionIndex >= queue.length - 1 || submitting} title={label("next", "Next question")} aria-label={label("next", "Next question")} onclick={nextQuestion}>
            <ChevronRight size={17} aria-hidden="true" />
          </Button>
          {#if reviewing}
            <Button variant="ghost" size="icon" title={label("exitReview", "Return to summary")} aria-label={label("exitReview", "Return to summary")} onclick={exitReview}>
              <ArrowLeft size={17} aria-hidden="true" />
            </Button>
          {:else}
            <Button variant="ghost" size="icon" disabled={submitting} title={label("pause", "Pause and return")} aria-label={label("pause", "Pause and return")} onclick={pausePractice}>
              <Pause size={17} aria-hidden="true" />
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
          <svg aria-hidden="true"><use href="#iconGrid"></use></svg>
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
          on:click={() => answerCardOpen = false}
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
        <article class="question">
        <div class="question-heading">
          <div class="question-title">
            <Badge variant="secondary" data-question-type={currentQuestion.type}>
              {questionTypeLabel(currentQuestion.type)}
            </Badge>
            <h2>{currentQuestion.title}</h2>
          </div>
          {#if currentQuestionBlockId && openQuestionSource}
            <Button
              variant="ghost"
              size="icon"
              class="shrink-0"
              title={label("openSource", "Open source in SiYuan")}
              aria-label={label("openSource", "Open source in SiYuan")}
              onclick={() => openQuestionSource?.(currentQuestionBlockId as string)}
            >
              <svg aria-hidden="true"><use href="#iconFocus"></use></svg>
            </Button>
          {/if}
        </div>
        {#if currentGroup}
          <div class="group-material">
            <strong>{label("sharedMaterial", "Shared material")}</strong>
            <div class="markdown native-content protyle-wysiwyg" contenteditable="false">{@html renderedQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
          </div>
        {/if}
        <div class="markdown native-content protyle-wysiwyg stem" contenteditable="false">{@html renderedQuestionContent(currentQuestion.stemMarkdown, inheritSourceStyles)}</div>
        {#if displayedOptions.length > 0}
          <div class="options">
            {#each displayedOptions as option (option.originalId)}
              <Button
                variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
                class="option grid h-auto min-h-12 w-full grid-cols-[30px_minmax(0,1fr)] items-start justify-start gap-2 whitespace-normal px-3 py-2 text-left"
                disabled={revealed || readOnlyQuestion}
                aria-pressed={selectedOptionIds.includes(option.originalId)}
                onclick={() => toggleOption(option.originalId)}
              >
                <span class="option-label">{option.displayLabel}</span>
                <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false">{@html renderedQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
              </Button>
            {/each}
          </div>
        {/if}
        </article>

        {#if revealed}
          <section class="answer">
            {#if objectiveCorrect !== null}
              <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect}>
                {objectiveCorrect ? label("correct", "Correct") : label("incorrect", "Incorrect")}
              </strong>
            {/if}
            <div class="markdown native-content protyle-wysiwyg solution" contenteditable="false">{@html renderedQuestionContent(currentQuestion.solutionMarkdown, inheritSourceStyles)}</div>
            {#if currentQuestion.type === "subjective"}
              <FormLabel class="mt-4 flex items-center gap-2.5">
                <span>{label("subjectiveScore", "Self score")}</span>
                <Input class="w-24" type="number" min="0" max="100" step="1" value={subjectiveScore ?? ""} disabled={readOnlyQuestion} oninput={changeSubjectiveScore} />
              </FormLabel>
            {/if}
            {#if currentAttempt}
              <div class="attempt-metadata">
                <Badge variant="outline">{label(currentAttempt.mastery_rating, currentAttempt.mastery_rating)}</Badge>
                <span>{new Date(currentAttempt.answered_at).toLocaleString()}</span>
                {#if currentAttempt.duration_ms !== undefined}<span>{formatDuration(currentAttempt.duration_ms)}</span>{/if}
              </div>
            {/if}
          </section>
        {/if}
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
    <section class="completion min-h-0 flex-1 overflow-y-auto">
      <h2>{queue.length === 0 ? label("noQuestions", "No questions match this scope and filter") : label("complete", "Practice complete")}</h2>
      {#if queue.length > 0}
        <div class="completion-summary">
          <span><strong>{sessionAttempts.length}</strong>{label("submitted", "Submitted")}</span>
          <span><strong>{completionCorrect}</strong>{label("correct", "Correct")}</span>
          <span><strong>{formatDuration(completionDurationMs)}</strong>{label("answerTime", "Answer time")}</span>
          <span><strong>{touchedDrafts}</strong>{label("drafts", "Drafts")}</span>
        </div>
        <div class="completion-review">
          {#each queue as question, index (question.id)}
            <Button variant="outline" onclick={() => goToQuestion(index)}>{index + 1}. {question.title}</Button>
          {/each}
        </div>
      {/if}
      <Button variant="outline" onclick={resetPractice}>{label("restart", "Back to scope")}</Button>
    </section>
  {/if}
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(button), :global(input), :global(select) { font: inherit; letter-spacing: 0; }
  .question-bank { color: var(--b3-theme-on-background); background: var(--b3-theme-background); font-family: var(--b3-font-family); font-size: var(--b3-font-size); container-type: inline-size; }
  .app-header { min-height: 64px; padding: 12px 20px; border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .app-header > div { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
  h1 { margin: 0; font-size: 20px; line-height: 1.2; }
  h2 { margin: 0; font-size: 18px; line-height: 1.45; }
  .app-header span, .status { color: var(--b3-theme-on-surface); font-size: 13px; }
  .header-actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  section { padding: 18px 20px; }
  .document-row { display: grid; grid-template-columns: auto minmax(220px, 1fr) auto; align-items: center; gap: 10px; }
  .setup { max-width: 760px; }
  .setup .document-row { grid-template-columns: minmax(220px, 1fr) auto; }
  .rebind-setup { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--b3-border-color); }
  .preview-line { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--b3-border-color); display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
  .scan-summary { margin: 18px -20px 0; padding: 16px 20px; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .source-progress-overview { flex-basis: 100%; min-width: 0; display: grid; grid-template-columns: minmax(240px, 1fr) minmax(360px, 1.15fr); gap: 24px; align-items: stretch; }
  .source-identity, .completion-overview { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
  .source-heading { min-width: 0; display: flex; align-items: center; gap: 8px; }
  .source-heading strong { min-width: 0; font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
  .source-identity > span { color: var(--b3-theme-on-surface); font-size: 12px; overflow-wrap: anywhere; }
  .source-identity > code { width: fit-content; max-width: 100%; color: var(--b3-theme-on-surface); font-size: 11px; overflow-wrap: anywhere; }
  .completion-heading { min-width: 0; display: grid; grid-template-columns: auto auto minmax(44px, 1fr); align-items: center; gap: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .completion-heading strong { justify-self: end; color: var(--b3-theme-on-background); font-size: 18px; font-variant-numeric: tabular-nums; }
  .progress-stats { display: grid; grid-template-columns: repeat(4, minmax(58px, 1fr)); }
  .progress-stats span { min-width: 0; padding: 2px 9px; border-left: 1px solid var(--b3-border-color); display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 11px; }
  .progress-stats span:first-child { padding-left: 0; border-left: 0; }
  .progress-stats strong { color: var(--b3-theme-on-background); font-size: 15px; font-variant-numeric: tabular-nums; }
  .recovery-actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }
  .unfinished-sessions { margin: 14px -20px 0; padding: 14px 20px; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .section-heading { display: flex; align-items: center; gap: 8px; }
  .unfinished-list { margin-top: 10px; display: grid; gap: 1px; background: var(--b3-border-color); }
  .unfinished-row { min-width: 0; padding: 10px 12px; background: var(--b3-theme-surface); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .unfinished-row > div { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; }
  .unfinished-row strong { overflow-wrap: anywhere; }
  .unfinished-row span, .unfinished-row small { color: var(--b3-theme-on-surface); font-size: 12px; }
  .unfinished-row small { grid-column: 1 / -1; }
  .import-report { margin: 14px -20px 0; padding: 12px 20px; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); display: flex; align-items: center; flex-wrap: wrap; gap: 16px; }
  .import-report span { min-width: 76px; display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 12px; }
  .import-report strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .import-report code { flex-basis: 100%; overflow-wrap: anywhere; }
  .summary-grid { flex: 1; display: grid; grid-template-columns: repeat(5, minmax(74px, 1fr)); gap: 1px; background: var(--b3-border-color); }
  .summary-grid span { min-height: 52px; padding: 7px 9px; background: var(--b3-theme-surface); display: flex; flex-direction: column; justify-content: center; font-size: 12px; color: var(--b3-theme-on-surface); }
  .summary-grid strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .summary-grid .danger strong, .incorrect { color: var(--b3-theme-error); }
  .scan-detail-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .report-group { margin-top: 12px; }
  .report-group > strong { display: block; margin-bottom: 6px; font-size: 13px; }
  .report-group ul { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
  .report-group li { min-width: 0; }
  .report-message-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .report-message-heading > div { min-width: 0; }
  .report-message-heading span { margin-left: 8px; overflow-wrap: anywhere; }
  .message-title { display: block; margin-top: 5px; overflow-wrap: anywhere; }
  .report-group small { display: block; margin-top: 2px; color: var(--b3-theme-on-surface); overflow-wrap: anywhere; }
  .correct { color: var(--b3-theme-success); font-size: 13px; }
  .practice-settings { padding: 20px 0 0; display: grid; grid-template-columns: minmax(180px, 1.4fr) minmax(180px, 1fr) minmax(250px, 1.5fr) auto; gap: 16px; align-items: end; }
  .session-recovery { grid-column: 1 / -1; padding: 12px; border: 1px solid var(--b3-border-color); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .session-recovery > div:first-child { display: flex; align-items: baseline; gap: 10px; }
  .session-recovery span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .session-recovery-actions { display: flex; gap: 8px; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  legend { margin-bottom: 6px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .practice { position: relative; min-height: 0; padding: 0; display: flex; flex-direction: column; overflow: hidden; }
  .practice-bar { min-height: 44px; padding: 5px 14px 5px 20px; border-bottom: 1px solid var(--b3-border-color); display: grid; grid-template-columns: auto minmax(0, 1fr) auto 34px; align-items: center; gap: 12px; color: var(--b3-theme-on-surface); font-size: 13px; }
  .practice-status { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
  .timer { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; }
  .timer svg { width: 14px; height: 14px; fill: currentColor; }
  .practice-topic { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
  .practice-controls { display: flex; align-items: center; }
  .save-status { padding: 4px 20px; color: var(--b3-theme-on-surface); font-size: 11px; text-align: right; }
  .answer-card-scrim { position: absolute; z-index: 3; inset: 44px 0 58px; width: 100%; min-height: 0; padding: 0; border: 0; border-radius: 0; background: color-mix(in srgb, var(--b3-theme-background) 54%, transparent); }
  .answer-card-panel { position: absolute; z-index: 4; top: 52px; right: 12px; width: min(360px, calc(100% - 24px)); max-height: calc(100% - 122px); padding: 14px; border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-background); box-shadow: var(--b3-dialog-shadow); overflow: auto; }
  .answer-card-panel header { min-height: 34px; display: grid; grid-template-columns: minmax(0, 1fr) auto 34px; align-items: center; gap: 10px; }
  .answer-card-panel header span { color: var(--b3-theme-on-surface); font-size: 12px; }
  .answer-card-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(5, minmax(38px, 1fr)); gap: 8px; }
  .question { max-width: 920px; margin: 0 auto; padding: 24px 22px 8px; }
  .question-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .question-title { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .question-heading h2 { min-width: 0; overflow-wrap: anywhere; }
  .markdown { min-width: 0; overflow-wrap: anywhere; }
  .native-content.protyle-wysiwyg { display: block; min-height: 0; padding: 0; overflow: visible; }
  .native-content.protyle-wysiwyg :global([data-node-id]) { max-width: 100%; }
  .native-content.protyle-wysiwyg :global(.protyle-attr),
  .native-content.protyle-wysiwyg :global(.protyle-action),
  .native-content.protyle-wysiwyg :global(.protyle-icons) { display: none !important; }
  .markdown :global(p:first-child) { margin-top: 0; }
  .markdown :global(p:last-child) { margin-bottom: 0; }
  .stem { margin-top: 14px; line-height: 1.75; }
  .group-material { margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--b3-border-color); border-bottom: 1px solid var(--b3-border-color); }
  .group-material > strong { display: block; margin-bottom: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .options { margin-top: 18px; display: grid; gap: 8px; }
  .option-label { width: 26px; height: 26px; border: 1px solid var(--b3-border-color); border-radius: 50%; display: grid; place-items: center; font-weight: 600; }
  .option-content { align-self: center; width: 100%; }
  .option-content :global([data-node-id]) { margin: 0; padding: 0; min-height: 0; }
  .answer { max-width: 920px; margin: 16px auto 0; padding: 18px 22px 24px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .attempt-metadata { margin-top: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }
  .action-bar, .rating-bar { min-height: 58px; padding: 10px 20px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); display: flex; justify-content: flex-end; align-items: center; gap: 8px; }
  .action-bar:has(.question-timer) { justify-content: space-between; }
  .question-timer { color: var(--b3-theme-on-surface); font-size: 12px; font-variant-numeric: tabular-nums; }
  .rating-bar { display: grid; grid-template-columns: 34px repeat(4, minmax(76px, 112px)); }
  .completion { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 16px; text-align: center; }
  .completion-summary { width: min(680px, 100%); display: grid; grid-template-columns: repeat(4, minmax(90px, 1fr)); border: 1px solid var(--b3-border-color); }
  .completion-summary span { padding: 10px; border-left: 1px solid var(--b3-border-color); display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 12px; }
  .completion-summary span:first-child { border-left: 0; }
  .completion-summary strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .completion-review { width: min(680px, 100%); display: grid; gap: 6px; }
  .completion-review :global(button) { min-width: 0; justify-content: flex-start; overflow-wrap: anywhere; white-space: normal; text-align: left; }

  @container (max-width: 760px) {
    .app-header { padding-inline: 14px; }
    .app-header { align-items: flex-start; }
    .header-actions { flex-direction: column; align-items: flex-end; gap: 6px; }
    section { padding: 14px; }
    .document-row { grid-template-columns: 1fr 34px; }
    .scan-summary { margin-inline: -14px; padding-inline: 14px; }
    .source-progress-overview { grid-template-columns: 1fr; gap: 18px; }
    .recovery-actions { justify-content: stretch; }
    .import-report { margin-inline: -14px; padding-inline: 14px; }
    .summary-grid { grid-template-columns: repeat(3, 1fr); flex-basis: 100%; }
    .practice-settings { grid-template-columns: 1fr; gap: 13px; }
    .unfinished-sessions { margin-inline: -14px; padding-inline: 14px; }
    .unfinished-row { align-items: flex-start; }
    .unfinished-row > div { grid-template-columns: 1fr; }
    .unfinished-row small { grid-column: auto; }
    .session-recovery { align-items: stretch; flex-direction: column; }
    .session-recovery-actions > :global(*) { flex: 1; }
    .practice-bar { padding-inline: 10px 8px; grid-template-columns: minmax(0, 1fr) auto 34px; gap: 5px; }
    .practice-status { gap: 8px; }
    .practice-topic { display: none; }
    .answer-card-panel { top: 44px; right: 0; bottom: 58px; width: 100%; max-height: none; border-width: 0 0 1px; border-radius: 0; box-shadow: none; }
    .answer-card-grid { grid-template-columns: repeat(5, minmax(36px, 1fr)); }
    .question, .answer { padding-inline: 14px; }
    .rating-bar { grid-template-columns: 34px repeat(4, minmax(0, 1fr)); padding: 8px; gap: 5px; }
    .completion-summary { grid-template-columns: repeat(2, minmax(90px, 1fr)); }
    .completion-summary span:nth-child(3) { border-left: 0; border-top: 1px solid var(--b3-border-color); }
    .completion-summary span:nth-child(4) { border-top: 1px solid var(--b3-border-color); }
  }
</style>
