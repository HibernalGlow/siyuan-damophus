<script lang="ts">
  import { ExternalLink } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label as FormLabel } from "@/components/ui/label";
  import type { AttemptEvent, Question, QuestionGroup, QuestionType, ShuffledOption } from "@/question-bank/core/types";

  type Label = (key: string, fallback: string) => string;
  type RenderMarkdown = (markdown: string, inheritStyles: boolean) => string;
  type MountSourceBlock = (
    target: HTMLElement,
    blockId: string,
    editable: boolean,
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

  function sourceBlockMount(node: HTMLElement, params: { blockId: string; editable: boolean }) {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    Promise.resolve(mountSourceBlock?.(node, params.blockId, params.editable)).then((dispose) => {
      if (disposed) void dispose?.();
      else cleanup = dispose;
    });
    return {
      update(next: { blockId: string; editable: boolean }) {
        disposed = true;
        void cleanup?.();
        disposed = false;
        Promise.resolve(mountSourceBlock?.(node, next.blockId, next.editable)).then((dispose) => {
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
          class="option grid h-auto min-h-12 w-full grid-cols-[30px_minmax(0,1fr)] items-start justify-start gap-2 whitespace-normal px-3 py-2 text-left"
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

{#if revealed}
  <section class="answer">
    {#if objectiveCorrect !== null}
      <strong class:correct={objectiveCorrect} class:incorrect={!objectiveCorrect}>
        {objectiveCorrect ? label("correct", "Correct") : label("incorrect", "Incorrect")}
      </strong>
    {/if}
    {#if questionRenderMode !== "html" && currentQuestionBlockId && mountSourceBlock}
      <div class="native-answer-source" data-render-mode={questionRenderMode}>
        <div class="native-answer-source__label">
          {questionRenderMode === "embed"
            ? label("editableSourceBlock", "Editable source block")
            : label("nativeSourceBlock", "Native source block")}
        </div>
        {#key `${currentQuestionBlockId}:${questionRenderMode}`}
          <div use:sourceBlockMount={{ blockId: currentQuestionBlockId, editable: questionRenderMode === "embed" }}></div>
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
  .question { max-width: 920px; margin: 0 auto; padding: 24px 22px 8px; }
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
  .options { margin-top: 18px; display: grid; gap: 8px; }
  .option-label { width: 26px; height: 26px; border: 1px solid var(--b3-border-color); border-radius: 50%; display: grid; place-items: center; font-weight: 600; }
  .option-content { align-self: center; width: 100%; }
  .answer { max-width: 920px; margin: 16px auto 0; padding: 18px 22px 24px; border-top: 1px solid var(--b3-border-color); }
  .solution { margin-top: 12px; line-height: 1.7; }
  .correct { color: var(--b3-theme-success); font-size: 13px; }
  .incorrect { color: var(--b3-theme-error); }
  .native-answer-source { margin-top: 12px; min-height: 120px; border: 1px solid var(--b3-border-color); padding: 8px 12px; overflow: auto; }
  .native-answer-source__label { margin-bottom: 6px; color: var(--b3-theme-on-surface); font-size: 12px; }
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
    .options > :global(button.option) { padding: 7px 10px; }
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
    .option-label { width: 30px; height: 30px; border-radius: 6px; }
  }
</style>
