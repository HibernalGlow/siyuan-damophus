<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Slider } from "@/components/ui/slider";
  import LiveStylePreview from "@/components/live-style-preview.svelte";
  import { applyThemeVariables, markerThemeVariables, type ColorMode } from "@/theme/runtime";
  import type { DamophusTheme } from "@/theme/schema";
  import { BUILTIN_THEMES } from "@/theme/themes";
  import {
    buildCustomPropertiesPreviewCss,
    DEFAULT_CUSTOM_PROPERTIES,
    DEFAULT_CUSTOM_PROPERTY_STYLE,
  } from "./custom-properties";

  export let customProperties = DEFAULT_CUSTOM_PROPERTIES;
  export let customStyle = DEFAULT_CUSTOM_PROPERTY_STYLE;
  export let theme: DamophusTheme = BUILTIN_THEMES[0];
  export let mode: ColorMode = "light";
  export let title = "Preview";
  export let widthLabel = "Preview width";

  let previewWidth = 520;
  let previewRoot: HTMLElement;
  let styleElement: HTMLStyleElement | undefined;
  const previewAttributes = {
    "custom-qb-id": "civil-procedure-gold-2021-2-4-15",
    "custom-qb-type": "single",
  };

  $: widthValue = previewWidth;
  $: previewCss = buildCustomPropertiesPreviewCss(
    customProperties,
    customStyle,
    markerThemeVariables(theme, mode),
  );
  $: if (styleElement) styleElement.textContent = previewCss;
  $: if (previewRoot) applyThemeVariables(previewRoot, theme, mode);

  onMount(() => {
    styleElement = document.createElement("style");
    styleElement.dataset.damophusBlockAttrPreview = "true";
    styleElement.textContent = previewCss;
    document.head.appendChild(styleElement);
  });

  onDestroy(() => styleElement?.remove());
</script>

<div bind:this={previewRoot} class="damophus-theme-root">
<LiveStylePreview {title} ariaLabel={title}>
  <div slot="controls" class="mt-3 flex flex-wrap items-center justify-end gap-3">
    <label class="grid min-w-60 grid-cols-[auto_minmax(100px,1fr)_48px] items-center gap-2 text-xs text-muted-foreground max-[520px]:w-full">
      <span>{widthLabel}</span>
      <Slider type="single" min={180} max={720} step={20} bind:value={previewWidth} aria-label={widthLabel} />
      <output class="text-right font-mono text-foreground">{widthValue}px</output>
    </label>
  </div>
  <div class="min-h-16 overflow-hidden bg-muted/25">
    <div
      class="preview-viewport max-w-full transition-[width] duration-150"
      style={`width: min(100%, ${widthValue}px);`}
    >
      <div class="damophus-block-attr-preview__sample w-full text-base font-semibold leading-6" {...previewAttributes}>
        <span>1.</span>
      </div>
    </div>
  </div>
</LiveStylePreview>
</div>
