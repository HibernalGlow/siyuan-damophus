<script lang="ts">
  import { Button } from "@/components/ui/button";
  import type { Question } from "@/question-bank/core/types";

  type Label = (key: string, fallback: string) => string;

  export let label: Label;
  export let queue: Question[] = [];
  export let submittedCount = 0;
  export let correctCount = 0;
  export let completionDurationMs = 0;
  export let touchedDrafts = 0;
  export let formatDuration: (milliseconds: number) => string;
  export let goToQuestion: (index: number) => void;
  export let resetPractice: () => void;
</script>

<section class="completion min-h-0 flex-1 overflow-y-auto">
  <h2>{queue.length === 0 ? label("noQuestions", "No questions match this scope and filter") : label("complete", "Practice complete")}</h2>
  {#if queue.length > 0}
    <div class="completion-summary">
      <span><strong>{submittedCount}</strong>{label("submitted", "Submitted")}</span>
      <span><strong>{correctCount}</strong>{label("correct", "Correct")}</span>
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

<style>
  .completion { min-height: 240px; display: grid; place-content: center; justify-items: center; gap: 16px; padding: 14px; text-align: center; }
  .completion-summary { width: min(680px, 100%); display: grid; grid-template-columns: repeat(4, minmax(90px, 1fr)); border: 1px solid var(--b3-border-color); }
  .completion-summary span { padding: 10px; border-left: 1px solid var(--b3-border-color); display: flex; flex-direction: column; color: var(--b3-theme-on-surface); font-size: 12px; }
  .completion-summary span:first-child { border-left: 0; }
  .completion-summary strong { color: var(--b3-theme-on-background); font-size: 17px; }
  .completion-review { width: min(680px, 100%); display: grid; gap: 6px; }
  .completion-review :global(button) { min-width: 0; justify-content: flex-start; overflow-wrap: anywhere; white-space: normal; text-align: left; }

  @container (max-width: 960px) {
    .completion { padding: 14px; }
    .completion-summary { grid-template-columns: repeat(2, minmax(90px, 1fr)); }
    .completion-summary span:nth-child(3) { border-left: 0; border-top: 1px solid var(--b3-border-color); }
    .completion-summary span:nth-child(4) { border-top: 1px solid var(--b3-border-color); }
  }

  @container (max-width: 430px) {
    .completion-summary { gap: 6px; }
  }
</style>
