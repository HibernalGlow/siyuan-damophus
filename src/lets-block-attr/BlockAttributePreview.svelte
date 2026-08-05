<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import {
    buildCustomPropertiesPreviewCss,
    DEFAULT_CUSTOM_PROPERTIES,
    DEFAULT_CUSTOM_PROPERTY_STYLE,
  } from "./custom-properties";

  export let customProperties = DEFAULT_CUSTOM_PROPERTIES;
  export let customStyle = DEFAULT_CUSTOM_PROPERTY_STYLE;
  export let title = "Preview";
  export let widthLabel = "Preview width";

  let previewWidth = 520;
  let styleElement: HTMLStyleElement | undefined;
  const previewAttributes = {
    "custom-qb-id": "civil-procedure-gold-2021-2-4-15",
    "custom-qb-type": "single",
  };

  $: previewCss = buildCustomPropertiesPreviewCss(customProperties, customStyle);
  $: if (styleElement) styleElement.textContent = previewCss;

  onMount(() => {
    styleElement = document.createElement("style");
    styleElement.dataset.damophusBlockAttrPreview = "true";
    styleElement.textContent = previewCss;
    document.head.appendChild(styleElement);
  });

  onDestroy(() => styleElement?.remove());
</script>

<section class="block-attribute-preview" aria-label={title}>
  <div class="preview-header">
    <strong>{title}</strong>
    <label class="preview-width">
      <span>{widthLabel}</span>
      <input
        type="range"
        min="180"
        max="720"
        step="20"
        bind:value={previewWidth}
        aria-label={widthLabel}
      />
      <output>{previewWidth}px</output>
    </label>
  </div>
  <div class="preview-stage">
    <div class="preview-viewport" style={`width: min(100%, ${previewWidth}px);`}>
      <div
        class="damophus-block-attr-preview__sample"
        {...previewAttributes}
      >
        <span class="question-number">1.</span>
      </div>
    </div>
  </div>
</section>

<style>
  .block-attribute-preview {
    margin: 0 0 16px;
    border: 1px solid var(--b3-theme-outline-variant, #d7dce3);
    border-radius: 8px;
    overflow: hidden;
    background: var(--b3-theme-surface, #ffffff);
  }

  .preview-header {
    min-height: 42px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--b3-theme-outline-variant, #d7dce3);
    box-sizing: border-box;
    font-size: 13px;
    letter-spacing: 0;
  }

  .preview-width {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--b3-theme-on-surface-light, #697386);
    font-size: 12px;
  }

  .preview-width input {
    width: 128px;
  }

  .preview-width output {
    min-width: 42px;
    color: var(--b3-theme-on-surface, #202124);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .preview-stage {
    min-height: 94px;
    padding: 16px;
    overflow: hidden;
    background: var(--b3-theme-background, #ffffff);
    box-sizing: border-box;
  }

  .preview-viewport {
    max-width: 100%;
    min-height: 58px;
    padding: 8px 10px;
    border-left: 2px solid var(--b3-theme-primary, #3573f0);
    box-sizing: border-box;
    transition: width 120ms ease;
  }

  .damophus-block-attr-preview__sample {
    width: 100%;
    color: var(--b3-theme-on-background, #202124);
    font-size: 16px;
    font-weight: 600;
    line-height: 1.5;
  }

  .question-number {
    color: var(--b3-theme-on-background, #202124);
  }

  @media (max-width: 640px) {
    .preview-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }

    .preview-width {
      width: 100%;
    }

    .preview-width input {
      flex: 1;
      min-width: 0;
    }
  }
</style>
