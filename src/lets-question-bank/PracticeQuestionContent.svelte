<script lang="ts">
  import { CheckCircle2, Star, XCircle } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { AttemptEvent, Question, QuestionBookmark, QuestionGroup, QuestionType, ShuffledOption } from "@/question-bank/core/types";
  import type { TopicResourceProjection } from "@/question-bank/adapters/siyuan";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";
  import type { DurationComparisonPosition } from "./duration-comparison-position";
  import PracticeDurationComparison from "./PracticeDurationComparison.svelte";
  import PracticeTopicResources from "./PracticeTopicResources.svelte";
  import { hideTrailingQuestionTypeMarker } from "./question-bank-display";
  import { staticContentRender } from "./static-render";

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
  export let currentBookmark: QuestionBookmark | undefined = undefined;
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
  export let showStemStyles = false;
  export let indefinitePracticeMode = false;
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
    let currentParams = params;
    Promise.resolve(mountBlock(node, params)).then((dispose) => {
      if (disposed) void dispose?.();
      else cleanup = dispose;
    });
    return {
      update(next: SourceBlockMountParams) {
        if (next.blockId === currentParams.blockId
          && next.editable === currentParams.editable
          && next.section === currentParams.section
          && next.renderMode === currentParams.renderMode) return;
        currentParams = next;
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

  function correctOptionIds(): ReadonlySet<string> {
    const answer = currentQuestion.answer;
    if (!answer) return new Set();
    if (answer.kind === "boolean") return new Set([String(answer.value)]);
    return new Set(answer.optionIds);
  }

  function optionResultClass(optionId: string): string {
    if (!revealed) return "";
    const correctIds = correctOptionIds();
    if (correctIds.has(optionId)) return "option--correct";
    return selectedOptionIds.includes(optionId) ? "option--incorrect-selected" : "";
  }

  function scrollableTables(node: HTMLElement) {
    const apply = () => {
      node.querySelectorAll<HTMLElement>('[data-type="NodeTable"].table, table').forEach((table) => {
        const tableBlock = table.matches('[data-type="NodeTable"].table');
        table.style.maxWidth = tableBlock ? "100%" : "none";
        if (tableBlock) table.style.display = "block";
        table.style.overflowX = "auto";
        table.style.overflowY = "hidden";
        table.style.overscrollBehaviorX = "contain";
        table.style.touchAction = "pan-x";
        (table.style as CSSStyleDeclaration & { webkitOverflowScrolling?: string }).webkitOverflowScrolling = "touch";
      });
    };
    const observer = new MutationObserver(apply);
    observer.observe(node, { childList: true, subtree: true });
    apply();
    return { destroy: () => observer.disconnect() };
  }

  function maskQuestionTypeMarkers(node: HTMLElement, enabled: boolean) {
    const mask = () => {
      if (!enabled) return;
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        const text = current as Text;
        text.data = hideTrailingQuestionTypeMarker(text.data);
        current = walker.nextNode();
      }
    };
    const observer = new MutationObserver(mask);
    if (enabled) observer.observe(node, { childList: true, subtree: true });
    mask();
    return {
      update(next: boolean) {
        enabled = next;
        observer.disconnect();
        if (enabled) observer.observe(node, { childList: true, subtree: true });
        mask();
      },
      destroy() {
        observer.disconnect();
      },
    };
  }

</script>

{#if questionRenderMode === "native" && currentQuestionBlockId && mountSourceBlock}
  <article class="question native-question" data-render-mode="native">
    {#if currentGroup}
      <div class="group-material">
        <strong>{label("sharedMaterial", "Shared material")}</strong>
        <div class="markdown native-content protyle-wysiwyg" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
      </div>
    {/if}
    <div class="native-question-source" class:stem-styles-hidden={!showStemStyles}>
      {#key `${currentQuestionBlockId}:${indefinitePracticeMode}`}
        <div class="source-block-host" use:maskQuestionTypeMarkers={indefinitePracticeMode} use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !sourceEditingLocked, section: "stem", renderMode: "native" }}></div>
      {/key}
    </div>
    {#if displayedOptions.length > 0}
      <div class="options native-options">
        {#each displayedOptions as option (option.originalId)}
          <Button
            variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
            class={`option ${optionResultClass(option.originalId)}`}
            disabled={revealed || readOnlyQuestion}
            aria-pressed={selectedOptionIds.includes(option.originalId)}
            onclick={() => toggleOption(option.originalId)}
          >
            <span class="option-label">{option.displayLabel}</span>
            <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
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
        <div class="markdown native-content protyle-wysiwyg" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
      </div>
    {/if}
    <div class="embedded-question-source" class:stem-styles-hidden={!showStemStyles}>
      {#key `${currentQuestionBlockId}:${indefinitePracticeMode}`}
        <div class="source-block-host" use:maskQuestionTypeMarkers={indefinitePracticeMode} use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: !sourceEditingLocked, renderMode: "embed" }}></div>
      {/key}
    </div>
    {#if displayedOptions.length > 0}
      <div class="options embedded-options">
        {#each displayedOptions as option (option.originalId)}
          <Button
            variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
            class={`option ${optionResultClass(option.originalId)}`}
            disabled={revealed || readOnlyQuestion}
            aria-pressed={selectedOptionIds.includes(option.originalId)}
            onclick={() => toggleOption(option.originalId)}
          >
            <span class="option-label">{option.displayLabel}</span>
            <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
          </Button>
        {/each}
      </div>
    {/if}
  </article>
{:else}
  <article class="question">
    <div class="question-heading">
      <div class="question-title">
        {#if !indefinitePracticeMode}
          <Badge variant="secondary" data-question-type={currentQuestion.type}>
            {questionTypeLabel(currentQuestion.type)}
          </Badge>
        {/if}
        <h2>{indefinitePracticeMode ? hideTrailingQuestionTypeMarker(currentQuestion.title) : currentQuestion.title}</h2>
      </div>
    </div>
    {#if currentGroup}
      <div class="group-material">
        <strong>{label("sharedMaterial", "Shared material")}</strong>
        <div class="markdown native-content protyle-wysiwyg" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(currentGroup.materialMarkdown, inheritSourceStyles)}</div>
      </div>
    {/if}
    <div class="markdown native-content protyle-wysiwyg stem" class:stem-styles-hidden={!showStemStyles} contenteditable="false" use:staticContentRender>{@html renderQuestionContent(indefinitePracticeMode ? hideTrailingQuestionTypeMarker(currentQuestion.stemMarkdown) : currentQuestion.stemMarkdown, inheritSourceStyles)}</div>
    {#if displayedOptions.length > 0}
      <div class="options">
        {#each displayedOptions as option (option.originalId)}
          <Button
            variant={selectedOptionIds.includes(option.originalId) ? "secondary" : "outline"}
            class={`option ${optionResultClass(option.originalId)}`}
            disabled={revealed || readOnlyQuestion}
            aria-pressed={selectedOptionIds.includes(option.originalId)}
            onclick={() => toggleOption(option.originalId)}
          >
            <span class="option-label">{option.displayLabel}</span>
            <div class="markdown native-content protyle-wysiwyg option-content" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(optionMarkdown(option), inheritSourceStyles)}</div>
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
  <section class="answer" use:scrollableTables>
    {#if objectiveCorrect !== null || (durationComparisonPosition === "answer" && durationComparisons.length > 0)}
      <div class="answer-summary">
        {#if objectiveCorrect !== null}
          <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect} data-answer-result={objectiveCorrect ? "correct" : "incorrect"}>
            {#if objectiveCorrect}<CheckCircle2 size={17} aria-hidden="true" />{:else}<XCircle size={17} aria-hidden="true" />{/if}
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
      <div class="markdown native-content protyle-wysiwyg solution" contenteditable="false" use:staticContentRender>{@html renderQuestionContent(currentQuestion.solutionMarkdown, inheritSourceStyles)}</div>
    {/if}
    {#if currentQuestion.type === "subjective"}
      <FormLabel class="mt-4 flex items-center gap-2.5">
        <span>{label("subjectiveScore", "Self score")}</span>
        <Input class="w-24" type="number" min="0" max="100" step="1" value={subjectiveScore ?? ""} disabled={readOnlyQuestion} oninput={changeSubjectiveScore} />
      </FormLabel>
    {/if}
    {#if currentBookmark && (currentBookmark.tags.length > 0 || currentBookmark.note)}
      <div class="bookmark-note-card">
        <div class="bookmark-note-header">
          <span class="bookmark-note-title">
            <Star size={14} class="fill-amber-400 text-amber-500" aria-hidden="true" />
            <strong>{label("myBookmarkNote", "我的做题批注")}</strong>
          </span>
          {#if currentBookmark.tags && currentBookmark.tags.length > 0}
            <div class="bookmark-note-tags">
              {#each currentBookmark.tags as tag}
                <Badge variant="secondary" class="text-[11px] px-1.5 py-0.5">{label(`tag_${tag}`, tag)}</Badge>
              {/each}
            </div>
          {/if}
        </div>
        {#if currentBookmark.note}
          <p class="bookmark-note-text">{currentBookmark.note}</p>
        {/if}
      </div>
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
  .question { width: 100%; margin: 0 auto; padding: 16px 14px 8px; }
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
  .stem-styles-hidden :global(strong),
  .stem-styles-hidden :global(b),
  .stem-styles-hidden :global([data-type~="strong"]) { font-weight: inherit !important; }
  .stem-styles-hidden :global(em),
  .stem-styles-hidden :global(i),
  .stem-styles-hidden :global([data-type~="em"]) { font-style: inherit !important; }
  .stem-styles-hidden :global(s),
  .stem-styles-hidden :global(del),
  .stem-styles-hidden :global(u),
  .stem-styles-hidden :global([data-type~="s"]),
  .stem-styles-hidden :global([data-type~="u"]) { text-decoration: none !important; }
  .stem-styles-hidden :global(mark),
  .stem-styles-hidden :global([data-type~="mark"]) { color: inherit !important; background: transparent !important; }
  .stem-styles-hidden :global(h1),
  .stem-styles-hidden :global(h2),
  .stem-styles-hidden :global(h3),
  .stem-styles-hidden :global(h4),
  .stem-styles-hidden :global(h5),
  .stem-styles-hidden :global(h6),
  .stem-styles-hidden :global([data-type="NodeHeading"]) {
    font-weight: inherit !important;
    letter-spacing: 0 !important;
  }
  .stem-styles-hidden :global([style]) {
    color: inherit !important;
    background-color: transparent !important;
    font-family: inherit !important;
    font-style: inherit !important;
    font-weight: inherit !important;
    letter-spacing: 0 !important;
    text-decoration: none !important;
  }
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
    padding: 0 !important;
    overflow: visible;
  }
  .options { width: 100%; margin: 16px 0 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; }
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
  .options > :global(button.option:active) { transform: none; }
  .options > :global(button.option.option--correct) {
    border-color: color-mix(in srgb, var(--b3-theme-success) 76%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-success) 13%, var(--b3-theme-background));
    animation: damophus-option-correct 560ms ease-out both;
  }
  .options > :global(button.option.option--incorrect-selected) {
    border-color: color-mix(in srgb, var(--b3-theme-error) 76%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-error) 11%, var(--b3-theme-background));
    animation: damophus-option-incorrect 420ms ease-out both;
  }
  :global(.options > button.option.option--correct) .option-label {
    border-color: var(--b3-theme-success);
    background: var(--b3-theme-success);
    color: var(--b3-theme-on-success, #fff);
  }
  :global(.options > button.option.option--incorrect-selected) .option-label {
    border-color: var(--b3-theme-error);
    background: var(--b3-theme-error);
    color: var(--b3-theme-on-error, #fff);
  }
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
  .answer { width: 100%; margin: 16px auto 0; padding: 18px 14px 24px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .correct { color: var(--b3-theme-success); font-size: 13px; }
  .incorrect { color: var(--b3-theme-error); }
  .answer-summary { display: flex; align-items: center; gap: 8px; overflow-x: auto; scrollbar-width: none; }
  .answer-summary::-webkit-scrollbar { display: none; }
  .answer-summary > strong { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .answer-summary > strong[data-answer-result="correct"] { animation: damophus-answer-correct 620ms ease-out both; }
  .answer-summary > strong[data-answer-result="incorrect"] { animation: damophus-answer-incorrect 420ms ease-out both; }
  .native-answer-source, .embedded-answer-source { margin-top: 12px; min-height: 0; overflow: visible; }
  .native-answer-source :global(.damophus-native-source-block),
  .embedded-answer-source :global(.damophus-native-source-block) { min-height: 0; margin: 0; overflow: visible; }
  .native-answer-source :global(.damophus-native-source-block + .damophus-native-source-block),
  .embedded-answer-source :global(.damophus-native-source-block + .damophus-native-source-block) { margin-top: 0; }
  .native-answer-source :global(.damophus-native-source-block > .protyle),
  .native-answer-source :global(.damophus-native-source-block .protyle-content),
  .embedded-answer-source :global(.damophus-native-source-block > .protyle),
  .embedded-answer-source :global(.damophus-native-source-block .protyle-content) {
    height: auto;
    min-height: 0;
    overflow: visible;
  }
  .native-answer-source :global(.damophus-native-source-block .protyle-wysiwyg),
  .embedded-answer-source :global(.damophus-native-source-block .protyle-wysiwyg) {
    min-height: 0;
    padding: 0 !important;
    overflow: visible;
  }
  :global(.native-answer-source [data-type="NodeTable"].table),
  :global(.embedded-answer-source [data-type="NodeTable"].table),
  :global(.solution [data-type="NodeTable"].table),
  :global(.solution table) {
    max-width: 100%;
    overflow-x: auto !important;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
    -webkit-overflow-scrolling: touch;
  }
  :global(.native-answer-source [data-type="NodeTable"].table table),
  :global(.embedded-answer-source [data-type="NodeTable"].table table) { max-width: none !important; }
  :global([data-type="NodeTable"].table) {
    max-width: 100%;
    overflow-x: auto !important;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    touch-action: pan-x;
    -webkit-overflow-scrolling: touch;
  }
  :global([data-type="NodeTable"].table > div:first-child) {
    max-width: 100%;
    overflow-x: auto !important;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .attempt-metadata { margin-top: 14px; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--b3-theme-on-surface); font-size: 12px; }

  @keyframes damophus-option-correct {
    0% { transform: scale(0.985); box-shadow: 0 0 0 0 color-mix(in srgb, var(--b3-theme-success) 30%, transparent); }
    55% { transform: scale(1.006); box-shadow: 0 0 0 4px color-mix(in srgb, var(--b3-theme-success) 12%, transparent); }
    100% { transform: scale(1); box-shadow: none; }
  }
  @keyframes damophus-option-incorrect {
    0%, 100% { transform: translateX(0); }
    28% { transform: translateX(-4px); }
    56% { transform: translateX(3px); }
    78% { transform: translateX(-1px); }
  }
  @keyframes damophus-answer-correct {
    0% { opacity: 0; transform: translateY(3px) scale(0.96); }
    60% { opacity: 1; transform: translateY(0) scale(1.04); }
    100% { transform: scale(1); }
  }
  @keyframes damophus-answer-incorrect {
    0% { opacity: 0; transform: translateX(-3px); }
    100% { opacity: 1; transform: translateX(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .options > :global(button.option.option--correct),
    .options > :global(button.option.option--incorrect-selected),
    .answer-summary > strong[data-answer-result] { animation: none; }
  }

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
    .native-answer-source :global(.protyle-scroll),
    .embedded-answer-source :global(.protyle-scroll) { display: none !important; }
    .source-block-host :global(.damophus-native-source-block > .protyle),
    .source-block-host :global(.damophus-native-source-block .protyle-content),
    .source-block-host :global(.damophus-native-source-block .protyle-wysiwyg),
    .native-answer-source :global(.damophus-native-source-block > .protyle),
    .native-answer-source :global(.damophus-native-source-block .protyle-content),
    .native-answer-source :global(.damophus-native-source-block .protyle-wysiwyg),
    .embedded-answer-source :global(.damophus-native-source-block > .protyle),
    .embedded-answer-source :global(.damophus-native-source-block .protyle-content),
    .embedded-answer-source :global(.damophus-native-source-block .protyle-wysiwyg) {
      width: 100% !important;
      max-width: none !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
  }

  .bookmark-note-card {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 30%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 6%, var(--b3-theme-surface));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .bookmark-note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .bookmark-note-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--b3-theme-on-surface);
  }

  .bookmark-note-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .bookmark-note-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--b3-theme-on-background);
    white-space: pre-wrap;
  }
</style>
