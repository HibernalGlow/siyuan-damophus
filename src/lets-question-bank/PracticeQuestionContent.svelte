<script lang="ts">
  import { ArrowDown, ArrowUp, Edit3, ExternalLink, Minus } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { AttemptEvent, Question, QuestionGroup, QuestionType, ShuffledOption } from "@/question-bank/core/types";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";

  type Label = (key: string, fallback: string) => string;
  type RenderMarkdown = (markdown: string, inheritStyles: boolean) => string;
  type MountSourceBlock = (
    target: HTMLElement,
    blockId: string,
    editable: boolean,
    section?: "stem" | "solution",
    renderMode?: "native" | "embed",
  ) => (() => void) | Promise<() => void>;

  export let label: Label;
  export let currentQuestion: Question;
  export let currentGroup: QuestionGroup | undefined = undefined;
  export let currentQuestionBlockId: string | undefined = undefined;
  export let displayedOptions: ShuffledOption[] = [];
  export let selectedOptionIds: string[] = [];
  export let revealed = false;
  export let readOnlyQuestion = false;
  export let objectiveCorrect: boolean | null = null;
  export let subjectiveScore: number | undefined = undefined;
  export let currentAttempt: AttemptEvent | undefined = undefined;
  export let durationComparisons: AttemptDurationComparison[] = [];
  export let inheritSourceStyles = true;
  export let questionRenderMode: "html" | "native" | "embed" = "native";
  export let openQuestionSource: ((blockId: string) => void) | undefined = undefined;
  export let renderQuestionContent: RenderMarkdown;
  export let mountSourceBlock: MountSourceBlock | undefined = undefined;
  export let questionTypeLabel: (type: QuestionType) => string;
  export let optionMarkdown: (option: ShuffledOption) => string;
  export let formatDuration: (milliseconds: number) => string;
  export let toggleOption: (optionId: string) => void;
  export let changeSubjectiveScore: (event: Event) => void;
  export let correctAnswer: (() => void) | undefined = undefined;

  type SourceBlockMountParams = {
    blockId: string;
    editable: boolean;
    section?: "stem" | "solution";
    renderMode: "native" | "embed";
  };

  function mountBlock(node: HTMLElement, params: SourceBlockMountParams) {
    return mountSourceBlock?.(
      node,
      params.blockId,
      params.editable,
      params.section,
      params.renderMode,
    );
  }

  function sourceBlockMount(node: HTMLElement, params: SourceBlockMountParams) {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    Promise.resolve(mountBlock(node, params)).then((dispose) => {
      if (disposed) void dispose?.();
      else cleanup = dispose;
    });
    return {
      update(next: SourceBlockMountParams) {
        disposed = true;
        void cleanup?.();
        disposed = false;
        Promise.resolve(mountBlock(node, next)).then((dispose) => {
          if (disposed) void dispose?.();
          else cleanup = dispose;
        });
      },
      destroy() {
        disposed = true;
        void cleanup?.();
      },
    };
  }

  function durationComparisonText(item: AttemptDurationComparison): string {
    if (item.benchmark === "previous") {
      if (item.direction === "faster") return `${label("fasterThanPrevious", "Faster than last time by")} ${formatDuration(item.deltaMs)}`;
      if (item.direction === "slower") return `${label("slowerThanPrevious", "Slower than last time by")} ${formatDuration(item.deltaMs)}`;
      return label("sameAsPrevious", "Same time as last attempt");
    }
    if (item.direction === "faster") return `${label("fasterThanAverage", "Faster than historical average by")} ${formatDuration(item.deltaMs)}`;
    if (item.direction === "slower") return `${label("slowerThanAverage", "Slower than historical average by")} ${formatDuration(item.deltaMs)}`;
    return label("sameAsAverage", "Same as historical average");
  }
</script>

{#if questionRenderMode === "native" && currentQuestionBlockId && mountSourceBlock}
  <article class="question native-question" data-render-mode="native">
    {#if currentGroup}
      <div class="group-material">
        <strong>{label("sharedMaterial", "Shared material")}</strong>
        <div class="markdown native-content protyle-wysiwyg" contenteditable="false">{@html renderQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
      </div>
    {/if}
    <div class="native-question-source">
      {#key currentQuestionBlockId}
        <div class="source-block-host" use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !readOnlyQuestion, section: "stem", renderMode: "native" }}></div>
      {/key}
    </div>
    {#if displayedOptions.length > 0}
      <div class="options native-options">
        {#each displayedOptions as option (option.originalId)}
          <Button
            variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
            class="option"
            disabled={revealed || readOnlyQuestion}
            aria-pressed={selectedOptionIds.includes(option.originalId)}
            onclick={() => toggleOption(option.originalId)}
          >
            <span class="option-label">{option.displayLabel}</span>
            <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false">{@html renderQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
          </Button>
        {/each}
      </div>
    {/if}
  </article>
{:else if questionRenderMode === "embed" && currentQuestionBlockId && mountSourceBlock}
  <article class="question embedded-question" data-render-mode="embed">
    {#if currentGroup}
      <div class="group-material">
        <strong>{label("sharedMaterial", "Shared material")}</strong>
        <div class="markdown native-content protyle-wysiwyg" contenteditable="false">{@html renderQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
      </div>
    {/if}
    <div class="embedded-question-source">
      {#key currentQuestionBlockId}
        <div class="source-block-host" use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: true, renderMode: "embed" }}></div>
      {/key}
    </div>
    {#if displayedOptions.length > 0}
      <div class="options embedded-options">
        {#each displayedOptions as option (option.originalId)}
          <Button
            variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
            class="option"
            disabled={revealed || readOnlyQuestion}
            aria-pressed={selectedOptionIds.includes(option.originalId)}
            onclick={() => toggleOption(option.originalId)}
          >
            <span class="option-label">{option.displayLabel}</span>
            <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false">{@html renderQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
          </Button>
        {/each}
      </div>
    {/if}
  </article>
{:else}
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
          title={label("editSource", "Edit source block in SiYuan")}
          aria-label={label("editSource", "Edit source block in SiYuan")}
          onclick={() => openQuestionSource?.(currentQuestionBlockId as string)}
        >
          <ExternalLink aria-hidden="true" />
        </Button>
      {/if}
    </div>
    {#if currentGroup}
      <div class="group-material">
        <strong>{label("sharedMaterial", "Shared material")}</strong>
        <div class="markdown native-content protyle-wysiwyg" contenteditable="false">{@html renderQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
      </div>
    {/if}
    <div class="markdown native-content protyle-wysiwyg stem" contenteditable="false">{@html renderQuestionContent(currentQuestion.stemMarkdown, inheritSourceStyles)}</div>
    {#if displayedOptions.length > 0}
      <div class="options">
        {#each displayedOptions as option (option.originalId)}
          <Button
            variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
            class="option"
            disabled={revealed || readOnlyQuestion}
            aria-pressed={selectedOptionIds.includes(option.originalId)}
            onclick={() => toggleOption(option.originalId)}
          >
            <span class="option-label">{option.displayLabel}</span>
            <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false">{@html renderQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
          </Button>
        {/each}
      </div>
    {/if}
  </article>
{/if}

{#if revealed}
  <section class="answer">
    {#if objectiveCorrect !== null}
      <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect}>
        {objectiveCorrect ? label("correct", "Correct") : label("incorrect", "Incorrect")}
      </strong>
    {/if}
    {#if durationComparisons.length > 0}
      <div class="duration-comparisons" aria-label={label("durationComparison", "Answer time comparison")}>
        {#each durationComparisons as item (item.benchmark)}
          <span class="duration-comparison" class:faster={item.direction === "faster"} class:slower={item.direction === "slower"} class:same={item.direction === "same"} data-benchmark={item.benchmark}>
            {#if item.direction === "faster"}
              <ArrowDown size={14} aria-hidden="true" />
            {:else if item.direction === "slower"}
              <ArrowUp size={14} aria-hidden="true" />
            {:else}
              <Minus size={14} aria-hidden="true" />
            {/if}
            {durationComparisonText(item)}
          </span>
        {/each}
      </div>
    {/if}
    {#if questionRenderMode === "native" && currentQuestionBlockId && mountSourceBlock}
      <div class="native-answer-source" data-render-mode="native">
        {#key `${currentQuestionBlockId}:${questionRenderMode}`}
          <div use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !readOnlyQuestion, section: "solution", renderMode: "native" }}></div>
        {/key}
      </div>
    {:else if questionRenderMode === "embed" && currentQuestionBlockId && mountSourceBlock}
      <div class="embedded-answer-source" data-render-mode="embed">
        {#key `${currentQuestionBlockId}:${questionRenderMode}:solution`}
          <div use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: true, section: "solution", renderMode: "embed" }}></div>
        {/key}
      </div>
    {:else}
      <div class="markdown native-content protyle-wysiwyg solution" contenteditable="false">{@html renderQuestionContent(currentQuestion.solutionMarkdown, inheritSourceStyles)}</div>
    {/if}
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
    {#if currentQuestion.answer && correctAnswer && !readOnlyQuestion}
      <Button variant="outline" size="sm" class="mt-3" onclick={correctAnswer}>
        <Edit3 size={14} aria-hidden="true" />
        {label("correctAnswer", "Correct answer")}
      </Button>
    {/if}
  </section>
{/if}

<style>
  .question { width: 100%; margin: 0 auto; padding: 24px 22px 8px; }
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
  .embedded-question, .native-question { padding-top: 12px; }
  .embedded-question-source, .native-question-source, .source-block-host { min-height: 0; overflow: visible; }
  .source-block-host :global(.damophus-native-source-block) { min-height: 0; margin: 0; overflow: visible; }
  .source-block-host :global(.damophus-native-source-block + .damophus-native-source-block) { margin-top: 0; }
  .source-block-host :global(.damophus-native-source-block > .protyle),
  .source-block-host :global(.damophus-native-source-block .protyle-content) {
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .source-block-host :global(.damophus-native-source-block .protyle-wysiwyg) {
    min-height: 0;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    overflow: visible;
  }
  .options { width: 100%; max-width: 1180px; margin: 18px auto 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .options > :global(button.option) {
    min-width: 0;
    min-height: 38px;
    height: auto;
    padding: 6px 10px;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: start;
    justify-content: initial;
    gap: 8px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color) 78%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--b3-theme-surface) 64%, var(--b3-theme-background));
    color: var(--b3-theme-on-background);
    text-align: left;
    white-space: normal;
    overflow: visible;
  }
  .options > :global(button.option:hover:not(:disabled)) {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 62%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
  }
  .options > :global(button.option[aria-pressed="true"]) {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 72%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 14%, var(--b3-theme-background));
  }
  .options > :global(button.option:focus-visible) {
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 72%, transparent);
    outline-offset: 1px;
  }
  .options > :global(button.option:disabled) { cursor: default; }
  .option-label { width: 22px; height: 22px; margin-top: 1px; border: 1px solid color-mix(in srgb, var(--b3-border-color) 90%, transparent); border-radius: 5px; display: grid; place-items: center; color: var(--b3-theme-on-surface); font-size: 12px; font-weight: 650; line-height: 1; }
  :global(.options > button.option[aria-pressed="true"]) .option-label { border-color: var(--b3-theme-primary); background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); }
  .option-content { align-self: start; width: 100%; min-width: 0; line-height: 1.45; }
  .option-content :global(p) { margin: 0 !important; }
  .answer { width: 100%; margin: 16px auto 0; padding: 18px 22px 24px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .correct { color: var(--b3-theme-success); font-size: 13px; }
  .incorrect { color: var(--b3-theme-error); }
  .duration-comparisons { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 7px; }
  .duration-comparison { min-height: 26px; padding: 4px 7px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--b3-border-color); border-radius: 5px; color: var(--b3-theme-on-surface); font-size: 12px; font-weight: 600; line-height: 1.25; }
  .duration-comparison.faster { border-color: color-mix(in srgb, var(--b3-theme-success) 42%, var(--b3-border-color)); background: color-mix(in srgb, var(--b3-theme-success) 10%, transparent); color: var(--b3-theme-success); }
  .duration-comparison.slower { border-color: color-mix(in srgb, var(--b3-theme-error) 42%, var(--b3-border-color)); background: color-mix(in srgb, var(--b3-theme-error) 9%, transparent); color: var(--b3-theme-error); }
  .native-answer-source { margin-top: 12px; min-height: 0; overflow: visible; }
  .native-answer-source :global(.damophus-native-source-block) { min-height: 0; margin: 0; overflow: visible; }
  .native-answer-source :global(.damophus-native-source-block + .damophus-native-source-block) { margin-top: 0; }
  .native-answer-source :global(.damophus-native-source-block > .protyle),
  .native-answer-source :global(.damophus-native-source-block .protyle-content) {
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .native-answer-source :global(.damophus-native-source-block .protyle-wysiwyg) {
    min-height: 0;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    overflow: visible;
  }
  .attempt-metadata { margin-top: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }

  @container (max-width: 960px) {
    .question { padding: 12px 14px 6px; }
    .question-heading { gap: 8px; }
    .question-title { gap: 6px; }
    .question-heading h2 { font-size: 16px; }
    .stem { margin-top: 8px; line-height: 1.65; }
    .stem > :global([data-node-id]),
    .group-material .native-content > :global([data-node-id]) {
      margin-block: 0 10px !important;
      padding-left: 8px !important;
      padding-right: 0 !important;
    }
    .group-material { margin-top: 10px; padding-block: 9px; }
    .options { margin-top: 12px; gap: 7px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .options > :global(button.option) { padding: 6px 9px; }
    .answer { margin-top: 10px; padding: 14px 14px 18px; }
  }

  @container (max-width: 760px) {
    .question { padding: 12px 12px 6px; }
    .question-heading { gap: 8px; }
    .question-title { gap: 6px; }
    .question-heading h2 { font-size: 16px; }
    .stem { margin-top: 8px; line-height: 1.65; }
    .group-material { margin-top: 10px; padding-block: 9px; }
    .options { margin-top: 12px; gap: 7px; }
    .option-label { width: 22px; height: 22px; border-radius: 5px; }
  }

  @container (max-width: 560px) {
    .options { grid-template-columns: 1fr; }
  }

  @media (max-width: 750px) {
    .source-block-host :global(.protyle-gutters),
    .source-block-host :global(.protyle-scroll),
    .native-answer-source :global(.protyle-gutters),
    .native-answer-source :global(.protyle-scroll) { display: none !important; }
  }
</style>
