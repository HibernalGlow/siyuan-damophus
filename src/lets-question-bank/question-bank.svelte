<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { type BlockBreadcrumbItem } from "@/api";
  import { normalizeBreadcrumbTextDisplay, type BreadcrumbTextDisplay, type BreadcrumbOverflowPriority } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
  import { getLogger } from "@/libs/logger";
  import type {
    AttemptAggregate,
    AttemptEvent,
    Question,
    QuestionGroup,
    QuestionType,
    ScanMessage,
    ShuffledOption,
    ShuffledQuestion,
    QuestionBookmark,
  } from "@/question-bank/core/types";
  import { type StatisticsQuestion, type StatisticsRange, type StatisticsSnapshot, type StatisticsSort } from "@/question-bank/core/statistics";
  import {
    normalizeSubjectQuestionTotals,
    normalizeStatisticsLayout,
    type StatisticsLayout,
    type SubjectQuestionTotals,
  } from "@/question-bank/core/subject-dashboard";
  import type { TopicDictionaryDocument } from "@/question-bank/topic-dictionary";
  import type { PracticeFilter } from "@/question-bank/core/scope";
  import {
    normalizePracticeHeaderActions,
    type PracticeFilterPreset,
    type PracticeHeaderAction,
  } from "./practice/practice-preferences";
  import {
    buildStatisticsBookmarkEntries,
  } from "./statistics/statistics-bookmarks";
  import {
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
  import type { QuestionCatalogEntry, QuestionSetBlueprint } from "@/question-bank/assembly";
  import QuestionBankView from "./QuestionBankView.svelte";
  import type { RiffCard } from "@/question-bank/adapters/siyuan/riff";
  import { renderMarkdownHtml } from "@/question-bank/markdown";
  import type { QuestionBankUiController, SourceBlockIdentity } from "./controller";
  import type { StoredPracticeSession } from "./session-host";
  import { createPracticeActions } from "./practice/question-bank-practice-actions";
  import type { StatisticsCardPreviewHandler } from "./statistics/statistics-preview";
  import { compareAttemptDuration } from "./statistics/attempt-duration-comparison";
  import { applyIndexSync, createMappingActions } from "./mapping/mapping-actions";
  import { createStatisticsActions } from "./statistics/statistics-actions";
  import { buildStatisticsBookmarkTitles, createBookmarkActions } from "./practice/bookmark-actions";
  import { createTopicResourceActions } from "./practice/topic-resources";
  import { createTopicRelationActions } from "./practice/topic-relations";
  import { createPracticeTimer } from "./practice/practice-timer";
  import { createPracticeSessionActions } from "./practice/practice-session-actions";
  import { createDocumentScanActions } from "./workspace/document-scan-actions";
  import { createQuestionSetActions } from "./source/question-set-actions";
  import { createPlaylistActions } from "./practice/playlist/playlist-actions";
  import type { PracticePlaylist } from "./practice/playlist/playlist-schema";
  import type { PlaylistResolution } from "./practice/playlist/playlist-resolve";
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
  export let documentPathHighlights: string[] = [];
  export let onDocumentPathHighlightsChange: (next: string[]) => void = () => {};
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
  let includeSubdocuments = false;
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
  let filterPresets: PracticeFilterPreset[] = initialPracticePreferences.presets ?? [];
  let referencePresets: PracticeFilterPreset[] = initialPracticePreferences.referencePresets ?? [];
  let activeFilterPresetId = initialPracticePreferences.activePresetId;
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
  let answerCardOpen = false;
  let sourceEditingLocked = mobileBreadcrumb;
  let showStemStyles = false;
  let showStemTags = controller.getSetting?.("practiceStemTags") !== false;
  let practiceHeaderActions = normalizePracticeHeaderActions(controller.getSetting?.("practiceHeaderActions"));
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
  let markedIndexTargets: Array<{ blockId: string; avId?: string }> = [];

  const mappingActions = createMappingActions({
    state: {
      get questionIndexProjectionBlockId() { return questionIndexProjectionBlockId; },
      set questionIndexProjectionBlockId(value) { questionIndexProjectionBlockId = value; },
      get pruneStaleMappingRows() { return pruneStaleMappingRows; },
      set pruneStaleMappingRows(value) { pruneStaleMappingRows = value; },
      get includeUnansweredMappingRows() { return includeUnansweredMappingRows; },
      set includeUnansweredMappingRows(value) { includeUnansweredMappingRows = value; },
      get mappingStatus() { return mappingStatus; },
      set mappingStatus(value) { mappingStatus = value; },
      get mappingMessage() { return mappingMessage; },
      set mappingMessage(value) { mappingMessage = value; },
      get mappingTarget() { return mappingTarget; },
      set mappingTarget(value) { mappingTarget = value; },
      get markedIndexTargets() { return markedIndexTargets; },
      set markedIndexTargets(value) { markedIndexTargets = value; },
    },
    controller,
    reviewThreshold,
  });
  const {
    setPruneStaleMappingRows,
    setIncludeUnansweredMappingRows,
    setMappingTarget,
    refreshMarkedIndexTargets,
    selectCurrentMappingTarget,
    checkMappingTarget,
    syncMappingTarget,
  } = mappingActions;

  const runIndexSync = (target: QuestionIndexPreview) => applyIndexSync({
    controller,
    getDocumentId: () => documentId,
    isIncludeSubdocuments: () => includeSubdocuments,
    setSyncComplete: (value) => { syncComplete = value; },
    setError: (value) => { error = value; },
  }, target);

  const statisticsActions = createStatisticsActions({
    state: {
      get view() { return view; },
      set view(value) { view = value; },
      get statisticsSnapshot() { return statisticsSnapshot; },
      set statisticsSnapshot(value) { statisticsSnapshot = value; },
      get statisticsTopicDictionary() { return statisticsTopicDictionary; },
      set statisticsTopicDictionary(value) { statisticsTopicDictionary = value; },
      get subjectQuestionTotals() { return subjectQuestionTotals; },
      set subjectQuestionTotals(value) { subjectQuestionTotals = value; },
      get subjectTotalsSaveStatus() { return subjectTotalsSaveStatus; },
      set subjectTotalsSaveStatus(value) { subjectTotalsSaveStatus = value; },
      get statisticsLayout() { return statisticsLayout; },
      set statisticsLayout(value) { statisticsLayout = value; },
      get statisticsLoading() { return statisticsLoading; },
      set statisticsLoading(value) { statisticsLoading = value; },
      get statisticsRange() { return statisticsRange; },
      set statisticsRange(value) { statisticsRange = value; },
      get statisticsSort() { return statisticsSort; },
      set statisticsSort(value) { statisticsSort = value; },
      get importSource() { return importSource; },
      set importSource(value) { importSource = value; },
      get importPreview() { return importPreview; },
      set importPreview(value) { importPreview = value; },
      get importResult() { return importResult; },
      set importResult(value) { importResult = value; },
      get preview() { return preview; },
      set preview(value) { preview = value; },
      get syncComplete() { return syncComplete; },
      set syncComplete(value) { syncComplete = value; },
      get aggregates() { return aggregates; },
      set aggregates(value) { aggregates = value; },
      get dueCards() { return dueCards; },
      set dueCards(value) { dueCards = value; },
      get error() { return error; },
      set error(value) { error = value; },
      get cachedStatisticsQuestions() { return cachedStatisticsQuestions; },
      set cachedStatisticsQuestions(value) { cachedStatisticsQuestions = value; },
      get cachedAttemptEvents() { return cachedAttemptEvents; },
      set cachedAttemptEvents(value) { cachedAttemptEvents = value; },
    },
    controller,
    loadTopicDictionary,
    now,
    run,
    applyIndexSync: runIndexSync,
  });
  const {
    selectView,
    changeStatisticsRange,
    changeStatisticsSort,
    changeSubjectQuestionTotal,
    changeStatisticsLayout,
    confirmSync,
    exportAttempts,
    selectImportFile,
    confirmImport,
  } = statisticsActions;


  const bookmarkActions = createBookmarkActions({
    state: {
      get currentQuestion() { return currentQuestion; },
      get currentBookmark() { return currentBookmark; },
      get bookmarks() { return bookmarks; },
      set bookmarks(value) { bookmarks = value; },
    },
    controller,
    openQuestionSource,
  });
  const { toggleBookmark, saveBookmarkDetails, removeCurrentBookmark, openBookmarkSource } = bookmarkActions;

  const topicResourceActions = createTopicResourceActions({
    state: {
      get topicResources() { return topicResources; },
      set topicResources(value) { topicResources = value; },
      get topicResourceQuestionId() { return topicResourceQuestionId; },
      set topicResourceQuestionId(value) { topicResourceQuestionId = value; },
      get persistedTopicResourceIdentities() { return persistedTopicResourceIdentities; },
      set persistedTopicResourceIdentities(value) { persistedTopicResourceIdentities = value; },
      get persistingTopicResourceIdentity() { return persistingTopicResourceIdentity; },
      set persistingTopicResourceIdentity(value) { persistingTopicResourceIdentity = value; },
      get currentQuestion() { return currentQuestion; },
      get currentQuestionBlockId() { return currentQuestionBlockId; },
      get preview() { return preview; },
    },
    controller,
    run,
    label,
    reload: (questionId) => void loadTopicResources(questionId),
  });
  const { loadTopicResources, persistTopicResource } = topicResourceActions;

  const topicRelationActions = createTopicRelationActions({
    state: {
      get topicRelationMode() { return topicRelationMode; },
      set topicRelationMode(value) { topicRelationMode = value; },
      get topicRelationPreview() { return topicRelationPreview; },
      set topicRelationPreview(value) { topicRelationPreview = value; },
      get topicAssignments() { return topicAssignments; },
      get topicRelationReady() { return topicRelationReady; },
      get syncTopicProgress() { return syncTopicProgress; },
      set syncTopicProgress(value) { syncTopicProgress = value; },
    },
    controller,
    run,
    onSyncTopicProgressChange: (value) => onSyncTopicProgressChange?.(value),
  });
  const { setTopicRelationMode, previewTopicRelations, toggleSyncTopicProgress, rebuildTopicProgress, confirmTopicRelations } = topicRelationActions;

  const questionSetActions = createQuestionSetActions({
    state: {
      get composerOpen() { return composerOpen; },
      set composerOpen(value) { composerOpen = value; },
      get sourceDocuments() { return sourceDocuments; },
      set sourceDocuments(value) { sourceDocuments = value; },
      get questionCatalog() { return questionCatalog; },
      set questionCatalog(value) { questionCatalog = value; },
      get questionSetBlueprints() { return questionSetBlueprints; },
      set questionSetBlueprints(value) { questionSetBlueprints = value; },
      get assembledQuestions() { return assembledQuestions; },
      set assembledQuestions(value) { assembledQuestions = value; },
      get assembledBlockIdsByQuestionId() { return assembledBlockIdsByQuestionId; },
      set assembledBlockIdsByQuestionId(value) { assembledBlockIdsByQuestionId = value; },
      get assembledSourceKey() { return assembledSourceKey; },
      set assembledSourceKey(value) { assembledSourceKey = value; },
      get assembledSourceLabel() { return assembledSourceLabel; },
      set assembledSourceLabel(value) { assembledSourceLabel = value; },
      get pendingFrozenSetLabel() { return pendingFrozenSetLabel; },
      set pendingFrozenSetLabel(value) { pendingFrozenSetLabel = value; },
    },
    controller,
    run,
    label,
    onFrozenSetAssembled: async () => {
      await beginNewPractice(assembledQuestions, assembledSourceKey, assembledSourceLabel);
    },
  });
  const {
    loadQuestionSetData,
    openQuestionSetComposer,
    previewSourceSync,
    confirmSourceSync,
    assembleBlueprint,
    saveBlueprint,
    removeBlueprint,
    useFrozenPracticeSet,
    exportSessionDiagnostic,
  } = questionSetActions;

  const timerActions = createPracticeTimer({
    state: {
      get timerNow() { return timerNow; },
      set timerNow(value) { timerNow = value; },
      get timingEnabled() { return timingEnabled; },
      get pauseOnBlur() { return pauseOnBlur; },
      get practiceRuntime() { return practiceRuntime; },
      get submitting() { return submitting; },
      get reviewing() { return reviewing; },
      get answerTimerPaused() { return answerTimerPaused; },
      get rootElement() { return rootElement; },
    },
    now,
  });
  const {
    isTargetInsideQuestionBank,
    handleFocusOrPointer,
    handleWindowBlur,
    handleWindowFocus,
    handleVisibilityChange,
    clearTimer,
    startTimer,
    togglePracticeTimer,
    isAutoPaused,
    clearAutoPaused,
  } = timerActions;

  const scanActions = createDocumentScanActions({
    state: {
      get documentId() { return documentId; },
      set documentId(value) { documentId = value; },
      get autoScanDocument() { return autoScanDocument; },
      get includeSubdocuments() { return includeSubdocuments; },
      get autoSyncIndex() { return autoSyncIndex; },
      get busy() { return busy; },
      get binding() { return binding; },
      set binding(value) { binding = value; },
      get initializationPreview() { return initializationPreview; },
      set initializationPreview(value) { initializationPreview = value; },
      get systemDocumentId() { return systemDocumentId; },
      get rebindingPreview() { return rebindingPreview; },
      set rebindingPreview(value) { rebindingPreview = value; },
      get preview() { return preview; },
      set preview(value) { preview = value; },
      get topicRelationPreview() { return topicRelationPreview; },
      set topicRelationPreview(value) { topicRelationPreview = value; },
      get sourceIdentity() { return sourceIdentity; },
      set sourceIdentity(value) { sourceIdentity = value; },
      get syncComplete() { return syncComplete; },
      set syncComplete(value) { syncComplete = value; },
      get topicId() { return topicId; },
      set topicId(value) { topicId = value; },
      get queue() { return queue; },
      set queue(value) { queue = value; },
      get currentQuestion() { return currentQuestion; },
      set currentQuestion(value) { currentQuestion = value; },
      get complete() { return complete; },
      set complete(value) { complete = value; },
      get answerCardOpen() { return answerCardOpen; },
      set answerCardOpen(value) { answerCardOpen = value; },
      get completedQuestionIndices() { return completedQuestionIndices; },
      set completedQuestionIndices(value) { completedQuestionIndices = value; },
      get recoverableSession() { return recoverableSession; },
      set recoverableSession(value) { recoverableSession = value; },
      get scanPanelOpen() { return scanPanelOpen; },
      set scanPanelOpen(value) { scanPanelOpen = value; },
      get scanPanelUserControlled() { return scanPanelUserControlled; },
      set scanPanelUserControlled(value) { scanPanelUserControlled = value; },
      get aggregates() { return aggregates; },
      set aggregates(value) { aggregates = value; },
      get bookmarks() { return bookmarks; },
      set bookmarks(value) { bookmarks = value; },
      get dueCards() { return dueCards; },
      set dueCards(value) { dueCards = value; },
    },
    controller,
    getCurrentDocumentId,
    run,
    refreshStoredSessions,
    runIndexSync,
    clearTimer,
  });
  const {
    validDocument,
    invalidateDocumentTarget,
    useCurrentDocument,
    scheduleAutoScan,
    cancelAutoScan,
    invalidateSystemDocumentTarget,
    previewInitialization,
    confirmInitialization,
    previewRebinding,
    confirmRebinding,
    scanDocument,
  } = scanActions;

  const practiceSessionActions = createPracticeSessionActions({
    state: {
      get practiceRuntime() { return practiceRuntime; },
      set practiceRuntime(value) { practiceRuntime = value; },
      get practiceState() { return practiceState; },
      set practiceState(value) { practiceState = value; },
      get sessionId() { return sessionId; },
      set sessionId(value) { sessionId = value; },
      get queue() { return queue; },
      set queue(value) { queue = value; },
      get completedQuestionIndices() { return completedQuestionIndices; },
      set completedQuestionIndices(value) { completedQuestionIndices = value; },
      get questionIndex() { return questionIndex; },
      set questionIndex(value) { questionIndex = value; },
      get complete() { return complete; },
      set complete(value) { complete = value; },
      get submitting() { return submitting; },
      set submitting(value) { submitting = value; },
      get timerNow() { return timerNow; },
      set timerNow(value) { timerNow = value; },
      get currentQuestion() { return currentQuestion; },
      set currentQuestion(value) { currentQuestion = value; },
      get currentQuestionBlockId() { return currentQuestionBlockId; },
      get shuffled() { return shuffled; },
      set shuffled(value) { shuffled = value; },
      get displayedOptions() { return displayedOptions; },
      set displayedOptions(value) { displayedOptions = value; },
      get selectedOptionIds() { return selectedOptionIds; },
      set selectedOptionIds(value) { selectedOptionIds = value; },
      get revealed() { return revealed; },
      set revealed(value) { revealed = value; },
      get objectiveCorrect() { return objectiveCorrect; },
      set objectiveCorrect(value) { objectiveCorrect = value; },
      get subjectiveScore() { return subjectiveScore; },
      set subjectiveScore(value) { subjectiveScore = value; },
      get rootElement() { return rootElement; },
      get questions() { return questions; },
      get practiceSourceQuestions() { return practiceSourceQuestions; },
      get topics() { return topics; },
      get topicId() { return topicId; },
      get filter() { return filter; },
      get order() { return order; },
      get optionOrder() { return optionOrder; },
      get aggregates() { return aggregates; },
      get dueCards() { return dueCards; },
      get bookmarks() { return bookmarks; },
      get reviewThreshold() { return reviewThreshold; },
      get documentId() { return documentId; },
      get preview() { return preview; },
      get assembledQuestions() { return assembledQuestions; },
      set assembledQuestions(value) { assembledQuestions = value; },
      get assembledBlockIdsByQuestionId() { return assembledBlockIdsByQuestionId; },
      set assembledBlockIdsByQuestionId(value) { assembledBlockIdsByQuestionId = value; },
      get assembledSourceKey() { return assembledSourceKey; },
      set assembledSourceKey(value) { assembledSourceKey = value; },
      get assembledSourceLabel() { return assembledSourceLabel; },
      set assembledSourceLabel(value) { assembledSourceLabel = value; },
      get playlistQuestions() { return playlistResolution?.questions; },
      get playlistBlockIdsByQuestionId() { return playlistResolution?.blockIdsByQuestionId ?? new Map<string, string>(); },
      get activePlaylistId() { return activePlaylistId; },
      get playlistName() { return playlists.find((item) => item.playlist_id === activePlaylistId)?.name; },
      get sourceIdentity() { return sourceIdentity; },
      get recoverableSession() { return recoverableSession; },
      set recoverableSession(value) { recoverableSession = value; },
      get recoveryIssues() { return recoveryIssues; },
      set recoveryIssues(value) { recoveryIssues = value; },
      get pendingReplacement() { return pendingReplacement; },
      set pendingReplacement(value) { pendingReplacement = value; },
      get endConfirmation() { return endConfirmation; },
      set endConfirmation(value) { endConfirmation = value; },
      get answerCardOpen() { return answerCardOpen; },
      set answerCardOpen(value) { answerCardOpen = value; },
      get practiceSaveStatus() { return practiceSaveStatus; },
      set practiceSaveStatus(value) { practiceSaveStatus = value; },
      get practiceSaveError() { return practiceSaveError; },
      set practiceSaveError(value) { practiceSaveError = value; },
      set error(value) { error = value; },
    },
    controller,
    run,
    label,
    now,
    uuid,
    random,
    prepareSourceBlock,
    getQuestionRenderMode: () => questionRenderMode,
    getPauseOnAnswerReveal: () => pauseOnAnswerReveal,
    refreshStoredSessions,
    timer: { startTimer, clearTimer, clearAutoPaused },
    scan: { invalidateDocumentTarget, scanDocument },
  });
  const {
    correctCurrentAnswer,
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
  } = practiceSessionActions;

  let playlists: PracticePlaylist[] = [];
  let playlistManagerOpen = false;
  let activePlaylistId: string | undefined = undefined;
  let playlistResolution: PlaylistResolution | undefined = undefined;
  let playlistResolvedRevision: number | undefined = undefined;
  let playlistResolving = false;

  const playlistActions = createPlaylistActions({
    state: {
      get playlists() { return playlists; },
      set playlists(value) { playlists = value; },
      get playlistManagerOpen() { return playlistManagerOpen; },
      set playlistManagerOpen(value) { playlistManagerOpen = value; },
      get activePlaylistId() { return activePlaylistId; },
      set activePlaylistId(value) { activePlaylistId = value; },
      get playlistResolution() { return playlistResolution; },
      set playlistResolution(value) { playlistResolution = value; },
      get playlistResolvedRevision() { return playlistResolvedRevision; },
      set playlistResolvedRevision(value) { playlistResolvedRevision = value; },
      get playlistResolving() { return playlistResolving; },
      set playlistResolving(value) { playlistResolving = value; },
    },
    controller,
    run,
  });
  const {
    loadPlaylists,
    selectPlaylist,
    openPlaylistManager,
    closePlaylistManager,
    savePlaylist,
    deletePlaylist,
  } = playlistActions;

  let statisticsSnapshot: StatisticsSnapshot | undefined;
  let statisticsTopicDictionary: TopicDictionaryDocument | undefined;
  let cachedStatisticsQuestions: StatisticsQuestion[] | undefined;
  let cachedAttemptEvents: AttemptEvent[] | undefined;
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
  $: practiceSourceQuestions = assembledQuestions ?? playlistResolution?.questions ?? questions;
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
  $: wrongQuestions = progressQuestions.filter(
    (question) => (aggregates.get(question.id)?.objectiveIncorrect ?? 0) > 0,
  ).length;
  $: reviewQuestions = progressQuestions.filter(
    (question) => (aggregates.get(question.id)?.consecutiveReviewCount ?? 0) >= reviewThreshold,
  ).length;
  $: reviewAgainQuestions = progressQuestions.filter(
    (question) => {
      const aggregate = aggregates.get(question.id);
      return aggregate?.latestRating === "again"
        && aggregate.consecutiveReviewCount >= reviewThreshold;
    },
  ).length;
  $: reviewHardQuestions = progressQuestions.filter(
    (question) => {
      const aggregate = aggregates.get(question.id);
      return aggregate?.latestRating === "hard"
        && aggregate.consecutiveReviewCount >= reviewThreshold;
    },
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
    if (activeFilterPresetId) {
      const activePreset = filterPresets.find((preset) => preset.id === activeFilterPresetId);
      if (!activePreset || JSON.stringify(activePreset.filter) !== JSON.stringify(filter)) activeFilterPresetId = undefined;
    }
    const nextPracticePreferences = {
      order,
      optionOrder,
      filter,
      ...(filterPresets.length ? { presets: filterPresets } : {}),
      ...(referencePresets.length ? { referencePresets } : {}),
      ...(activeFilterPresetId ? { activePresetId: activeFilterPresetId } : {}),
    };
    const serializedPreferences = JSON.stringify(nextPracticePreferences);
    if (serializedPreferences !== persistedPracticePreferences) {
      persistedPracticePreferences = serializedPreferences;
      controller.savePracticePreferences(nextPracticePreferences);
    }
  }
  $: currentBookmark = currentQuestion ? bookmarks.get(currentQuestion.id) : undefined;
  $: bookmarkedQuestions = questions.filter((q) => bookmarks.has(q.id) && !bookmarks.get(q.id)?.isArchived).length;
  $: statisticsBookmarkTitles = buildStatisticsBookmarkTitles(cachedStatisticsQuestions, questions);
  $: statisticsBookmarkEntries = buildStatisticsBookmarkEntries({
    bookmarks,
    aggregates,
    titles: statisticsBookmarkTitles,
    blockIdsByQuestionId: preview?.scan.blockIdsByQuestionId,
    reviewThreshold,
  });

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
      // Playlist chips need the saved list right after boot; the guard keeps
      // test controllers without playlist services quiet.
      if (controller.listPracticePlaylists) await loadPlaylists();
      await refreshStoredSessions();
    });
    void refreshMarkedIndexTargets();
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
    scanActions.dispose();
    topicResourceActions.dispose();
    practiceSessionActions.dispose();
  });

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

  async function refreshStoredSessions(): Promise<void> {
    storedSessions = await controller.listPracticeSessions();
    const current = storedSessions.find((stored) => stored.sourceKey === documentId);
    recoverableSession = current?.result.status === "ok" ? current.result.snapshot : undefined;
  }

  const toggleOption = practiceActions.toggleOption;
  const revealAnswer = practiceActions.revealAnswer;
  const retry = practiceActions.retry;
  const resetQuestionTimer = practiceActions.resetQuestionTimer;
  const changeSubjectiveScore = practiceActions.changeSubjectiveScore;
  const submitRating = practiceActions.submitRating;
  const correctRating = practiceActions.correctRating;
  function renderedQuestionContent(markdown: string, sourceStyles: boolean): string {
    // Prefer the plugin's SiYuan-faithful Lute renderer in every mode: the
    // remark pipeline cannot parse kramdown IAL ({: ...}), ==mark==, or
    // SiYuan-specific blocks and leaks them as raw text.
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
    else cancelAutoScan();
  }

  function toggleIncludeSubdocuments(checked: boolean): void {
    includeSubdocuments = checked;
    invalidateDocumentTarget();
  }

  function toggleSourceEditingLock(): void {
    sourceEditingLocked = !sourceEditingLocked;
  }

  function toggleStemStyles(): void {
    showStemStyles = !showStemStyles;
  }

  function toggleStemTags(): void {
    showStemTags = !showStemTags;
    controller.setSetting?.("practiceStemTags", showStemTags);
  }

  function toggleHeaderAction(action: PracticeHeaderAction): void {
    practiceHeaderActions = { ...practiceHeaderActions, [action]: !practiceHeaderActions[action] };
    controller.setSetting?.("practiceHeaderActions", practiceHeaderActions);
  }

  function toggleIndefinitePracticeMode(): void {
    indefinitePracticeMode = !indefinitePracticeMode;
    onIndefinitePracticeModeChange?.(indefinitePracticeMode);
  }

  function togglePauseOnBlur(): void {
    pauseOnBlur = !pauseOnBlur;
    onPauseOnBlurChange?.(pauseOnBlur);
    if (!pauseOnBlur && isAutoPaused()) {
      if (practiceRuntime && practiceState?.matches("active") && practiceState?.context.timerPaused) {
        practiceRuntime.actor.send({ type: "RESUME_TIMER", now: now() });
        startTimer();
      }
      clearAutoPaused();
    }
  }
</script>

<QuestionBankView
  bind:rootElement bind:documentId bind:initializationPreview bind:systemDocumentId bind:rebindingPreview
  bind:view bind:composerOpen bind:examMode bind:autoScanDocument bind:dataPanelOpen bind:dataPanelUserControlled bind:fileInput
  bind:scanPanelOpen bind:scanPanelUserControlled bind:scanDetailsOpen bind:pendingReplacement bind:topicId bind:order bind:optionOrder bind:filter bind:filterPresets bind:referencePresets bind:activeFilterPresetId
  bind:endConfirmation bind:answerCardOpen
  {currentQuestion} {topicResources} {persistTopicResource} {persistingTopicResourceIdentity} {persistedTopicResourceIdentities}
  {buildRevision} {showPracticeTitle} {showPracticeBreadcrumb} {label} {translations} {onClose} {busy} {questionIndex} {queue} {completedQuestionIndices} {documentPathHighlights} {onDocumentPathHighlightsChange}
  {timingEnabled} {sessionElapsedMs} {questionElapsedMs} {breadcrumbItems} {currentQuestionBlockId} {mobileBreadcrumb} {breadcrumbPriority}
  {breadcrumbTextDisplay} {openQuestionSource} {submitting} {reviewing} {answerTimerPaused} {timerEffectivelyPaused}
  {sourceEditingLocked} {toggleSourceEditingLock} {showStemStyles} {toggleStemStyles} {toggleIndefinitePracticeMode}
  {pauseOnBlur} {togglePauseOnBlur}
  {showStemTags} {toggleStemTags} {practiceHeaderActions} {toggleHeaderAction}
  {previousQuestion} {nextQuestion} {togglePracticeTimer} {exitReview} {pausePractice} {requestEndPractice} {error} {binding}
  {validDocument} {useCurrentDocument} {getOpenDocumentTabs} {previewInitialization} {confirmInitialization} {invalidateSystemDocumentTarget} {previewRebinding}
  {confirmRebinding} {invalidateDocumentTarget} {practiceRuntime} {complete} {selectView} {questionCatalog} {sourceDocuments}
  {questionSetBlueprints} {run} {loadQuestionSetData} {previewSourceSync} {confirmSourceSync} {assembleBlueprint} {saveBlueprint}
  {removeBlueprint} {useFrozenPracticeSet} {statisticsSnapshot} {statisticsLoading} {statisticsRange} {statisticsSort}
  {statisticsBookmarkEntries} {openBookmarkSource} {startBookmarkPractice}
  {changeStatisticsRange} {changeStatisticsSort} {statisticsTopicDictionary} {subjectQuestionTotals} {changeSubjectQuestionTotal} {subjectTotalsSaveStatus} {statisticsLayout} {changeStatisticsLayout} {openStatisticsCardPreview} {controller} {examQuestions} {preview} {sourceIdentity} {uuid} {random}
  {renderQuestionMarkdown} {refreshStoredSessions} {scanDocument} {toggleAutoScanDocument} {includeSubdocuments} {toggleIncludeSubdocuments} {storedSessions} {openStoredSession}
  {exportSessionDiagnostic} {exportAttempts} {selectImportFile} {importPreview} {confirmImport} {importResult} {progressQuestions}
  {completionPercent} {attemptedQuestions} {untouchedQuestions} {wrongQuestions} {reviewQuestions} {reviewAgainQuestions} {reviewHardQuestions} {pendingSync} {syncComplete} {autoSyncIndex}
  {scanMessageGroups} {sourceTypeLabel} {completionStatusLabel} {messageContext} {messageClipboardText} {scanLogText} {copyText}
  {confirmSync} {toggleAutoSyncIndex} topicAssignmentCount={topicAssignments.length} {topicRelationMode} {topicRelationPreview}
  {topicRelationReady} {setTopicRelationMode} {previewTopicRelations} {confirmTopicRelations}
  {syncTopicProgress} toggleSyncTopicProgress={toggleSyncTopicProgress} rebuildTopicProgress={rebuildTopicProgress}
  {recoverableSession} {resumePractice} {confirmRestartPractice} {topics} {startPractice}
  {openQuestionSetComposer} {currentGroup} {displayedOptions} {selectedOptionIds} {revealed} {readOnlyQuestion}
  {playlists} {activePlaylistId} {playlistResolution} {playlistResolving} {selectPlaylist} {openPlaylistManager}
  bind:playlistManagerOpen {closePlaylistManager} {savePlaylist} {deletePlaylist}
  {objectiveCorrect} {subjectiveScore} {currentAttempt} {durationComparisons} {durationComparisonPosition} {inheritSourceStyles} {questionRenderMode} {indefinitePracticeMode} {revealActionBelowOptions} {renderedQuestionContent}
  {mountSourceBlock} {questionTypeLabel} {optionMarkdown} {formatDuration} {toggleOption} {changeSubjectiveScore}
  {resetQuestionTimer} {confirmEndPractice} {practiceSaveStatus} {practiceSaveError} {retryPracticeSave}
  {correctCurrentAnswer}
  {recoveryIssues} {goToQuestion} {suggestedRating} {revealAnswer} {retry} {submitRating} {correctRating} {sessionAttempts}
  {completionCorrect} {completionDurationMs} {touchedDrafts} {completionShowCorrectness} {completionShowRating}
  {completionShowDuration} {completionShowAnswer} {completionShowAnsweredAt} {resetPractice}
  {currentBookmark} onToggleBookmark={toggleBookmark} onSaveBookmarkDetails={saveBookmarkDetails} onRemoveBookmark={removeCurrentBookmark} {bookmarkedQuestions}
  {questionIndexProjectionBlockId} {includeUnansweredMappingRows} onIncludeUnansweredMappingRowsChange={setIncludeUnansweredMappingRows} {pruneStaleMappingRows} onPruneStaleMappingRowsChange={setPruneStaleMappingRows} {mappingStatus} {mappingMessage} {selectCurrentMappingTarget} {checkMappingTarget} {syncMappingTarget} {setMappingTarget}
  {markedIndexTargets} {refreshMarkedIndexTargets}
/>
