<script lang="ts" module>
  import type { AnswerMaskStyle as MaskStyle } from "./source-answer-mask";

  export interface SourceAnswerMaskSettingsLabels {
    title: string;
    description: string;
    enabled: string;
    style: string;
    preview: string;
    answerPrefix: string;
    blur: string;
    solid: string;
    underline: string;
  }

  export interface SourceAnswerMaskSettingChange {
    key: "maskSourceAnswers" | "answerMaskStyle";
    value: boolean | MaskStyle;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Switch } from "@/components/ui/switch";
  import * as Select from "@/components/ui/select";
  import type { AnswerMaskStyle } from "./source-answer-mask";

  export let enabled = false;
  export let style: AnswerMaskStyle = "blur";
  export let labels: SourceAnswerMaskSettingsLabels;
  export let showHeading = true;

  const dispatch = createEventDispatcher<{
    changed: SourceAnswerMaskSettingChange;
    preview: SourceAnswerMaskSettingChange;
  }>();

  function updateStyle(value: string, commit: boolean): void {
    style = value as AnswerMaskStyle;
    dispatch(commit ? "changed" : "preview", { key: "answerMaskStyle", value: style });
  }
</script>

<section class="border-y border-border" aria-label={labels.title}>
  {#if showHeading}
    <div class="border-b border-border px-3 py-4">
      <div id="damophus-source-answer-mask-settings" class="text-sm font-semibold" role="heading" aria-level="3">{labels.title}</div>
      <p class="mt-1 text-xs leading-5 text-muted-foreground">{labels.description}</p>
    </div>
  {/if}

  <div class="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-5 border-b border-border px-3 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-3">
    <span class="text-sm font-medium">{labels.enabled}</span>
    <Switch
      checked={enabled}
      aria-label={labels.enabled}
      onCheckedChange={(checked) => {
        enabled = checked;
        dispatch("changed", { key: "maskSourceAnswers", value: checked });
      }}
    />
  </div>

  <div class="grid min-h-16 grid-cols-[minmax(0,1fr)_minmax(180px,auto)] items-center gap-5 border-b border-border px-3 py-3 max-[640px]:grid-cols-1 max-[640px]:gap-3">
    <label class="text-sm font-medium" for="damophus-answer-mask-style">{labels.style}</label>
    <Select.Root type="single" value={style} onValueChange={(value) => { if (value) updateStyle(value, true); }}>
      <Select.Trigger id="damophus-answer-mask-style" class="w-52 max-w-full">{style === "blur" ? labels.blur : style === "solid" ? labels.solid : labels.underline}</Select.Trigger>
      <Select.Content>
        <Select.Item value="blur" label={labels.blur} />
        <Select.Item value="solid" label={labels.solid} />
        <Select.Item value="underline" label={labels.underline} />
      </Select.Content>
    </Select.Root>
  </div>

  <div class="px-3 py-4">
    <div class="mb-3 text-xs font-medium text-muted-foreground">{labels.preview}</div>
    <div class="rounded-md border border-border bg-background px-4 py-5 text-base text-foreground">
      {labels.answerPrefix}
      <span class="answer-mask" data-preview-style={style}>A</span>
      <span aria-hidden="true">, </span>
      <span class="answer-mask" data-preview-style={style}>C</span>
    </div>
  </div>
</section>

<style>
  .answer-mask {
    display: inline-block;
    border-radius: 3px;
    cursor: pointer;
    transition: filter 120ms ease, color 120ms ease, background-color 120ms ease;
  }
  .answer-mask[data-preview-style="blur"] { filter: blur(.42em); }
  .answer-mask[data-preview-style="solid"] {
    color: transparent;
    background: var(--b3-theme-surface-lighter, color-mix(in srgb, currentColor 16%, transparent));
  }
  .answer-mask[data-preview-style="underline"] {
    color: transparent;
    background: var(--b3-theme-surface-lighter, color-mix(in srgb, currentColor 12%, transparent));
    border-bottom: 2px dotted var(--b3-theme-on-surface-light, currentColor);
  }
  .answer-mask:hover,
  .answer-mask:focus-visible {
    filter: none;
    color: inherit;
    background: transparent;
    border-color: transparent;
  }
</style>
