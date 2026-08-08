<script lang="ts">
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { AttemptEvent, Question, QuestionGroup, QuestionType, ShuffledOption } from "@/question-bank/core/types";
  import type { TopicResourceProjection } from "@/question-bank/adapters/siyuan";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";
  import type { DurationComparisonPosition } from "./duration-comparison-position";
  import PracticeDurationComparison from "./PracticeDurationComparison.svelte";
  import PracticeTopicResources from "./PracticeTopicResources.svelte";

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
  export let topicResources: TopicResourceProjection[] = [];
  export let persistTopicResource: ((projection: TopicResourceProjection) => void) | undefined = undefined;
  export let persistingTopicResourceIdentity = "";
  export let persistedTopicResourceIdentities: ReadonlySet<string> = new Set();
  export let durationComparisons: AttemptDurationComparison[] = [];
  export let durationComparisonPosition: DurationComparisonPosition = "rating";
  export let inheritSourceStyles = true;
  export let questionRenderMode: "html" | "native" | "embed" = "native";
  export let sourceEditingLocked = false;
  export let renderQuestionContent: RenderMarkdown;
  export let mountSourceBlock: MountSourceBlock | undefined = undefined;
  export let questionTypeLabel: (type: QuestionType) => string;
  export let optionMarkdown: (option: ShuffledOption) => string;
  export let formatDuration: (milliseconds: number) => string;
  export let toggleOption: (optionId: string) => void;
  export let changeSubjectiveScore: (event: Event) => void;

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
        <div class="source-block-host" use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !sourceEditingLocked, section: "stem", renderMode: "native" }}></div>
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
        <div class="source-block-host" use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !sourceEditingLocked, renderMode: "embed" }}></div>
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

<PracticeTopicResources
  resources={topicResources}
  {label}
  persistResource={persistTopicResource}
  persistingIdentity={persistingTopicResourceIdentity}
  persistedIdentities={persistedTopicResourceIdentities}
/>

{#if revealed}
  <section class="answer">
    {#if objectiveCorrect !== null || (durationComparisonPosition === "answer" && durationComparisons.length > 0)}
      <div class="answer-summary">
        {#if objectiveCorrect !== null}
          <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect}>
            {objectiveCorrect ? label("correct", "Correct") : label("incorrect", "Incorrect")}
          </strong>
        {/if}
        {#if durationComparisonPosition === "answer"}
          <PracticeDurationComparison comparisons={durationComparisons} {label} {formatDuration} />
        {/if}
      </div>
    {/if}
    {#if questionRenderMode === "native" && currentQuestionBlockId && mountSourceBlock}
      <div class="native-answer-source" data-render-mode="native">
        {#key `${currentQuestionBlockId}:${questionRenderMode}`}
          <div use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !sourceEditingLocked, section: "solution", renderMode: "native" }}></div>
        {/key}
      </div>
    {:else if questionRenderMode === "embed" && currentQuestionBlockId && mountSourceBlock}
      <div class="embedded-answer-source" data-render-mode="embed">
        {#key `${currentQuestionBlockId}:${questionRenderMode}:solution`}
          <div use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !sourceEditingLocked, section: "solution", renderMode: "embed" }}></div>
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
  .options { width: 100%; max-width: 980px; margin: 16px auto 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; }
  .options > :global(button.option) {
    min-width: 0;
    min-height: 36px;
    height: auto;
    align-self: start;
    padding: 5px 8px;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: center;
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
  .option-label { width: 22px; height: 22px; border: 1px solid color-mix(in srgb, var(--b3-border-color) 90%, transparent); border-radius: 5px; display: grid; place-items: center; color: var(--b3-theme-on-surface); font-size: 12px; font-weight: 650; line-height: 1; }
  :global(.options > button.option[aria-pressed="true"]) .option-label { border-color: var(--b3-theme-primary); background: var(--b3-theme-primary); color: var(--b3-theme-on-primary); }
  .option-content { align-self: center; width: 100%; min-width: 0; line-height: 1.4; }
  .option-content :global(p) { margin: 0 !important; }
  .option-content :global([data-node-id]) {
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1.4 !important;
  }
  .answer { width: 100%; margin: 16px auto 0; padding: 18px 22px 24px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .correct { color: var(--b3-theme-success); font-size: 13px; }
  .incorrect { color: var(--b3-theme-error); }
  .answer-summary { display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; }
  .answer-summary::-webkit-scrollbar { display: none; }
  .answer-summary > strong { flex: 0 0 auto; white-space: nowrap; }
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
    .options { margin-top: 12px; gap: 7px; }
    .options > :global(button.option) { padding: 5px 8px; }
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

  @media (max-height: 620px) {
    .options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @media (max-height: 480px) {
    .options { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  }

  @container (max-width: 560px) {
    .options { grid-template-columns: 1fr; }
  }

  @media (max-width: 750px) {
    .source-block-host :global(.protyle-scroll),
    .native-answer-source :global(.protyle-scroll) { display: none !important; }
    .source-block-host :global(.damophus-native-source-block > .protyle),
    .source-block-host :global(.damophus-native-source-block .protyle-content),
    .source-block-host :global(.damophus-native-source-block .protyle-wysiwyg),
    .native-answer-source :global(.damophus-native-source-block > .protyle),
    .native-answer-source :global(.damophus-native-source-block .protyle-content),
    .native-answer-source :global(.damophus-native-source-block .protyle-wysiwyg) {
      width: 100% !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
  }
</style>
