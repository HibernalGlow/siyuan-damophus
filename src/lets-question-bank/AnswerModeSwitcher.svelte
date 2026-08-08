<script context="module" lang="ts">
  export type AnswerMode = "practice" | "composer" | "exam";
</script>

<script lang="ts">
  import { BookOpenCheck, Clock3, Layers3 } from "lucide-svelte";
  import * as ToggleGroup from "@/components/ui/toggle-group";

  export let label: (key: string, fallback: string) => string;
  export let mode: AnswerMode = "practice";
  export let onSelect: (mode: AnswerMode) => void;
</script>

<div class="answer-mode-switcher">
  <div class="answer-mode-heading">
    <strong>{label("practiceModes", "答题模式")}</strong>
    <span>{label("practiceModesDescription", "无需离开当前页面")}</span>
  </div>
  <ToggleGroup.Root
    type="single"
    variant="outline"
    class="answer-mode-group"
    aria-label={label("practiceModes", "答题模式")}
    value={mode}
    onValueChange={(value) => { if (value) onSelect(value as AnswerMode); }}
  >
    <ToggleGroup.Item value="practice" title={label("quickPractice", "快速练习")} aria-label={label("quickPractice", "快速练习")}>
      <BookOpenCheck aria-hidden="true" />
      <span>{label("quickPractice", "快速练习")}</span>
    </ToggleGroup.Item>
    <ToggleGroup.Item value="composer" title={label("questionSet", "跨文档组卷")} aria-label={label("questionSet", "跨文档组卷")}>
      <Layers3 aria-hidden="true" />
      <span>{label("questionSet", "跨文档组卷")}</span>
    </ToggleGroup.Item>
    <ToggleGroup.Item value="exam" title={label("mockExam", "模拟考试")} aria-label={label("mockExam", "模拟考试")}>
      <Clock3 aria-hidden="true" />
      <span>{label("mockExam", "模拟考试")}</span>
    </ToggleGroup.Item>
  </ToggleGroup.Root>
</div>

<style>
  .answer-mode-switcher {
    margin-top: 14px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
  }

  .answer-mode-heading {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .answer-mode-heading strong {
    font-size: 13px;
  }

  .answer-mode-heading span {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  :global(.answer-mode-group) {
    display: grid;
    grid-template-columns: repeat(3, minmax(116px, 1fr));
  }

  :global(.answer-mode-group [data-slot="toggle-group-item"]) {
    min-height: 38px;
  }

  @container (max-width: 700px) {
    .answer-mode-heading span {
      display: none;
    }

    :global(.answer-mode-group) {
      grid-template-columns: repeat(3, 42px);
    }

    :global(.answer-mode-group [data-slot="toggle-group-item"]) {
      width: 42px;
      padding: 0;
    }

    :global(.answer-mode-group [data-slot="toggle-group-item"] span) {
      display: none;
    }
  }

  @container (max-width: 430px) {
    .answer-mode-heading {
      display: none;
    }

    .answer-mode-switcher {
      justify-content: stretch;
    }

    :global(.answer-mode-group) {
      width: 100%;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    :global(.answer-mode-group [data-slot="toggle-group-item"]) {
      width: auto;
      min-height: 44px;
    }
  }
</style>
