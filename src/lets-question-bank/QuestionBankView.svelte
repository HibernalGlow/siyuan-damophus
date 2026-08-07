<script lang="ts">
  import "./question-bank.css";
  import { BarChart3, BookOpenCheck } from "lucide-svelte";
  import * as Alert from "@/components/ui/alert";
  import * as Tabs from "@/components/ui/tabs";
  import PracticeHeader from "./PracticeHeader.svelte";
  import QuestionBankSetup from "./QuestionBankSetup.svelte";
  import QuestionSetComposer from "./QuestionSetComposer.svelte";
  import Statistics from "./Statistics.svelte";
  import ExamWorkspace from "./ExamWorkspace.svelte";
  import QuestionBankWorkspace from "./QuestionBankWorkspace.svelte";
  import QuestionBankPractice from "./QuestionBankPractice.svelte";
  import PracticeCompletion from "./PracticeCompletion.svelte";

  export let rootElement: HTMLElement;
  export let currentQuestion: any;
  export let buildRevision: string;
  export let label: any;
  export let translations: Record<string, string>;
  export let onClose: any;
  export let busy: boolean;
  export let questionIndex: number;
  export let queue: any[];
  export let completedQuestionIndices: number[];
  export let timingEnabled: boolean;
  export let sessionElapsedMs: number;
  export let breadcrumbItems: any[];
  export let currentQuestionBlockId: string | undefined;
  export let mobileBreadcrumb: boolean;
  export let breadcrumbPriority: any;
  export let breadcrumbTextDisplay: any;
  export let openQuestionSource: any;
  export let submitting: boolean;
  export let reviewing: boolean;
  export let answerTimerPaused: boolean;
  export let timerEffectivelyPaused: boolean;
  export let answerCardOpen: boolean;
  export let previousQuestion: any;
  export let nextQuestion: any;
  export let togglePracticeTimer: any;
  export let exitReview: any;
  export let pausePractice: any;
  export let requestEndPractice: any;
  export let error: string;
  export let binding: any;
  export let documentId: string;
  export let validDocument: any;
  export let initializationPreview: any;
  export let previewInitialization: any;
  export let confirmInitialization: any;
  export let systemDocumentId: string;
  export let invalidateSystemDocumentTarget: any;
  export let rebindingPreview: any;
  export let previewRebinding: any;
  export let confirmRebinding: any;
  export let invalidateDocumentTarget: any;
  export let practiceRuntime: any;
  export let complete: boolean;
  export let examMode: boolean;
  export let composerOpen: boolean;
  export let view: "practice" | "statistics";
  export let selectView: any;
  export let questionCatalog: any[];
  export let sourceDocuments: any[];
  export let questionSetBlueprints: any[];
  export let run: any;
  export let loadQuestionSetData: any;
  export let previewSourceSync: any;
  export let confirmSourceSync: any;
  export let assembleBlueprint: any;
  export let saveBlueprint: any;
  export let removeBlueprint: any;
  export let useFrozenPracticeSet: any;
  export let statisticsSnapshot: any;
  export let statisticsLoading: boolean;
  export let statisticsRange: any;
  export let statisticsSort: any;
  export let changeStatisticsRange: any;
  export let changeStatisticsSort: any;
  export let controller: any;
  export let examQuestions: any[];
  export let preview: any;
  export let sourceIdentity: any;
  export let uuid: any;
  export let random: any;
  export let renderQuestionMarkdown: any;
  export let refreshStoredSessions: any;
  export let autoScanDocument: boolean;
  export let scanDocument: any;
  export let toggleAutoScanDocument: any;
  export let storedSessions: any[];
  export let openStoredSession: any;
  export let exportSessionDiagnostic: any;
  export let dataPanelOpen: boolean;
  export let dataPanelUserControlled: boolean;
  export let fileInput: HTMLInputElement | null;
  export let exportAttempts: any;
  export let selectImportFile: any;
  export let importPreview: any;
  export let confirmImport: any;
  export let importResult: any;
  export let scanPanelOpen: boolean;
  export let scanPanelUserControlled: boolean;
  export let progressQuestions: any[];
  export let completionPercent: number;
  export let attemptedQuestions: number;
  export let untouchedQuestions: number;
  export let reviewQuestions: number;
  export let pendingSync: boolean;
  export let syncComplete: boolean;
  export let autoSyncIndex: boolean;
  export let scanDetailsOpen: boolean;
  export let scanMessageGroups: any[];
  export let sourceTypeLabel: any;
  export let completionStatusLabel: any;
  export let messageContext: any;
  export let messageClipboardText: any;
  export let scanLogText: any;
  export let copyText: any;
  export let confirmSync: any;
  export let toggleAutoSyncIndex: any;
  export let recoverableSession: any;
  export let resumePractice: any;
  export let pendingReplacement: boolean;
  export let confirmRestartPractice: any;
  export let topicId: string;
  export let topics: any[];
  export let order: any;
  export let filter: any;
  export let startPractice: any;
  export let openQuestionSetComposer: any;
  export let currentGroup: any;
  export let displayedOptions: any[];
  export let selectedOptionIds: string[];
  export let revealed: boolean;
  export let readOnlyQuestion: boolean;
  export let objectiveCorrect: boolean | null;
  export let subjectiveScore: number | undefined;
  export let currentAttempt: any;
  export let durationComparisons: any[];
  export let durationComparisonPosition: any;
  export let inheritSourceStyles: boolean;
  export let questionRenderMode: any;
  export let renderedQuestionContent: any;
  export let mountSourceBlock: any;
  export let questionTypeLabel: any;
  export let optionMarkdown: any;
  export let formatDuration: any;
  export let toggleOption: any;
  export let changeSubjectiveScore: any;
  export let correctCurrentAnswer: any;
  export let questionElapsedMs: number;
  export let resetQuestionTimer: any;
  export let endConfirmation: boolean;
  export let confirmEndPractice: any;
  export let practiceSaveStatus: any;
  export let practiceSaveError: string;
  export let retryPracticeSave: any;
  export let recoveryIssues: any[];
  export let goToQuestion: any;
  export let suggestedRating: any;
  export let revealAnswer: any;
  export let retry: any;
  export let submitRating: any;
  export let sessionAttempts: any[];
  export let completionCorrect: number;
  export let completionDurationMs: number;
  export let touchedDrafts: number;
  export let resetPractice: any;
</script>

<main
  bind:this={rootElement}
  class="question-bank damophus-theme-root damophus-question-bank-theme flex h-full min-h-0 flex-col overflow-hidden"
  data-testid="question-bank"
  data-practice-active={currentQuestion ? "true" : "false"}
>
  <PracticeHeader
    currentQuestion={currentQuestion}
    {buildRevision}
    {label}
    {translations}
    {onClose}
    {busy}
    questionIndex={questionIndex}
    queueLength={queue.length}
    completedCount={completedQuestionIndices.length}
    {timingEnabled}
    {sessionElapsedMs}
    {durationComparisons}
    {durationComparisonPosition}
    {breadcrumbItems}
    currentQuestionBlockId={currentQuestionBlockId}
    {mobileBreadcrumb}
    {breadcrumbPriority}
    {breadcrumbTextDisplay}
    {openQuestionSource}
    {submitting}
    {reviewing}
    {answerTimerPaused}
    {timerEffectivelyPaused}
    {answerCardOpen}
    {previousQuestion}
    {nextQuestion}
    {togglePracticeTimer}
    {exitReview}
    {pausePractice}
    {requestEndPractice}
    onAnswerCardToggle={(open) => answerCardOpen = open}
  />

  {#if error}
    <Alert.Root variant="destructive" class="mx-5 mt-3 w-auto shrink-0">
      <Alert.Title>{label("error", "Operation failed")}</Alert.Title>
      <Alert.Description>{error}</Alert.Description>
    </Alert.Root>
  {/if}

  {#if !binding}
    <QuestionBankSetup
      {label}
      bind:documentId
      {validDocument}
      {busy}
      bind:initializationPreview
      {previewInitialization}
      {confirmInitialization}
      bind:systemDocumentId
      {invalidateSystemDocumentTarget}
      bind:rebindingPreview
      {previewRebinding}
      {confirmRebinding}
      {invalidateDocumentTarget}
    />
  {:else}
    {#if !currentQuestion && !practiceRuntime && !complete && !examMode && !composerOpen}
      <Tabs.Root bind:value={view} class="mx-4 mt-3 shrink-0" onValueChange={(value) => selectView(value as "practice" | "statistics")}>
        <Tabs.List class="grid w-full grid-cols-2">
          <Tabs.Trigger value="practice" class="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BookOpenCheck size={16} aria-hidden="true" />
            {label("practice", "练习")}
          </Tabs.Trigger>
          <Tabs.Trigger value="statistics" class="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 size={16} aria-hidden="true" />
            {label("statistics", "统计")}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>
    {/if}

    {#if composerOpen}
      <QuestionSetComposer
        catalog={questionCatalog}
        documents={sourceDocuments}
        blueprints={questionSetBlueprints}
        {translations}
        loading={busy}
        onRefresh={() => { void run(loadQuestionSetData); }}
        onSync={previewSourceSync}
        onConfirmSync={confirmSourceSync}
        onAssemble={assembleBlueprint}
        onSave={saveBlueprint}
        onDelete={removeBlueprint}
        onUse={(value) => { void run(() => useFrozenPracticeSet(value)); }}
        onClose={() => composerOpen = false}
      />
    {:else if view === "statistics" && !currentQuestion && !practiceRuntime && !complete && !examMode}
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
    <QuestionBankWorkspace
      {label}
      bind:documentId
      {validDocument}
      {invalidateDocumentTarget}
      {busy}
      {preview}
      {scanDocument}
      bind:autoScanDocument
      {toggleAutoScanDocument}
      {storedSessions}
      {openStoredSession}
      {exportSessionDiagnostic}
      bind:dataPanelOpen
      bind:dataPanelUserControlled
      bind:fileInput
      {exportAttempts}
      {selectImportFile}
      {importPreview}
      {confirmImport}
      {importResult}
      bind:scanPanelOpen
      bind:scanPanelUserControlled
      {progressQuestions}
      {sourceIdentity}
      {completionPercent}
      {attemptedQuestions}
      {untouchedQuestions}
      {reviewQuestions}
      {pendingSync}
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
      {recoverableSession}
      {resumePractice}
      bind:pendingReplacement
      {confirmRestartPractice}
      bind:topicId
      {topics}
      bind:order
      bind:filter
      {startPractice}
      {openQuestionSetComposer}
      bind:examMode
    />
  {:else if currentQuestion}
    <QuestionBankPractice
      {label}
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
      {durationComparisons}
      {durationComparisonPosition}
      {inheritSourceStyles}
      {questionRenderMode}
      {renderedQuestionContent}
      {mountSourceBlock}
      {questionTypeLabel}
      {optionMarkdown}
      {formatDuration}
      {toggleOption}
      {changeSubjectiveScore}
      correctAnswer={correctCurrentAnswer}
      {timingEnabled}
      {questionElapsedMs}
      {resetQuestionTimer}
      bind:endConfirmation
      {confirmEndPractice}
      {practiceSaveStatus}
      {practiceSaveError}
      {retryPracticeSave}
      {recoveryIssues}
      bind:answerCardOpen
      {queue}
      {questionIndex}
      {completedQuestionIndices}
      {goToQuestion}
      {previousQuestion}
      {nextQuestion}
      {submitting}
      {suggestedRating}
      {revealAnswer}
      {retry}
      {submitRating}
    />

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
