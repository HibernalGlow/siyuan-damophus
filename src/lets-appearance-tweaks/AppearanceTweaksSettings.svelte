<script lang="ts" module>
  export interface AppearanceTweaksSettingsLabels {
    preview: string;
    previewDescription: string;
    sampleText: string;
    sampleTag: string;
    sampleReference: string;
    sampleSubReference: string;
    refCount: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import SettingPanel from "@/libs/setting-panel.svelte";
  import LiveStylePreview from "@/components/live-style-preview.svelte";
  import { mergeLivePreviewValues, updateLivePreviewOverride } from "@/libs/live-style-preview";
  import { resolveAppearanceTweaksSettings, resolvePreviewEditorFontSize } from "./appearance-tweaks";

  export let group: string;
  export let title: string;
  export let settingItems: ISettingItem[] = [];
  export let labels: AppearanceTweaksSettingsLabels;
  export let mobile = false;

  const dispatch = createEventDispatcher();
  let previewOverrides: Record<string, unknown> = {};

  function update(event: CustomEvent<{ key: string; value: unknown }>, persisted: boolean): void {
    previewOverrides = updateLivePreviewOverride(previewOverrides, event.detail);
    dispatch(persisted ? "changed" : "preview", event.detail);
  }

  $: appearance = resolveAppearanceTweaksSettings(mergeLivePreviewValues(settingItems, previewOverrides));
  $: previewEditorFontSize = resolvePreviewEditorFontSize(appearance, mobile);
  $: variables = [
    `--preview-tag-font-size:${appearance.tagFontSize}%`,
    `--preview-tag-radius:${appearance.tagRadius}px`,
    `--preview-tag-padding-x:${appearance.tagPaddingX}px`,
    `--preview-tag-padding-bottom:${appearance.tagPaddingBottom}px`,
    `--preview-tag-background:var(--b3-font-background${appearance.tagColor})`,
    `--preview-reference-font-size:${appearance.referenceFontSize}%`,
    `--preview-reference-radius:${appearance.referenceRadius}px`,
    `--preview-reference-padding-x:${appearance.referencePaddingX}px`,
    `--preview-reference-padding-y:${appearance.referencePaddingY}px`,
    `--preview-editor-font-size:${previewEditorFontSize}px`,
  ].join(";");
</script>

<section class="appearance-tweaks-settings min-w-0" aria-label={title}>
  <header class="border-b border-border pb-4"><div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div></header>
  <LiveStylePreview title={labels.preview} description={labels.previewDescription} contentClass="protyle-wysiwyg">
    <div class="appearance-preview" class:accent-reference={appearance.referenceColorMode === "accent"} style={variables} data-appearance-tweaks-preview>
      <div class="preview-line" data-node-id="preview-paragraph">
        <span>{labels.sampleText}</span>
        {#if appearance.tags}<span class="preview-tag" data-type="tag">{labels.sampleTag}</span>{/if}
        {#if appearance.references}<span class="preview-reference" data-type="block-ref sup">{labels.sampleReference}</span>{/if}
        {#if appearance.references}<span class="preview-reference" data-type="block-ref sub">{labels.sampleSubReference}</span>{/if}
      </div>
      {#if appearance.references}<span class="protyle-attr--refcount">{labels.refCount}</span>{/if}
    </div>
  </LiveStylePreview>
  <SettingPanel {group} {settingItems} {mobile} on:changed={(event) => update(event, true)} on:preview={(event) => update(event, false)} />
</section>

<style>
  .preview-line { display: flex; min-height: 36px; flex-wrap: wrap; align-items: baseline; gap: 10px; color: var(--b3-theme-on-background); font-size: var(--preview-editor-font-size); }
  .preview-tag { font-size: var(--preview-tag-font-size); border-radius: var(--preview-tag-radius); padding: 0 var(--preview-tag-padding-x) var(--preview-tag-padding-bottom); color: var(--b3-theme-on-background); background: var(--preview-tag-background); }
  .preview-tag::before { content: "#"; }
  .preview-reference { font-size: var(--preview-reference-font-size); border-radius: var(--preview-reference-radius); padding: var(--preview-reference-padding-y) var(--preview-reference-padding-x); color: var(--b3-theme-background); background: var(--b3-theme-on-background); }
  .accent-reference .preview-reference { color: var(--b3-theme-on-primary); background: var(--b3-theme-primary); }
  .protyle-attr--refcount { display: inline-block; margin-top: 12px; padding: 2px 6px; border-radius: 4px; background: var(--b3-theme-surface); color: var(--b3-theme-on-surface); font-size: 12px; }
</style>
