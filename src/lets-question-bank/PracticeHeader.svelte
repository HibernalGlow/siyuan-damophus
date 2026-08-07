<script lang="ts">
  import { ArrowLeft, ChevronLeft, ChevronRight, LayoutGrid, LocateFixed, Pause, Play, X } from "lucide-svelte";
  import type { BlockBreadcrumbItem } from "@/api";
  import { Button } from "@/components/ui/button";
  import {
    createPracticeBreadcrumbAction,
    formatDuration,
    type Label,
  } from "./question-bank-display";
  import type { BreadcrumbOverflowPriority, BreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
  import type { Question } from "@/question-bank/core/types";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";
  import type { DurationComparisonPosition } from "./duration-comparison-position";
  import PracticeDurationComparison from "./PracticeDurationComparison.svelte";

  export let currentQuestion: Question | undefined;
  export let buildRevision: string;
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

  const practiceBreadcrumb = (node: HTMLElement, state: { items: BlockBreadcrumbItem[]; activeId?: string; fallback: string }) => createPracticeBreadcrumbAction(node, state, {
    mobile: mobileBreadcrumb,
    priority: breadcrumbPriority,
    textDisplay: breadcrumbTextDisplay,
    label,
    onNavigate: (id) => openQuestionSource?.(id),
  });
</script>

<header class="app-header" class:app-header--practice={currentQuestion !== undefined}>
  <div class="app-brand">
    <h1>Damophus</h1>
    <span>{label("displayName", "Question Bank")}</span>
    <code class="build-revision" title={buildRevision}>{buildRevision}</code>
  </div>
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
        <div
          class="practice-topic practice-breadcrumb"
          use:practiceBreadcrumb={{
            items: breadcrumbItems,
            activeId: currentQuestionBlockId,
            fallback: currentQuestion.metadata.topicPath.join(" / "),
          }}
          aria-label="Breadcrumb"
        ></div>
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
