<script lang="ts">
  import { Layers3, X } from "lucide-svelte";

  export let label: (key: string, fallback: string) => string;
  export let open = false;
  export let badge = 0;
  export let toggle: () => void;
</script>

<button
  type="button"
  class="workspace-fab"
  class:open
  aria-expanded={open}
  aria-label={label("fabLabel", "Document & unfinished")}
  title={label("fabLabel", "Document & unfinished")}
  onclick={toggle}
>
  {#if open}
    <X size={19} aria-hidden="true" />
  {:else}
    <Layers3 size={19} aria-hidden="true" />
  {/if}
  {#if !open && badge > 0}<em>{badge}</em>{/if}
</button>

<style>
  /* Desktop keeps the document row and the unfinished list inline. */
  .workspace-fab { display: none; }

  @container (max-width: 760px) {
    .workspace-fab {
      position: absolute;
      right: 14px;
      bottom: calc(120px + env(safe-area-inset-bottom, 0px));
      z-index: 7;
      width: 50px;
      height: 50px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: var(--b3-theme-primary);
      color: #fff;
      box-shadow: 0 8px 22px color-mix(in srgb, var(--b3-theme-primary) 34%, transparent);
      cursor: pointer;
    }

    .workspace-fab.open {
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-background);
      box-shadow: 0 8px 22px rgb(0 0 0 / 18%);
    }

    .workspace-fab em {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 19px;
      height: 19px;
      padding-inline: 5px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      background: var(--b3-theme-error);
      color: #fff;
      font-size: 10.5px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 0 0 2px var(--b3-theme-background);
    }
  }
</style>
