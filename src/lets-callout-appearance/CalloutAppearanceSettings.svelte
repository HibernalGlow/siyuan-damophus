<script lang="ts" module>
  export interface CalloutAppearanceSettingsLabels {
    preview: string;
    previewDescription: string;
    outerTitle: string;
    outerBody: string;
    nestedTitle: string;
    nestedBody: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ChevronDown, Lightbulb, MessageSquareText } from "lucide-svelte";
  import SettingPanel from "@/libs/setting-panel.svelte";
  import LiveStylePreview from "@/components/live-style-preview.svelte";
  import { mergeLivePreviewValues, updateLivePreviewOverride } from "@/libs/live-style-preview";
  import {
    resolveCalloutAppearanceSettings,
  } from "./callout-appearance";

  export let group: string;
  export let title: string;
  export let moduleSettingItems: ISettingItem[] = [];
  export let settingItems: ISettingItem[] = [];
  export let labels: CalloutAppearanceSettingsLabels;
  export let mobile = false;

  // Kept in the component contract so the commented detail switch can be restored directly.
  void moduleSettingItems;

  const dispatch = createEventDispatcher();
  let previewOverrides: Record<string, unknown> = {};

  function updatePreview(event: CustomEvent<{ key: string; value: unknown }>): void {
    previewOverrides = updateLivePreviewOverride(previewOverrides, event.detail);
    dispatch("preview", event.detail);
  }

  function handleSettingChanged(event: CustomEvent<{ key: string; value: unknown }>): void {
    previewOverrides = updateLivePreviewOverride(previewOverrides, event.detail);
    dispatch("changed", event.detail);
  }

  $: appearance = resolveCalloutAppearanceSettings(mergeLivePreviewValues(settingItems, previewOverrides));
  $: previewVariables = [
    `--preview-padding-top: ${appearance.paddingTop}px`,
    `--preview-padding-x: ${appearance.paddingX}px`,
    `--preview-padding-bottom: ${appearance.paddingBottom}px`,
    `--preview-radius: ${appearance.radius}px`,
    `--preview-surface-opacity: ${appearance.surfaceOpacity}%`,
    `--preview-outline-opacity: ${appearance.outlineOpacity}%`,
    `--preview-title-size: ${appearance.titleSize}px`,
    `--preview-title-weight: ${appearance.titleWeight}`,
  ].join("; ");
</script>

<section class="callout-appearance-settings min-w-0" class:mobile aria-label={title}>
  <header class="border-b border-border pb-4">
    <div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div>
  </header>

  <!--
    Module enable controls are managed from the settings overview.
    Uncomment this panel to restore the enable switch inside plugin details.
  <SettingPanel
    {group}
    settingItems={moduleSettingItems}
    {mobile}
    on:changed={(event) => dispatch("changed", event.detail)}
  />
  -->

  <LiveStylePreview title={labels.preview} description={labels.previewDescription} contentClass="b3-typography">
    <div
      class="damophus-callout-appearance-preview min-w-0 overflow-hidden"
      class:follow-callout-text-color={appearance.followCalloutTextColor}
      data-callout-appearance-preview
      style={previewVariables}
    >
      <div class="callout" data-type="NodeCallout" data-subtype="IMPORTANT">
        <div class="callout-info">
          <span class="callout-icon"><MessageSquareText aria-hidden="true" /></span>
          <span class="callout-title">{labels.outerTitle}</span>
          <ChevronDown class="callout-preview-fold" aria-hidden="true" />
        </div>
        <div class="callout-content">
          <div class="list" data-node-id="preview-list" data-type="NodeList">
            <div class="li" data-node-id="preview-item" data-type="NodeListItem">
              <div class="protyle-action" aria-hidden="true">1.</div>
              <div class="p" data-node-id="preview-paragraph" data-type="NodeParagraph">
                <div>{labels.outerBody}</div>
              </div>
              <div class="callout" data-node-id="preview-callout" data-type="NodeCallout" data-subtype="TIP">
                <div class="callout-info">
                  <span class="callout-icon"><Lightbulb aria-hidden="true" /></span>
                  <span class="callout-title">{labels.nestedTitle}</span>
                </div>
                <div class="callout-content"><p>{labels.nestedBody}</p></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </LiveStylePreview>

  <SettingPanel
    {group}
    {settingItems}
    {mobile}
    on:changed={handleSettingChanged}
    on:preview={updatePreview}
  />
</section>

<style>
  .damophus-callout-appearance-preview .callout[data-type="NodeCallout"] {
    box-sizing: border-box !important;
    display: flex;
    flex-direction: column;
    width: auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin-block: 0 !important;
    padding: var(--preview-padding-top) var(--preview-padding-x) var(--preview-padding-bottom) !important;
    border: 0 !important;
    border-radius: var(--preview-radius) !important;
    outline: 0.5px solid color-mix(in srgb, currentColor var(--preview-outline-opacity), transparent) !important;
    outline-offset: -0.5px !important;
    background: color-mix(in srgb, currentColor var(--preview-surface-opacity), transparent) !important;
    box-shadow: none !important;
  }

  .damophus-callout-appearance-preview > .callout[data-type="NodeCallout"] {
    width: 100% !important;
    margin-inline: 0 !important;
  }

  .damophus-callout-appearance-preview .list[data-type="NodeList"] {
    display: flex;
    min-width: 0;
    flex-direction: column;
    margin-top: 8px;
    padding: 0;
  }

  .damophus-callout-appearance-preview .li[data-type="NodeListItem"] {
    position: relative;
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .damophus-callout-appearance-preview .li[data-type="NodeListItem"] > [data-node-id] {
    margin-left: 34px;
  }

  .damophus-callout-appearance-preview .protyle-action {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    width: 34px;
    min-height: 28px;
    align-items: center;
    justify-content: center;
    color: var(--b3-theme-on-surface);
  }

  .damophus-callout-appearance-preview .p[data-type="NodeParagraph"] {
    box-sizing: border-box;
    min-width: 0;
    padding: 4px 8px;
    color: var(--b3-theme-on-background);
    line-height: 1.65;
  }

  .damophus-callout-appearance-preview .li[data-type="NodeListItem"] > .callout {
    margin-top: 8px !important;
  }

  .damophus-callout-appearance-preview .callout[data-subtype="IMPORTANT"] {
    color: var(--b3-callout-important, #7656d6);
  }

  .damophus-callout-appearance-preview .callout[data-subtype="TIP"] {
    color: var(--b3-callout-tip, #168a45);
  }

  .damophus-callout-appearance-preview .callout[data-type="NodeCallout"]::before {
    display: none !important;
  }

  .damophus-callout-appearance-preview .callout-info {
    display: flex;
    min-width: 0;
    max-width: 100%;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }

  .damophus-callout-appearance-preview .callout-icon {
    box-sizing: content-box;
    display: flex !important;
    width: 1.2em;
    height: 1.2em;
    flex: 0 0 1.2em;
    align-items: center;
    justify-content: center;
    padding: 4px;
  }

  .damophus-callout-appearance-preview .callout-icon :global(svg) {
    width: 1em;
    height: 1em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
  }

  .damophus-callout-appearance-preview .callout-title {
    min-width: 0;
    flex: 1;
    font-size: var(--preview-title-size) !important;
    font-weight: var(--preview-title-weight) !important;
    line-height: 1.45;
    opacity: 0.86;
  }

  .damophus-callout-appearance-preview :global(.callout-preview-fold) {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    fill: none;
    stroke: currentColor;
  }

  .damophus-callout-appearance-preview .callout-content {
    box-sizing: border-box;
    min-width: 0;
    max-width: 100%;
    margin-top: 4px;
    color: var(--b3-theme-on-background);
    overflow: hidden;
  }

  .damophus-callout-appearance-preview.follow-callout-text-color
    .callout[data-type="NodeCallout"] > .callout-content,
  .damophus-callout-appearance-preview.follow-callout-text-color
    .callout[data-type="NodeCallout"] > .callout-content .p[data-type="NodeParagraph"] {
    color: inherit !important;
  }

  .damophus-callout-appearance-preview .callout-content > p {
    margin: 0;
    line-height: 1.65;
  }

</style>
