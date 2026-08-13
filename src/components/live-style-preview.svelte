<script lang="ts">
  import { Pin, PinOff } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { plugin } from "@/utils";

  export let title = "Preview";
  export let description = "";
  export let ariaLabel = title;
  export let contentClass = "";
  export let pinLabel = "";
  export let unpinLabel = "";
  export let pinned = true;

  $: resolvedPinLabel = pinLabel || plugin?.i18n?.["settings.pinPreview"] || "Pin preview";
  $: resolvedUnpinLabel = unpinLabel || plugin?.i18n?.["settings.unpinPreview"] || "Unpin preview";
</script>

<section
  class="damophus-live-style-preview border-y border-border py-4"
  class:damophus-live-style-preview--pinned={pinned}
  aria-label={ariaLabel}
  data-live-style-preview
  data-pinned={pinned}
>
  <div class="mb-3 flex items-start justify-between gap-3 px-3">
    <div class="min-w-0">
      <h3 class="text-sm font-semibold">{title}</h3>
      {#if description}<p class="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>{/if}
    </div>
    <Button
      variant="ghost"
      size="icon-sm"
      class="damophus-live-style-preview__pin shrink-0"
      aria-label={pinned ? resolvedUnpinLabel : resolvedPinLabel}
      title={pinned ? resolvedUnpinLabel : resolvedPinLabel}
      aria-pressed={pinned}
      onclick={() => pinned = !pinned}
    >
      {#if pinned}<PinOff aria-hidden="true" />{:else}<Pin aria-hidden="true" />{/if}
    </Button>
    <slot name="controls" />
  </div>
  <div class={`damophus-live-style-preview__surface mx-3 min-w-0 overflow-hidden border border-border bg-background text-foreground ${contentClass}`}>
    <slot />
  </div>
</section>

<style>
  .damophus-live-style-preview {
    background: var(--background);
  }

  .damophus-live-style-preview--pinned {
    position: sticky;
    top: 0;
    z-index: 20;
    box-shadow: 0 8px 16px -16px color-mix(in srgb, var(--foreground) 45%, transparent);
  }

  .damophus-live-style-preview__surface { border-radius: 6px; padding: 18px; }

  .damophus-live-style-preview--pinned .damophus-live-style-preview__surface {
    max-height: min(42vh, 360px);
    overflow: auto;
  }

  .damophus-live-style-preview__pin :global(svg) {
    width: 15px;
    height: 15px;
  }
</style>
