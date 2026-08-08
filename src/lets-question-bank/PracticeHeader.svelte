<script lang="ts">
  import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, LocateFixed, LockKeyhole, Pause, Pencil, Play, UnlockKeyhole, X } from "lucide-svelte";
  import type { BlockBreadcrumbItem } from "@/api";
  import { Button } from "@/components/ui/button";
  import {
    createPracticeBreadcrumbAction,
    formatDuration,
    type Label,
  } from "./question-bank-display";
  import type { BreadcrumbOverflowPriority, BreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
  import type { ObjectiveAnswer, Question } from "@/question-bank/core/types";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";
  import type { DurationComparisonPosition } from "./duration-comparison-position";
  import PracticeDurationComparison from "./PracticeDurationComparison.svelte";

  export let currentQuestion: Question | undefined;
  export let buildRevision: string;
  export let showPracticeTitle = false;
  export let showPracticeBreadcrumb = true;
  export let label: Label;
  export let translations: Record<string, string> = {};
  export let onClose: (() => void) | undefined = undefined;
  export let busy = false;
  export let questionIndex = 0;
  export let queueLength = 0;
  export let completedCount = 0;
  export let timingEnabled = true;
  export let sessionElapsedMs = 0;
  export let durationComparisons: AttemptDurationComparison[] = [];
  export let durationComparisonPosition: DurationComparisonPosition = "rating";
  export let breadcrumbItems: BlockBreadcrumbItem[] = [];
  export let currentQuestionBlockId: string | undefined;
  export let mobileBreadcrumb = false;
  export let breadcrumbPriority: BreadcrumbOverflowPriority = "tail";
  export let breadcrumbTextDisplay: BreadcrumbTextDisplay;
  export let openQuestionSource: ((blockId: string) => void) | undefined;
  export let submitting = false;
  export let reviewing = false;
  export let answerTimerPaused = false;
  export let timerEffectivelyPaused = false;
  export let answerCardOpen = false;
  export let previousQuestion: () => void;
  export let nextQuestion: () => void;
  export let togglePracticeTimer: () => void;
  export let exitReview: () => void;
  export let pausePractice: () => void;
  export let requestEndPractice: () => void;
  export let onAnswerCardToggle: (open: boolean) => void;
  export let revealed = false;
  export let sourceEditingAvailable = false;
  export let sourceEditingLocked = false;
  export let toggleSourceEditingLock: () => void = () => {};
  export let onCorrectAnswer: ((answer: ObjectiveAnswer) => void) | undefined = undefined;

  let correctionOpen = false;
  let selectedCorrectionIds: string[] = [];
  let selectedCorrectionBoolean = "";

  function openCorrection(): void {
    const answer = currentQuestion?.answer;
    if (!answer) return;
    selectedCorrectionIds = answer.kind === "options" ? [...answer.optionIds] : [];
    selectedCorrectionBoolean = answer.kind === "boolean" ? String(answer.value) : "";
    correctionOpen = true;
  }

  function toggleCorrectionOption(optionId: string): void {
    if (currentQuestion?.type === "multiple" || currentQuestion?.type === "indefinite") {
      selectedCorrectionIds = selectedCorrectionIds.includes(optionId)
        ? selectedCorrectionIds.filter((id) => id !== optionId)
        : [...selectedCorrectionIds, optionId];
    } else {
      selectedCorrectionIds = [optionId];
    }
  }

  function saveCorrection(): void {
    const answer: ObjectiveAnswer | undefined = currentQuestion?.answer?.kind === "boolean"
      ? selectedCorrectionBoolean === "true" || selectedCorrectionBoolean === "false"
        ? { kind: "boolean", value: selectedCorrectionBoolean === "true" }
        : undefined
      : selectedCorrectionIds.length > 0
        ? { kind: "options", optionIds: selectedCorrectionIds }
        : undefined;
    if (!answer) return;
    onCorrectAnswer?.(answer);
    correctionOpen = false;
  }

  const practiceBreadcrumb = (node: HTMLElement, state: { items: BlockBreadcrumbItem[]; activeId?: string; fallback: string }) => createPracticeBreadcrumbAction(node, state, {
    mobile: mobileBreadcrumb,
    priority: breadcrumbPriority,
    textDisplay: breadcrumbTextDisplay,
    label,
    onNavigate: (id) => openQuestionSource?.(id),
  });
</script>

{#if currentQuestion || showPracticeTitle}
<header
  class="app-header"
  class:app-header--practice={currentQuestion !== undefined}
  class:app-header--title-hidden={!showPracticeTitle}
>
  {#if showPracticeTitle}
    <div class="app-brand">
      <h1>Damophus</h1>
      <span>{label("displayName", "Question Bank")}</span>
      <code class="build-revision" title={buildRevision}>{buildRevision}</code>
    </div>
  {/if}
  {#if currentQuestion}
    <div class="practice-toolbar">
      <div class="practice-status">
        <span class="progress-copy">
          <span class="progress-label">{label("progress", "Progress")} </span>
          {questionIndex + 1} / {queueLength}
          <span class="submitted-copy"> · {completedCount} {label("submitted", "submitted")}</span>
        </span>
        {#if timingEnabled}
          <span class="timer" title={label("sessionElapsed", "Session elapsed time")}>
            <svg aria-hidden="true"><use href="#iconClock"></use></svg>
            {formatDuration(sessionElapsedMs)}
          </span>
        {/if}
      </div>
      <div class="practice-heading-details">
        {#if showPracticeBreadcrumb}
        <div
          class="practice-topic practice-breadcrumb"
          use:practiceBreadcrumb={{
            items: breadcrumbItems,
            activeId: currentQuestionBlockId,
            fallback: currentQuestion.metadata.topicPath.join(" / "),
          }}
          aria-label="Breadcrumb"
        ></div>
        {/if}
        {#if durationComparisonPosition === "header" && durationComparisons.length > 0}
          <PracticeDurationComparison comparisons={durationComparisons} {label} {formatDuration} />
        {/if}
      </div>
      <div class="practice-controls">
        <Button variant="ghost" size="icon" disabled={questionIndex === 0 || submitting} title={label("previous", "Previous question")} aria-label={label("previous", "Previous question")} onclick={previousQuestion}>
          <ChevronLeft size={17} aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" disabled={questionIndex >= queueLength - 1 || submitting} title={label("next", "Next question")} aria-label={label("next", "Next question")} onclick={nextQuestion}>
          <ChevronRight size={17} aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          data-practice-timer-toggle
          disabled={submitting || reviewing || answerTimerPaused}
          title={timerEffectivelyPaused ? label("resumeTimer", "Resume timer") : label("pauseTimer", "Pause timer")}
          aria-label={timerEffectivelyPaused ? label("resumeTimer", "Resume timer") : label("pauseTimer", "Pause timer")}
          aria-pressed={timerEffectivelyPaused}
          onclick={togglePracticeTimer}
        >
          {#if timerEffectivelyPaused}<Play size={17} aria-hidden="true" />{:else}<Pause size={17} aria-hidden="true" />{/if}
        </Button>
        {#if currentQuestionBlockId && openQuestionSource}
          <Button
            variant="ghost"
            size="icon"
            data-open-question-source
            title={label("openSource", "Open source in SiYuan")}
            aria-label={label("openSource", "Open source in SiYuan")}
            onclick={() => openQuestionSource?.(currentQuestionBlockId as string)}
          >
            <LocateFixed size={17} aria-hidden="true" />
          </Button>
        {/if}
        {#if sourceEditingAvailable}
          <Button
            variant="ghost"
            size="icon"
            data-source-editing-lock
            title={sourceEditingLocked ? label("unlockSourceEditing", "Unlock source editing") : label("lockSourceEditing", "Lock source editing")}
            aria-label={sourceEditingLocked ? label("unlockSourceEditing", "Unlock source editing") : label("lockSourceEditing", "Lock source editing")}
            aria-pressed={sourceEditingLocked}
            onclick={toggleSourceEditingLock}
          >
            {#if sourceEditingLocked}<LockKeyhole size={17} aria-hidden="true" />{:else}<UnlockKeyhole size={17} aria-hidden="true" />{/if}
          </Button>
        {/if}
        {#if revealed && currentQuestion.answer && onCorrectAnswer && !reviewing}
          <Button
            variant="ghost"
            size="icon"
            data-correct-answer
            title={label("correctAnswer", "Correct answer")}
            aria-label={label("correctAnswer", "Correct answer")}
            onclick={openCorrection}
          >
            <Pencil size={17} aria-hidden="true" />
          </Button>
        {/if}
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
        onclick={() => onAnswerCardToggle(!answerCardOpen)}
      >
        <LayoutGrid size={17} aria-hidden="true" />
      </Button>
    </div>
  {:else}
    <div class="header-actions">
      {#if busy}<span class="status">{label("loading", "Working...")}</span>{/if}
      {#if onClose}
        <Button variant="ghost" size="icon-sm" title={translations["settings.close"] ?? "Close"} aria-label={translations["settings.close"] ?? "Close"} onclick={onClose}>
          <X />
        </Button>
      {/if}
    </div>
  {/if}
</header>
{/if}

{#if correctionOpen && currentQuestion?.answer}
  <Button variant="ghost" class="correction-backdrop h-auto w-auto rounded-none p-0" aria-label={label("cancel", "Cancel")} onclick={() => correctionOpen = false}></Button>
  <div class="correction-dialog" role="dialog" aria-modal="true" aria-label={label("correctAnswer", "Correct answer")}>
    <header>
      <strong>{label("correctAnswer", "Correct answer")}</strong>
      <Button variant="ghost" size="icon" aria-label={label("cancel", "Cancel")} onclick={() => correctionOpen = false}><X size={16} /></Button>
    </header>
    {#if currentQuestion.answer.kind === "boolean"}
      <div class="correction-options correction-options--boolean">
        {#each ["true", "false"] as value}
          <Button variant={selectedCorrectionBoolean === value ? "secondary" : "outline"} aria-pressed={selectedCorrectionBoolean === value} onclick={() => selectedCorrectionBoolean = value}>{value}</Button>
        {/each}
      </div>
    {:else}
      <div class="correction-options">
        {#each currentQuestion.options as option (option.id)}
          <Button variant={selectedCorrectionIds.includes(option.id) ? "secondary" : "outline"} aria-pressed={selectedCorrectionIds.includes(option.id)} onclick={() => toggleCorrectionOption(option.id)}>{option.id}</Button>
        {/each}
      </div>
    {/if}
    <div class="correction-actions">
      <Button variant="outline" onclick={() => correctionOpen = false}>{label("cancel", "Cancel")}</Button>
      <Button data-save-corrected-answer onclick={saveCorrection}>{label("save", "Save")}</Button>
    </div>
  </div>
{/if}

<style>
  :global(.correction-backdrop) { position: fixed; inset: 0; z-index: 9998; border: 0; background: rgb(0 0 0 / 24%); }
  .correction-dialog { position: fixed; z-index: 9999; top: 64px; right: 16px; width: min(360px, calc(100vw - 32px)); padding: 14px; border: 1px solid var(--b3-border-color); border-radius: 8px; background: var(--b3-theme-background); color: var(--b3-theme-on-background); box-shadow: 0 12px 32px rgb(0 0 0 / 24%); }
  .correction-dialog > header { display: flex; align-items: center; justify-content: space-between; }
  .correction-options { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 14px; }
  .correction-options--boolean { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .correction-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
