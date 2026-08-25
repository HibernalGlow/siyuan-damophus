<script lang="ts">
  import {
    Check,
    CheckCircle2,
    Clock3,
    Gauge,
    ListChecks,
    Minus,
    RotateCcw,
    X,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import type { AttemptEvent, MasteryRating, Question } from "@/question-bank/core/types";

  type Label = (key: string, fallback: string) => string;

  export let label: Label;
  export let queue: Question[] = [];
  export let attempts: AttemptEvent[] = [];
  export let submittedCount = 0;
  export let correctCount = 0;
  export let completionDurationMs = 0;
  export let touchedDrafts = 0;
  export let showCorrectness = true;
  export let showRating = true;
  export let showDuration = true;
  export let showAnswer = true;
  export let showAnsweredAt = false;
  export let formatDuration: (milliseconds: number) => string;
  export let goToQuestion: (index: number) => void;
  export let resetPractice: () => void;

  const ratings: MasteryRating[] = ["again", "hard", "good", "easy"];

  $: attemptsByQuestionId = new Map(attempts.map((attempt) => [attempt.question_id, attempt]));
  $: objectiveAttempts = attempts.filter((attempt) => attempt.objective_correct !== null);
  $: accuracy = objectiveAttempts.length === 0 ? undefined : Math.round((correctCount / objectiveAttempts.length) * 100);
  $: averageDurationMs = submittedCount === 0 ? 0 : Math.round(completionDurationMs / submittedCount);
  $: ratingCounts = new Map(ratings.map((rating) => [
    rating,
    attempts.filter((attempt) => attempt.mastery_rating === rating).length,
  ]));

  function correctnessLabel(attempt: AttemptEvent | undefined): string {
    if (!attempt || attempt.objective_correct === null) return label("subjective", "Subjective");
    return attempt.objective_correct ? label("correct", "Correct") : label("incorrect", "Incorrect");
  }

  function answerLabel(attempt: AttemptEvent | undefined): string {
    if (!attempt) return label("notSubmitted", "Not submitted");
    if (attempt.subjective_score !== undefined) {
      return `${label("subjectiveScore", "Self score")} ${attempt.subjective_score}`;
    }
    return attempt.selected_option_ids.length > 0
      ? attempt.selected_option_ids.join(" / ")
      : label("noSelection", "No selection");
  }

  function answeredAtLabel(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function questionStateClass(attempt: AttemptEvent | undefined): string {
    if (!attempt || attempt.objective_correct === null) return "subjective";
    return attempt.objective_correct ? "correct" : "incorrect";
  }
</script>

<section class="completion min-h-0 flex-1 overflow-y-auto" data-testid="practice-completion">
  <div class="completion-shell">
    <header class="completion-heading">
      <span class="completion-heading-icon" aria-hidden="true"><CheckCircle2 /></span>
      <div>
        <h2>{queue.length === 0 ? label("noQuestions", "No questions match this scope and filter") : label("complete", "Practice complete")}</h2>
        {#if queue.length > 0}
          <p>{label("completionOverviewDescription", "Review this session and reopen any question for details")}</p>
        {/if}
      </div>
    </header>

    {#if queue.length > 0}
      <div class="completion-summary" aria-label={label("completionOverview", "Session overview")}>
        <article>
          <span class="summary-icon"><ListChecks aria-hidden="true" /></span>
          <div><strong>{submittedCount}<small> / {queue.length}</small></strong><span>{label("submitted", "Submitted")}</span></div>
        </article>
        {#if showCorrectness}
          <article>
            <span class="summary-icon correct"><Check aria-hidden="true" /></span>
            <div><strong>{accuracy === undefined ? "--" : `${accuracy}%`}</strong><span>{label("completionAccuracy", "Accuracy")}</span></div>
          </article>
        {/if}
        {#if showDuration}
          <article>
            <span class="summary-icon"><Clock3 aria-hidden="true" /></span>
            <div><strong>{formatDuration(completionDurationMs)}</strong><span>{label("answerTime", "Answer time")}</span></div>
          </article>
          <article>
            <span class="summary-icon"><Gauge aria-hidden="true" /></span>
            <div><strong>{formatDuration(averageDurationMs)}</strong><span>{label("completionAverageTime", "Average per question")}</span></div>
          </article>
        {/if}
      </div>

      {#if showRating}
        <section class="completion-ratings" aria-labelledby="completion-ratings-heading">
          <div class="completion-section-heading">
            <h3 id="completion-ratings-heading">{label("completionRatingDistribution", "Rating distribution")}</h3>
            <span>{submittedCount} {label("completionRatings", "ratings")}</span>
          </div>
          <div class="rating-distribution">
            {#each ratings as rating}
              <div class={`rating-segment ${rating}`} style={`--rating-share: ${submittedCount === 0 ? 0 : ((ratingCounts.get(rating) ?? 0) / submittedCount) * 100}%`}>
                <span>{label(rating, rating)}</span>
                <strong>{ratingCounts.get(rating) ?? 0}</strong>
                <i aria-hidden="true"><b></b></i>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <section class="completion-review" aria-labelledby="completion-review-heading">
        <div class="completion-section-heading">
          <h3 id="completion-review-heading">{label("completionQuestionReview", "Question review")}</h3>
          {#if touchedDrafts > 0}<span>{touchedDrafts} {label("drafts", "Drafts")}</span>{/if}
        </div>
        <div class="completion-question-grid">
          {#each queue as question, index (question.id)}
            {@const attempt = attemptsByQuestionId.get(question.id)}
            <Button
              variant="outline"
              class={`completion-question ${questionStateClass(attempt)}`}
              onclick={() => goToQuestion(index)}
              aria-label={`${index + 1}. ${question.title}`}
            >
              <span class="question-index">{index + 1}</span>
              <span class="question-content">
                <strong>{question.title}</strong>
                <span class="question-metadata">
                  {#if showCorrectness}
                    <span class="correctness">
                      {#if attempt?.objective_correct === true}<Check aria-hidden="true" />{:else if attempt?.objective_correct === false}<X aria-hidden="true" />{:else}<Minus aria-hidden="true" />{/if}
                      {correctnessLabel(attempt)}
                    </span>
                  {/if}
                  {#if showRating && attempt}<span class={`rating-pill ${attempt.mastery_rating}`}>{label(attempt.mastery_rating, attempt.mastery_rating)}</span>{/if}
                  {#if showDuration && attempt?.duration_ms !== undefined}<span><Clock3 aria-hidden="true" />{formatDuration(attempt.duration_ms)}</span>{/if}
                </span>
                {#if showAnswer || (showAnsweredAt && attempt)}
                  <span class="question-detail">
                    {#if showAnswer}<span>{label("completionYourAnswer", "Your answer")}: <b>{answerLabel(attempt)}</b></span>{/if}
                    {#if showAnsweredAt && attempt}<time datetime={attempt.answered_at}>{answeredAtLabel(attempt.answered_at)}</time>{/if}
                  </span>
                {/if}
              </span>
            </Button>
          {/each}
        </div>
      </section>
    {/if}

    <footer class="completion-actions">
      <Button variant="outline" onclick={resetPractice}><RotateCcw aria-hidden="true" />{label("restart", "Back to scope")}</Button>
    </footer>
  </div>
</section>

<style>
  .completion { width: 100%; min-width: 0; min-height: 0; box-sizing: border-box; padding: clamp(16px, 3cqi, 32px); text-align: left; }
  .completion-shell { width: min(1080px, 100%); max-width: 100%; min-width: 0; margin: 0 auto; display: grid; gap: 20px; }
  .completion-heading { display: flex; align-items: center; gap: 12px; }
  .completion-heading-icon { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 50%; display: grid; place-items: center; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 14%, transparent); }
  .completion-heading-icon :global(svg) { width: 22px; height: 22px; }
  .completion-heading p { margin: 3px 0 0; color: var(--b3-theme-on-surface); font-size: 12px; }
  .completion-summary { width: 100%; min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); border-block: 1px solid var(--b3-border-color); }
  .completion-summary article { min-width: 0; padding: 16px; display: flex; align-items: center; gap: 12px; border-left: 1px solid var(--b3-border-color); }
  .completion-summary article:first-child { border-left: 0; }
  .summary-icon { width: 34px; height: 34px; flex: 0 0 34px; border-radius: 6px; display: grid; place-items: center; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent); }
  .summary-icon.correct { color: var(--b3-card-success-color, #2e7d5b); background: color-mix(in srgb, var(--b3-card-success-color, #2e7d5b) 12%, transparent); }
  .summary-icon :global(svg) { width: 17px; height: 17px; }
  .completion-summary article > div { min-width: 0; display: grid; }
  .completion-summary strong { color: var(--b3-theme-on-background); font-size: 20px; line-height: 1.25; font-variant-numeric: tabular-nums; }
  .completion-summary small { color: var(--b3-theme-on-surface); font-size: 12px; font-weight: 500; }
  .completion-summary article > div > span { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .completion-ratings, .completion-review { padding: 0; }
  .completion-section-heading { margin-bottom: 10px; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .completion-section-heading h3 { margin: 0; font-size: 14px; }
  .completion-section-heading > span { color: var(--b3-theme-on-surface); font-size: 11px; }
  .rating-distribution { width: 100%; min-width: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .rating-segment { min-width: 0; padding: 10px 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 8px; }
  .rating-segment span { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .rating-segment strong { font-size: 16px; font-variant-numeric: tabular-nums; }
  .rating-segment i { height: 3px; grid-column: 1 / -1; border-radius: 2px; overflow: hidden; background: color-mix(in srgb, currentColor 10%, transparent); }
  .rating-segment i b { display: block; width: var(--rating-share); height: 100%; border-radius: inherit; background: currentColor; }
  .rating-segment.again { color: var(--b3-theme-error, #c74747); }
  .rating-segment.hard { color: #b06f28; }
  .rating-segment.good { color: var(--b3-theme-primary); }
  .rating-segment.easy { color: var(--b3-card-success-color, #2e7d5b); }
  .completion-question-grid { width: 100%; min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .completion-question-grid :global(.completion-question) { width: 100%; height: auto; min-height: 76px; min-width: 0; padding: 12px; align-items: flex-start; justify-content: flex-start; gap: 11px; border-radius: 6px; overflow: hidden; white-space: normal; text-align: left; }
  .completion-question-grid :global(.completion-question.correct) { border-left: 3px solid var(--b3-card-success-color, #2e7d5b); }
  .completion-question-grid :global(.completion-question.incorrect) { border-left: 3px solid var(--b3-theme-error, #c74747); }
  .completion-question-grid :global(.completion-question.subjective) { border-left: 3px solid var(--b3-theme-primary); }
  .question-index { width: 26px; height: 26px; flex: 0 0 26px; border-radius: 50%; display: grid; place-items: center; background: var(--b3-list-hover); font-size: 11px; font-variant-numeric: tabular-nums; }
  .question-content { min-width: 0; flex: 1; display: grid; gap: 6px; }
  .question-content > strong { overflow: hidden; color: var(--b3-theme-on-background); font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .question-metadata { min-width: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; color: var(--b3-theme-on-surface); font-size: 11px; }
  .question-metadata > span { display: inline-flex; align-items: center; gap: 4px; }
  .question-metadata :global(svg) { width: 12px; height: 12px; }
  :global(.completion-question.correct) .correctness { color: var(--b3-card-success-color, #2e7d5b); }
  :global(.completion-question.incorrect) .correctness { color: var(--b3-theme-error, #c74747); }
  .rating-pill { padding: 1px 6px; border-radius: 999px; background: color-mix(in srgb, currentColor 10%, transparent); font-weight: 600; }
  .rating-pill.again { color: var(--b3-theme-error, #c74747); }
  .rating-pill.hard { color: #b06f28; }
  .rating-pill.good { color: var(--b3-theme-primary); }
  .rating-pill.easy { color: var(--b3-card-success-color, #2e7d5b); }
  .question-detail { min-width: 0; display: flex; justify-content: space-between; gap: 8px; color: var(--b3-theme-on-surface); font-size: 10px; }
  .question-detail span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .question-detail b { color: var(--b3-theme-on-background); font-weight: 600; }
  .question-detail time { flex: 0 0 auto; }
  .completion-actions { padding-top: 2px; display: flex; justify-content: center; }
  .completion-actions :global(button) { gap: 7px; }
  .completion-actions :global(svg) { width: 15px; height: 15px; }

  @container (max-width: 760px) {
    .completion-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .completion-summary article:nth-child(odd) { border-left: 0; }
    .completion-summary article:nth-child(n + 3) { border-top: 1px solid var(--b3-border-color); }
    .completion-question-grid { grid-template-columns: 1fr; }
  }

  @container (max-width: 480px) {
    .completion { padding: 14px 12px 20px; }
    .completion-shell { gap: 16px; }
    .completion-summary article { padding: 12px 8px; gap: 8px; }
    .summary-icon { width: 30px; height: 30px; flex-basis: 30px; }
    .completion-summary strong { font-size: 17px; }
    .rating-distribution { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
    .completion-question-grid :global(.completion-question) { min-height: 72px; padding: 10px; }
    .question-detail { align-items: flex-start; flex-direction: column; }
  }
</style>
