<script lang="ts">
  import { RotateCcw } from "lucide-svelte";
  import * as Alert from "@/components/ui/alert";
  import { Button } from "@/components/ui/button";
  import * as ScrollArea from "@/components/ui/scroll-area";
  import PracticeQuestionContent from "./PracticeQuestionContent.svelte";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";
  import type { DurationComparisonPosition } from "./duration-comparison-position";
  import PracticeDurationComparison from "./PracticeDurationComparison.svelte";
  import type { AttemptEvent, Question, QuestionGroup, ShuffledOption, MasteryRating } from "@/question-bank/core/types";
  import type { TopicResourceProjection } from "@/question-bank/adapters/siyuan";
  import type { Label } from "./question-bank-display";

  export let label: Label;
  export let currentQuestion: Question;
  export let currentGroup: QuestionGroup | undefined;
  export let currentQuestionBlockId: string | undefined;
  export let displayedOptions: ShuffledOption[] = [];
  export let selectedOptionIds: string[] = [];
  export let revealed = false;
  export let readOnlyQuestion = false;
  export let objectiveCorrect: boolean | null = null;
  export let subjectiveScore: number | undefined;
  export let currentAttempt: AttemptEvent | undefined;
  export let topicResources: TopicResourceProjection[] = [];
  export let persistTopicResource: ((projection: TopicResourceProjection) => void) | undefined = undefined;
  export let persistingTopicResourceIdentity = "";
  export let persistedTopicResourceIdentities: ReadonlySet<string> = new Set();
  export let durationComparisons: AttemptDurationComparison[] = [];
  export let durationComparisonPosition: DurationComparisonPosition = "rating";
  export let inheritSourceStyles = true;
  export let questionRenderMode: "html" | "native" | "embed" = "native";
  export let sourceEditingLocked = false;
  export let renderedQuestionContent: (markdown: string, sourceStyles: boolean) => string;
  export let mountSourceBlock: ((target: HTMLElement, blockId: string, editable: boolean, section?: "stem" | "solution", renderMode?: "native" | "embed") => (() => void) | Promise<() => void>) | undefined;
  export let questionTypeLabel: (type: Question["type"]) => string;
  export let optionMarkdown: (option: ShuffledOption) => string;
  export let formatDuration: (milliseconds: number) => string;
  export let toggleOption: (optionId: string) => void;
  export let changeSubjectiveScore: (event: Event) => void;
  export let timingEnabled = true;
  export let questionElapsedMs = 0;
  export let resetQuestionTimer: () => void;
  export let endConfirmation = false;
  export let confirmEndPractice: () => void;
  export let practiceSaveStatus: "saved" | "saving" | "error" = "saved";
  export let practiceSaveError = "";
  export let retryPracticeSave: () => void;
  export let recoveryIssues: Array<{ questionId: string; code: string }> = [];
  export let answerCardOpen = false;
  export let queue: Question[] = [];
  export let questionIndex = 0;
  export let completedQuestionIndices: number[] = [];
  export let goToQuestion: (index: number) => void;
  export let previousQuestion: () => void;
  export let nextQuestion: () => void;
  export let submitting = false;
  export let suggestedRating: MasteryRating | undefined;
  export let revealAnswer: () => void;
  export let retry: () => void;
  export let submitRating: (rating: MasteryRating) => void;
</script>

<section class="practice min-h-0 flex-1 overflow-hidden" aria-live="polite">
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
    <Button
      variant="ghost"
      class="answer-card-scrim h-auto w-auto rounded-none p-0"
      aria-label={label("closeAnswerCard", "Close answer card")}
      onclick={() => answerCardOpen = false}
    ></Button>
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
      {topicResources}
      {persistTopicResource}
      {persistingTopicResourceIdentity}
      {persistedTopicResourceIdentities}
      {durationComparisons}
      {durationComparisonPosition}
      {inheritSourceStyles}
      {questionRenderMode}
      {sourceEditingLocked}
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
        <Button variant="ghost" size="icon" title={label("resetQuestionTimer", "Reset question timer")} aria-label={label("resetQuestionTimer", "Reset question timer")} onclick={resetQuestionTimer}>
          <RotateCcw size={16} aria-hidden="true" />
        </Button>
      {/if}
      <Button onclick={revealAnswer}>
        <svg data-icon="inline-start" aria-hidden="true"><use href="#iconEye"></use></svg>
        {label("reveal", "Reveal answer")}
      </Button>
    </div>
  {:else}
    {#if durationComparisonPosition === "rating" && durationComparisons.length > 0}
      <div class="rating-duration-row">
        <PracticeDurationComparison comparisons={durationComparisons} {label} {formatDuration} />
      </div>
    {/if}
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

<style>
  .rating-duration-row { min-height: 30px; padding: 4px 20px 3px; border-top: 1px solid var(--b3-border-color); background: var(--b3-theme-background); }
  @media (max-width: 750px) {
    .rating-duration-row { padding-inline: 8px; }
  }
</style>
