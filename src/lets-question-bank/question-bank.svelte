<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { sql, type BlockBreadcrumbItem } from "@/api";
  import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
  import { normalizeBreadcrumbTextDisplay, type BreadcrumbTextDisplay, type BreadcrumbOverflowPriority } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
  import { getLogger } from "@/libs/logger";
  import {
    questionOptionsFromOrder,
    restoreQuestionOptions,
  } from "@/question-bank/core/shuffle";
  import type {
    AttemptAggregate,
    AttemptEvent,
    Question,
    QuestionGroup,
    QuestionType,
    ScanMessage,
    ShuffledOption,
    ShuffledQuestion,
    ObjectiveAnswer,
    QuestionBookmark,
  } from "@/question-bank/core/types";
  import { buildStatistics, type StatisticsQuestion, type StatisticsRange, type StatisticsSnapshot, type StatisticsSort } from "@/question-bank/core/statistics";
  import { projectQuestionIndex } from "@/question-bank/application/projection";
  import {
    normalizeSubjectQuestionTotals,
    normalizeStatisticsLayout,
    type StatisticsLayout,
    type SubjectQuestionTotals,
  } from "@/question-bank/core/subject-dashboard";
  import type { TopicDictionaryDocument } from "@/question-bank/topic-dictionary";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import {
    createPracticeOptionOrder,
    createPracticeQueue,
    suggestedMasteryRating,
    type PracticeOptionOrder,
    type PracticeOrder,
  } from "@/question-bank/application/practice";
  import {
    PracticeSessionRuntime,
    type PracticeSessionActorSnapshot,
    type PracticeSessionSaveStatus,
  } from "@/question-bank/application/practice-runtime";
  import {
    replacePracticeSession,
    resumePracticeSession,
    startPracticeSession,
    type PracticeSessionActivation,
  } from "@/question-bank/application/practice-lifecycle";
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
  } from "@/question-bank/application/recovery";
  import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
  import type { QuestionIndexBatchPreview } from "@/question-bank/application/batch-indexing";
  import type {
    QuestionTopicAssignment,
    TopicRelationPreview,
    TopicRelationSyncMode,
    TopicResourceProjection,
  } from "@/question-bank/adapters/siyuan/topic-index";
  import type {
    QuestionBankInitializationPreview,
    QuestionBankRebindingPreview,
  } from "@/question-bank/adapters/siyuan/binding";
  import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
  import type { OpenDocumentTabLoader } from "@/libs/open-document-tabs";
  import type { FrozenQuestionSet, QuestionCatalogEntry, QuestionSetBlueprint } from "@/question-bank/assembly";
  import QuestionBankView from "./QuestionBankView.svelte";
  import type { RiffCard } from "@/question-bank/adapters/siyuan/riff";
  import { renderMarkdownHtml } from "@/question-bank/markdown";
  import type { QuestionBankUiController, SourceBlockIdentity } from "./controller";
  import type { StoredPracticeSession } from "./session-host";
  import { createPracticeActions } from "./question-bank-practice-actions";
  import type { StatisticsCardPreviewHandler } from "./statistics-preview";
  import { compareAttemptDuration } from "./attempt-duration-comparison";
  import { TINYBASE_READ_VIEW_UPDATED_EVENT } from "./sync-coordinator";
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
  export let loadSubjectQuestionTotals: (() => Promise<unknown>) | undefined = undefined;
  export let initialDocumentId: string | undefined = undefined;
  export let getCurrentDocumentId: (() => string | undefined) | undefined = undefined;
  export let getOpenDocumentTabs: OpenDocumentTabLoader | undefined = undefined;
  export let translations: Record<string, string> = {};
  export let loadTopicDictionary: (() => Promise<TopicDictionaryDocument>) | undefined = undefined;
  export let reviewThreshold = 2;
  export let random: () => number = Math.random;
  export let uuid: () => string = () => crypto.randomUUID();
  export let openQuestionSource: ((blockId: string) => void) | undefined = undefined;
  export let inheritSourceStyles = true;
  export let questionRenderMode: "html" | "native" | "embed" = "native";
  export let indefinitePracticeMode = false;
  export let onIndefinitePracticeModeChange: ((value: boolean) => void) | undefined = undefined;
  export let durationComparisonPosition: "answer" | "rating" | "header" = "rating";
  export let renderQuestionMarkdown: ((markdown: string, inheritStyles: boolean) => string | undefined) | undefined = undefined;
  export let mountSourceBlock: ((target: HTMLElement, blockId: string, editable: boolean, section?: "stem" | "solution", renderMode?: "native" | "embed") => (() => void) | Promise<() => void>) | undefined = undefined;
  export let prepareSourceBlock: ((blockId: string) => Promise<void>) | undefined = undefined;
  export let autoSyncIndex = false;
  export let onAutoSyncIndexChange: ((value: boolean) => void) | undefined = undefined;
  export let autoScanDocument = false;
  export let onAutoScanDocumentChange: ((value: boolean) => void) | undefined = undefined;
  export let syncTopicProgress = false;
  export let onSyncTopicProgressChange: ((value: boolean) => void) | undefined = undefined;
  export let showPracticeTitle = false;
  export let showPracticeBreadcrumb = true;
  export let timingEnabled = true;
  export let pauseOnAnswerReveal = true;
  export let pauseOnBlur = false;
  export let onPauseOnBlurChange: ((value: boolean) => void) | undefined = undefined;
  export let revealActionBelowOptions = false;
  export let completionShowCorrectness = true;
  export let completionShowRating = true;
  export let completionShowDuration = true;
  export let completionShowAnswer = true;
  export let completionShowAnsweredAt = false;
  export let now: () => number = Date.now;
  export let mobileBreadcrumb = false;
  export let breadcrumbPriority: BreadcrumbOverflowPriority = "tail";
  export let breadcrumbTextDisplay: BreadcrumbTextDisplay = normalizeBreadcrumbTextDisplay("full", 16, 160);
  export let loadBreadcrumb: ((blockId: string) => Promise<BlockBreadcrumbItem[]>) | undefined = undefined;
  export let onClose: (() => void) | undefined = undefined;
  export let openStatisticsCardPreview: StatisticsCardPreviewHandler | undefined = undefined;

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
  const portableTopicAssignments = (questions: readonly Question[]): QuestionTopicAssignment[] => questions
    .filter((question) => (question.metadata.topicIds?.length ?? 0) > 0)
    .map((question) => ({
      questionId: question.id,
      topicIds: [...new Set(question.metadata.topicIds ?? [])],
    }));
  const initialPracticePreferences = controller.getPracticePreferences();
  const recent = controller.getRecentScope();
  let documentId = initialDocumentId ?? recent?.documentId ?? "";
  let binding = controller.getBinding();
  let initializationPreview: QuestionBankInitializationPreview | undefined;
  let systemDocumentId = "";
  let rebindingPreview: QuestionBankRebindingPreview | undefined;
  let preview: QuestionIndexPreview | undefined;
  let topicRelationMode: "off" | TopicRelationSyncMode = "off";
  let topicRelationPreview: TopicRelationPreview | undefined;
  let topicAssignments: QuestionTopicAssignment[] = [];
  let topicRelationReady = false;
  let sourceIdentity: SourceBlockIdentity | undefined;
  let aggregates: ReadonlyMap<string, AttemptAggregate> = new Map();
  let bookmarks: ReadonlyMap<string, QuestionBookmark> = new Map();
  let dueCards: ReadonlyMap<string, RiffCard> = new Map();
  let topicId = "";
  let order: PracticeOrder = initialPracticePreferences.order;
  let optionOrder: PracticeOptionOrder = initialPracticePreferences.optionOrder;
  let filter: PracticeFilter = initialPracticePreferences.filter;
  let persistedPracticePreferences = JSON.stringify(initialPracticePreferences);
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
  let topicResources: TopicResourceProjection[] = [];
  let topicResourceQuestionId = "";
  let topicResourceRequest = 0;
  let topicResourceValidationTimer: ReturnType<typeof setTimeout> | undefined;
  let persistingTopicResourceIdentity = "";
  let persistedTopicResourceIdentities: ReadonlySet<string> = new Set();
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
  let sourceEditingLocked = mobileBreadcrumb;
  let showStemStyles = false;
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
  let view: "practice" | "statistics" | "mapping" = "practice";
  let mappingStatus: "idle" | "checking" | "ready" | "syncing" | "success" | "error" = "idle";
  let mappingMessage = "";
  let questionIndexProjectionBlockId = String(controller.getSetting?.("questionIndexProjectionBlockId") ?? "");
  let pruneStaleMappingRows = Boolean(controller.getSetting?.("projectionPruneStaleRows") ?? false);
  let includeUnansweredMappingRows = Boolean(controller.getSetting?.("projectionIncludeUnanswered") ?? true);
  let mappingTarget: { avId: string; blockId: string } | undefined;

  function setPruneStaleMappingRows(value: boolean): void {
    pruneStaleMappingRows = value;
    controller.setSetting?.("projectionPruneStaleRows", value);
  }

  function setIncludeUnansweredMappingRows(value: boolean): void {
    includeUnansweredMappingRows = value;
    controller.setSetting?.("projectionIncludeUnanswered", value);
  }

  function setMappingTarget(value: string): void {
    questionIndexProjectionBlockId = value.trim();
    controller.setSetting?.("questionIndexProjectionBlockId", value.trim());
  }

  function selectCurrentMappingTarget(): void {
    const selected = document.querySelector<HTMLElement>('.protyle-wysiwyg--select[data-node-id][data-type="NodeAttributeView"], .protyle-wysiwyg [data-node-id].protyle-wysiwyg--select[data-type="NodeAttributeView"]');
    if (!selected) { mappingStatus = "error"; mappingMessage = "未找到选中的属性视图块"; return; }
    setMappingTarget(selected.dataset.nodeId ?? "");
    mappingStatus = "idle";
    mappingMessage = "已选择目标，点击检查连接";
  }

  async function checkMappingTarget(): Promise<boolean> {
    const id = questionIndexProjectionBlockId;
    if (!id) return false;
    mappingStatus = "checking";
    try {
      const escapedId = id.replace(/'/gu, "''");
      const rows = await sql(`SELECT id, type, content FROM blocks WHERE id = '${escapedId}' LIMIT 1`);
      const row = rows[0] as { id?: string; type?: string; content?: string } | undefined;
      const attrs = row
        ? await siyuanKernelClient.request<Record<string, string>>("/api/attr/getBlockAttrs", { id })
          .catch(() => ({}))
        : {};
      const candidates = [
        id,
        attrs["custom-sy-av-id"],
        attrs["custom-sy-av-view"],
        row?.content?.match(/(?:custom-sy-av-id|custom-sy-av-view)=["']([^"']+)["']/u)?.[1],
      ].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
      let resolved: { id?: string; name?: string } | undefined;
      let resolvedId = "";
      for (const candidate of candidates) {
        try {
          const response = await siyuanKernelClient.request<{ av?: { id?: string; name?: string } }>("/api/av/getAttributeView", { id: candidate });
          if (response?.av?.id) {
            resolved = response.av;
            resolvedId = candidate;
            break;
          }
        } catch {
          // Try the next interpretation: database ID, then containing block ID metadata.
        }
      }
      if (!resolved?.id) throw new Error("未找到属性视图数据库；请输入数据库 ID 或数据库块 ID");
      const escapedAvId = resolved.id.replace(/'/gu, "''");
      const targetBlock = row?.id ?? (await sql(`SELECT id FROM blocks WHERE ial LIKE '%${escapedAvId}%' OR markdown LIKE '%${escapedAvId}%' LIMIT 1`))[0]?.id;
      if (!targetBlock) throw new Error("已找到数据库，但找不到对应的数据库块；请改填数据库块 ID");
      mappingTarget = { avId: resolved.id, blockId: String(targetBlock) };
      mappingStatus = "ready";
      mappingMessage = `连接正常：${resolved.name || resolved.id}${row ? ` · 块 ${row.id}` : ` · ID ${resolvedId}`}`;
      return true;
    } catch (error) {
      mappingStatus = "error";
      mappingMessage = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async function syncMappingTarget(): Promise<void> {
    if (!questionIndexProjectionBlockId) {
      mappingStatus = "error";
      mappingMessage = "请先指定 Question Index 目标";
      return;
    }

    let prompt = includeUnansweredMappingRows
      ? "确认将题库统计同步投射到选中的 Question Index 数据库？"
      : "确认将题库中【已作答】题目的统计同步投射到选中的 Question Index 数据库？";
    if (pruneStaleMappingRows) {
      prompt += "\n（已勾选“删除失效数据行”：目标数据库中不存在或未作答的旧条目将被清理）";
    }

    if (!window.confirm(prompt)) {
      return;
    }

    mappingStatus = "syncing";
    mappingMessage = "正在检查目标数据库连接...";
    try {
      if (!await checkMappingTarget()) return;
      if (!mappingTarget || !controller.loadQuestionCatalog) throw new Error("当前题库没有可执行的索引同步上下文");
      mappingMessage = "正在读取题库与作答统计...";
      const [catalog, aggregates] = await Promise.all([
        controller.loadQuestionCatalog(),
        controller.loadAggregates(),
      ]);
      const targetCount = includeUnansweredMappingRows
        ? catalog.length
        : catalog.filter((q) => (aggregates.get(q.questionId)?.attempts ?? 0) > 0).length;
      mappingMessage = `正在向数据库投射数据（共 ${targetCount} 道题）...`;
      const result = await projectQuestionIndex(siyuanKernelClient, mappingTarget, catalog, aggregates, reviewThreshold, {
        pruneStale: pruneStaleMappingRows,
        includeUnanswered: includeUnansweredMappingRows,
      });
      mappingStatus = "success";
      mappingMessage = `同步完成：新增 ${result.added}，更新 ${result.updated}${result.deleted ? `，删除失效 ${result.deleted}` : ""}，补充列 ${result.columns}`;
    } catch (error) {
      mappingStatus = "error";
      mappingMessage = error instanceof Error ? error.message : String(error);
    }
  }
  let statisticsSnapshot: StatisticsSnapshot | undefined;
  let statisticsTopicDictionary: TopicDictionaryDocument | undefined;
  let subjectQuestionTotals: SubjectQuestionTotals = normalizeSubjectQuestionTotals(
    controller.getSetting?.("statisticsSubjectQuestionTotals"),
  );
  let subjectTotalsSaveStatus: "idle" | "saving" | "saved" | "error" = "idle";
  let statisticsLayout: StatisticsLayout = normalizeStatisticsLayout(controller.getSetting?.("statisticsLayout"));
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
      currentAttempt,
      indefinitePracticeMode,
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
  $: topicAssignments = preview
    ? portableTopicAssignments(preview.scan.report.document.questions)
    : [];
  $: topicRelationReady = Boolean(
    preview
    && preview.blockers.length === 0
    && preview.bindingRepairs.length === 0
    && preview.actions.length === 0
    && preview.ialWriteActions.length === 0
  );
  $: suggestedRating = revealed
    ? suggestedMasteryRating(objectiveCorrect, subjectiveScore)
    : undefined;
  $: {
    const nextPracticePreferences = { order, optionOrder, filter };
    const serializedPreferences = JSON.stringify(nextPracticePreferences);
    if (serializedPreferences !== persistedPracticePreferences) {
      persistedPracticePreferences = serializedPreferences;
      controller.savePracticePreferences(nextPracticePreferences);
    }
  }
  $: currentBookmark = currentQuestion ? bookmarks.get(currentQuestion.id) : undefined;
  $: bookmarkedQuestions = questions.filter((q) => bookmarks.has(q.id) && !bookmarks.get(q.id)?.isArchived).length;

  async function toggleBookmark(): Promise<void> {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    if (currentBookmark) {
      await controller.removeBookmark(qid);
      const next = new Map(bookmarks);
      next.delete(qid);
      bookmarks = next;
    } else {
      const b: QuestionBookmark = {
        questionId: qid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        note: "",
      };
      await controller.saveBookmark(b);
      const next = new Map(bookmarks);
      next.set(qid, b);
      bookmarks = next;
    }
  }

  async function saveBookmarkDetails(tags: string[], note: string): Promise<void> {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    const b: QuestionBookmark = {
      questionId: qid,
      createdAt: currentBookmark?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags,
      note,
    };
    await controller.saveBookmark(b);
    const next = new Map(bookmarks);
    next.set(qid, b);
    bookmarks = next;
  }

  async function removeCurrentBookmark(): Promise<void> {
    if (!currentQuestion) return;
    const qid = currentQuestion.id;
    await controller.removeBookmark(qid);
    const next = new Map(bookmarks);
    next.delete(qid);
    bookmarks = next;
  }

  $: if (currentQuestionBlockId && currentQuestionBlockId !== breadcrumbBlockId) {
    breadcrumbBlockId = currentQuestionBlockId;
    void loadPracticeBreadcrumb(currentQuestionBlockId);
  }
  $: if ((currentQuestion?.id ?? "") !== topicResourceQuestionId) {
    void loadTopicResources(currentQuestion?.id);
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
  $: answerTimerPaused = Boolean(revealed && pauseOnAnswerReveal && practiceState?.matches("active"));
  $: timerEffectivelyPaused = Boolean(practiceState?.context.timerPaused) || answerTimerPaused;
  let autoPausedByBlur = false;

  function isTargetInsideQuestionBank(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Node)) return false;
    if (rootElement && rootElement.contains(target)) return true;
    if (target instanceof Element) {
      if (target.closest(".damophus-question-bank-host, .b3-menu, .b3-dialog, .protyle-util, .correction-dialog, [data-testid='question-bank']")) {
        return true;
      }
    }
    return false;
  }

  function handleFocusOrPointer(target: EventTarget | null): void {
    if (!pauseOnBlur || !practiceRuntime || submitting || reviewing) return;
    const current = practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;

    const inside = isTargetInsideQuestionBank(target);
    if (inside) {
      if (autoPausedByBlur && current.context.timerPaused) {
        practiceRuntime.actor.send({ type: "RESUME_TIMER", now: now() });
        startTimer();
      }
      autoPausedByBlur = false;
    } else {
      if (!current.context.timerPaused && !answerTimerPaused) {
        practiceRuntime.actor.send({ type: "PAUSE_TIMER", now: now() });
        clearTimer();
        autoPausedByBlur = true;
      }
    }
  }

  function handleWindowBlur(): void {
    if (!pauseOnBlur || !practiceRuntime || submitting || reviewing) return;
    const current = practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;
    if (!current.context.timerPaused && !answerTimerPaused) {
      practiceRuntime.actor.send({ type: "PAUSE_TIMER", now: now() });
      clearTimer();
      autoPausedByBlur = true;
    }
  }

  function handleWindowFocus(): void {
    if (!pauseOnBlur || !practiceRuntime || submitting || reviewing) return;
    const current = practiceRuntime.actor.getSnapshot();
    if (!current.matches("active")) return;
    if (autoPausedByBlur && isTargetInsideQuestionBank(document.activeElement)) {
      if (current.context.timerPaused) {
        practiceRuntime.actor.send({ type: "RESUME_TIMER", now: now() });
        startTimer();
      }
      autoPausedByBlur = false;
    }
  }

  function handleVisibilityChange(): void {
    if (document.hidden) {
      handleWindowBlur();
    } else {
      handleWindowFocus();
    }
  }

  onMount(() => {
    const host = rootElement.closest<HTMLElement>(".damophus-question-bank-host");
    const command = (event: Event) => {
      const detail = (event as CustomEvent<"previous" | "next" | "pause">).detail;
      if (detail === "previous") previousQuestion();
      else if (detail === "next") nextQuestion();
      else if (detail === "pause") void pausePractice();
    };
    host?.addEventListener("damophus-practice-command", command);
    const handleDocumentPointerDown = (event: PointerEvent) => handleFocusOrPointer(event.target);
    const handleDocumentFocusIn = (event: FocusEvent) => {
      if (isTargetInsideQuestionBank(event.target)) handleFocusOrPointer(event.target);
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("focusin", handleDocumentFocusIn, true);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const refreshSyncedState = () => {
      void run(async () => {
        aggregates = await controller.loadAggregates();
        await refreshStoredSessions();
      });
    };
    window.addEventListener(TINYBASE_READ_VIEW_UPDATED_EVENT, refreshSyncedState);
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
    void run(async () => {
      const workspaceTotals = loadSubjectQuestionTotals ? await loadSubjectQuestionTotals() : undefined;
      subjectQuestionTotals = {
        ...normalizeSubjectQuestionTotals(workspaceTotals),
        ...normalizeSubjectQuestionTotals(controller.getSetting?.("statisticsSubjectQuestionTotals")),
      };
      await refreshStoredSessions();
    });
    scheduleAutoScan(250);
    return () => {
      host?.removeEventListener("damophus-practice-command", command);
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
      document.removeEventListener("focusin", handleDocumentFocusIn, true);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(TINYBASE_READ_VIEW_UPDATED_EVENT, refreshSyncedState);
    };
  });

  onDestroy(() => {
    clearTimer();
    workspaceResizeObserver?.disconnect();
    if (autoScanTimer) clearTimeout(autoScanTimer);
    if (sourcePreloadTimer) clearTimeout(sourcePreloadTimer);
    if (topicResourceValidationTimer) clearTimeout(topicResourceValidationTimer);
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
      log.error("operation.failed", { error: reason });
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
    topicRelationPreview = undefined;
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

  function useCurrentDocument(): void {
    const currentDocumentId = getCurrentDocumentId?.();
    if (!currentDocumentId || currentDocumentId === documentId) return;
    documentId = currentDocumentId;
    invalidateDocumentTarget();
  }

  async function loadTopicResources(questionId: string | undefined): Promise<void> {
    if (topicResourceValidationTimer) clearTimeout(topicResourceValidationTimer);
    topicResourceValidationTimer = undefined;
    const request = ++topicResourceRequest;
    if (topicResourceQuestionId !== (questionId ?? "")) {
      persistedTopicResourceIdentities = new Set();
    }
    topicResourceQuestionId = questionId ?? "";
    topicResources = [];
    if (!questionId || !controller.loadQuestionTopicResources) return;
    try {
      const questionBlockId = preview?.scan.blockIdsByQuestionId.get(questionId);
      const resources = await controller.loadQuestionTopicResources(questionId, questionBlockId);
      if (request === topicResourceRequest && currentQuestion?.id === questionId) {
        topicResources = resources;
        if (resources.length > 0) {
          topicResourceValidationTimer = setTimeout(() => void loadTopicResources(questionId), 10_000);
        }
      }
    } catch (reason) {
      log.warn("topic-resources.failed", { questionId, reason });
    }
  }

  function topicResourceIdentity(projection: TopicResourceProjection): string {
    return `${projection.topicId}:${projection.resource.type}:${projection.resource.content}`;
  }

  function persistTopicResource(projection: TopicResourceProjection): void {
    if (!currentQuestion || !currentQuestionBlockId || !controller.persistQuestionTopicResource) return;
    const identity = topicResourceIdentity(projection);
    if (!window.confirm(label("confirmPersistTopicResource", "确认将此考点资源固化到题目文档中？"))) return;
    void run(async () => {
      persistingTopicResourceIdentity = identity;
      try {
        await controller.persistQuestionTopicResource!({
          questionId: currentQuestion!.id,
          questionBlockId: currentQuestionBlockId!,
          projection,
        });
        persistedTopicResourceIdentities = new Set([...persistedTopicResourceIdentities, identity]);
      } finally {
        persistingTopicResourceIdentity = "";
      }
    });
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
      topicRelationPreview = undefined;
      if (nextPreview.blockers.length > 0) scanPanelOpen = true;
      sourceIdentity = nextSourceIdentity;
      recoverableSession = stored?.status === "ok" ? stored.snapshot : undefined;
      syncComplete = false;
      if (autoSyncIndex && hasPendingSync(nextPreview) && nextPreview.blockers.length === 0) {
        preview = await applyIndexSync(nextPreview);
      }
      if (preview.bindingRepairs.length === 0) {
        [aggregates, bookmarks, dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadBookmarks(),
          controller.loadDueCards(preview.scan.blockIdsByQuestionId),
        ]);
      } else {
        aggregates = new Map();
        bookmarks = new Map();
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

  let cachedStatisticsQuestions: StatisticsQuestion[] | undefined;
  let cachedAttemptEvents: AttemptEvent[] | undefined;

  function loadStatistics(forceRefresh = false): void {
    if (!controller.loadStatisticsQuestions || !controller.loadAttemptEvents) {
      statisticsSnapshot = undefined;
      return;
    }
    if (!forceRefresh && cachedStatisticsQuestions && cachedAttemptEvents) {
      statisticsSnapshot = buildStatistics(
        cachedStatisticsQuestions,
        cachedAttemptEvents,
        statisticsRange,
        now(),
        statisticsSort,
      );
      return;
    }
    void run(async () => {
      statisticsLoading = true;
      try {
        const [statisticsQuestions, attempts, dictionary] = await Promise.all([
          controller.loadStatisticsQuestions!(),
          controller.loadAttemptEvents!(),
          loadTopicDictionary?.().catch((dictionaryError) => {
            log.warn("statistics.topic-dictionary-unavailable", dictionaryError);
            return undefined;
          }),
        ]);
        cachedStatisticsQuestions = statisticsQuestions;
        cachedAttemptEvents = attempts;
        statisticsTopicDictionary = dictionary;
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

  function selectView(next: "practice" | "statistics" | "mapping"): void {
    view = next;
    if (next === "statistics") loadStatistics(true);
  }

  function changeStatisticsRange(value: StatisticsRange): void {
    statisticsRange = value;
    loadStatistics(false);
  }

  function changeStatisticsSort(value: StatisticsSort): void {
    statisticsSort = value;
    loadStatistics(false);
  }

  async function changeSubjectQuestionTotal(subjectId: string, rawValue: string): Promise<void> {
    const next = {...subjectQuestionTotals};
    const total = Number(rawValue);
    if (rawValue.trim() && Number.isFinite(total) && total > 0) next[subjectId] = Math.floor(total);
    else delete next[subjectId];
    subjectQuestionTotals = normalizeSubjectQuestionTotals(next);
    subjectTotalsSaveStatus = "saving";
    try {
      if (controller.saveSetting) await controller.saveSetting("statisticsSubjectQuestionTotals", subjectQuestionTotals);
      else await controller.setSetting?.("statisticsSubjectQuestionTotals", subjectQuestionTotals);
      subjectTotalsSaveStatus = "saved";
    } catch (saveError) {
      subjectTotalsSaveStatus = "error";
      error = saveError instanceof Error ? saveError.message : String(saveError);
    }
  }

  function changeStatisticsLayout(next: StatisticsLayout): void {
    statisticsLayout = normalizeStatisticsLayout(next);
    controller.setSetting?.("statisticsLayout", statisticsLayout);
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

  function setTopicRelationMode(mode: "off" | TopicRelationSyncMode): void {
    topicRelationMode = mode;
    topicRelationPreview = undefined;
  }

  function previewTopicRelations(): void {
    if (topicRelationMode === "off" || !topicRelationReady || !controller.previewTopicRelationSync) return;
    const mode = topicRelationMode;
    void run(async () => {
      topicRelationPreview = await controller.previewTopicRelationSync!(topicAssignments, mode);
    });
  }

  function toggleSyncTopicProgress(checked: boolean): void {
    syncTopicProgress = checked;
    controller.setSetting?.("syncTopicProgress", checked);
    void controller.saveSetting?.("syncTopicProgress", checked);
    onSyncTopicProgressChange?.(checked);
  }

  function rebuildTopicProgress(): void {
    if (!controller.rebuildTopicStatistics) return;
    void run(async () => {
      await controller.rebuildTopicStatistics!();
    });
  }

  function confirmTopicRelations(): void {
    if (topicRelationMode === "off" || !topicRelationPreview || !controller.confirmTopicRelationSync) return;
    const mode = topicRelationMode;
    void run(async () => {
      topicRelationPreview = await controller.confirmTopicRelationSync!(
        topicAssignments,
        mode,
        topicRelationPreview!.token,
        { syncProgress: syncTopicProgress },
      );
    });
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

  function correctCurrentAnswer(answer: ObjectiveAnswer): void {
    const question = currentQuestion;
    const blockId = currentQuestionBlockId;
    if (!question || !blockId || !controller.correctQuestionAnswer || !question.answer) return;
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
    if (questionRenderMode === "html" || !prepareSourceBlock) return;
    const currentBlockId = sourceBlockId(currentQuestion);
    if (currentBlockId) void prepareSourceBlock(currentBlockId);
    const nextBlockId = sourceBlockId(queue[questionIndex + 1]);
    if (!nextBlockId) return;
    sourcePreloadTimer = setTimeout(() => {
      void prepareSourceBlock?.(nextBlockId);
    }, 50);
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
      bookmarkedQuestionIds: new Set([...bookmarks.keys()].filter((id) => !bookmarks.get(id)?.isArchived)),
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
    if (questionRenderMode !== "html" && prepareSourceBlock) {
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
        optionOrder: createPracticeOptionOrder(
          question,
          assembledQuestions ? "random" : optionOrder,
          random,
        ),
      })),
      now: new Date(now()),
    });
  }

  function resumePractice(): void {
    const snapshot = recoverableSession;
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
  const correctRating = practiceActions.correctRating;
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
    if (!current.matches("active")) return;
    autoPausedByBlur = false;
    if (!current.context.timerPaused) {
      practiceRuntime.actor.send({ type: "PAUSE_TIMER", now: now() });
      clearTimer();
    } else {
      practiceRuntime.actor.send({ type: "RESUME_TIMER", now: now() });
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
    autoPausedByBlur = false;
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

  function toggleSourceEditingLock(): void {
    sourceEditingLocked = !sourceEditingLocked;
  }

  function toggleStemStyles(): void {
    showStemStyles = !showStemStyles;
  }

  function toggleIndefinitePracticeMode(): void {
    indefinitePracticeMode = !indefinitePracticeMode;
    onIndefinitePracticeModeChange?.(indefinitePracticeMode);
  }

  function togglePauseOnBlur(): void {
    pauseOnBlur = !pauseOnBlur;
    onPauseOnBlurChange?.(pauseOnBlur);
    if (!pauseOnBlur && autoPausedByBlur) {
      if (practiceRuntime && practiceState?.matches("active") && practiceState?.context.timerPaused) {
        practiceRuntime.actor.send({ type: "RESUME_TIMER", now: now() });
        startTimer();
      }
      autoPausedByBlur = false;
    }
  }
</script>

<QuestionBankView
  bind:rootElement bind:documentId bind:initializationPreview bind:systemDocumentId bind:rebindingPreview
  bind:view bind:composerOpen bind:examMode bind:autoScanDocument bind:dataPanelOpen bind:dataPanelUserControlled bind:fileInput
  bind:scanPanelOpen bind:scanPanelUserControlled bind:scanDetailsOpen bind:pendingReplacement bind:topicId bind:order bind:optionOrder bind:filter
  bind:endConfirmation bind:answerCardOpen
  {currentQuestion} {topicResources} {persistTopicResource} {persistingTopicResourceIdentity} {persistedTopicResourceIdentities}
  {buildRevision} {showPracticeTitle} {showPracticeBreadcrumb} {label} {translations} {onClose} {busy} {questionIndex} {queue} {completedQuestionIndices}
  {timingEnabled} {sessionElapsedMs} {questionElapsedMs} {breadcrumbItems} {currentQuestionBlockId} {mobileBreadcrumb} {breadcrumbPriority}
  {breadcrumbTextDisplay} {openQuestionSource} {submitting} {reviewing} {answerTimerPaused} {timerEffectivelyPaused}
  {sourceEditingLocked} {toggleSourceEditingLock} {showStemStyles} {toggleStemStyles} {toggleIndefinitePracticeMode}
  {pauseOnBlur} {togglePauseOnBlur}
  {previousQuestion} {nextQuestion} {togglePracticeTimer} {exitReview} {pausePractice} {requestEndPractice} {error} {binding}
  {validDocument} {useCurrentDocument} {getOpenDocumentTabs} {previewInitialization} {confirmInitialization} {invalidateSystemDocumentTarget} {previewRebinding}
  {confirmRebinding} {invalidateDocumentTarget} {practiceRuntime} {complete} {selectView} {questionCatalog} {sourceDocuments}
  {questionSetBlueprints} {run} {loadQuestionSetData} {previewSourceSync} {confirmSourceSync} {assembleBlueprint} {saveBlueprint}
  {removeBlueprint} {useFrozenPracticeSet} {statisticsSnapshot} {statisticsLoading} {statisticsRange} {statisticsSort}
  {changeStatisticsRange} {changeStatisticsSort} {statisticsTopicDictionary} {subjectQuestionTotals} {changeSubjectQuestionTotal} {subjectTotalsSaveStatus} {statisticsLayout} {changeStatisticsLayout} {openStatisticsCardPreview} {controller} {examQuestions} {preview} {sourceIdentity} {uuid} {random}
  {renderQuestionMarkdown} {refreshStoredSessions} {scanDocument} {toggleAutoScanDocument} {storedSessions} {openStoredSession}
  {exportSessionDiagnostic} {exportAttempts} {selectImportFile} {importPreview} {confirmImport} {importResult} {progressQuestions}
  {completionPercent} {attemptedQuestions} {untouchedQuestions} {reviewQuestions} {pendingSync} {syncComplete} {autoSyncIndex}
  {scanMessageGroups} {sourceTypeLabel} {completionStatusLabel} {messageContext} {messageClipboardText} {scanLogText} {copyText}
  {confirmSync} {toggleAutoSyncIndex} topicAssignmentCount={topicAssignments.length} {topicRelationMode} {topicRelationPreview}
  {topicRelationReady} {setTopicRelationMode} {previewTopicRelations} {confirmTopicRelations}
  {syncTopicProgress} toggleSyncTopicProgress={toggleSyncTopicProgress} rebuildTopicProgress={rebuildTopicProgress}
  {recoverableSession} {resumePractice} {confirmRestartPractice} {topics} {startPractice}
  {openQuestionSetComposer} {currentGroup} {displayedOptions} {selectedOptionIds} {revealed} {readOnlyQuestion}
  {objectiveCorrect} {subjectiveScore} {currentAttempt} {durationComparisons} {durationComparisonPosition} {inheritSourceStyles} {questionRenderMode} {indefinitePracticeMode} {revealActionBelowOptions} {renderedQuestionContent}
  {mountSourceBlock} {questionTypeLabel} {optionMarkdown} {formatDuration} {toggleOption} {changeSubjectiveScore}
  {resetQuestionTimer} {confirmEndPractice} {practiceSaveStatus} {practiceSaveError} {retryPracticeSave}
  {correctCurrentAnswer}
  {recoveryIssues} {goToQuestion} {suggestedRating} {revealAnswer} {retry} {submitRating} {correctRating} {sessionAttempts}
  {completionCorrect} {completionDurationMs} {touchedDrafts} {completionShowCorrectness} {completionShowRating}
  {completionShowDuration} {completionShowAnswer} {completionShowAnsweredAt} {resetPractice}
  {currentBookmark} onToggleBookmark={toggleBookmark} onSaveBookmarkDetails={saveBookmarkDetails} onRemoveBookmark={removeCurrentBookmark} {bookmarkedQuestions}
  {questionIndexProjectionBlockId} {includeUnansweredMappingRows} onIncludeUnansweredMappingRowsChange={setIncludeUnansweredMappingRows} {pruneStaleMappingRows} onPruneStaleMappingRowsChange={setPruneStaleMappingRows} {mappingStatus} {mappingMessage} {selectCurrentMappingTarget} {checkMappingTarget} {syncMappingTarget} {setMappingTarget}
/>
