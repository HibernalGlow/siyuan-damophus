<script lang="ts">
  import { ArrowDown, ArrowUp, Minus } from "lucide-svelte";
  import type { AttemptDurationComparison } from "./attempt-duration-comparison";
  import type { Label } from "./question-bank-display";

  export let comparisons: AttemptDurationComparison[] = [];
  export let label: Label;
  export let formatDuration: (milliseconds: number) => string;

  function comparisonText(item: AttemptDurationComparison): string {
    if (item.benchmark === "previous") {
      if (item.direction === "faster") return `${label("fasterThanPrevious", "Faster than last time by")} ${formatDuration(item.deltaMs)}`;
      if (item.direction === "slower") return `${label("slowerThanPrevious", "Slower than last time by")} ${formatDuration(item.deltaMs)}`;
      return label("sameAsPrevious", "Same time as last attempt");
    }
    if (item.direction === "faster") return `${label("fasterThanAverage", "Faster than historical average by")} ${formatDuration(item.deltaMs)}`;
    if (item.direction === "slower") return `${label("slowerThanAverage", "Slower than historical average by")} ${formatDuration(item.deltaMs)}`;
    return label("sameAsAverage", "Same as historical average");
  }
</script>

{#if comparisons.length > 0}
  <div class="duration-comparisons" aria-label={label("durationComparison", "Answer time comparison")}>
    {#each comparisons as item (item.benchmark)}
      <span class="duration-comparison" class:faster={item.direction === "faster"} class:slower={item.direction === "slower"} class:same={item.direction === "same"} data-benchmark={item.benchmark}>
        {#if item.direction === "faster"}
          <ArrowDown size={13} aria-hidden="true" />
        {:else if item.direction === "slower"}
          <ArrowUp size={13} aria-hidden="true" />
        {:else}
          <Minus size={13} aria-hidden="true" />
        {/if}
        {comparisonText(item)}
      </span>
    {/each}
  </div>
{/if}

<style>
  .duration-comparisons { min-width: 0; display: flex; align-items: center; gap: 7px; overflow-x: auto; scrollbar-width: none; }
  .duration-comparisons::-webkit-scrollbar { display: none; }
  .duration-comparison { min-height: 22px; padding: 2px 6px; display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; border: 1px solid var(--b3-border-color); border-radius: 5px; color: var(--b3-theme-on-surface); font-size: 11px; font-weight: 600; line-height: 1.25; white-space: nowrap; }
  .duration-comparison.faster { border-color: color-mix(in srgb, var(--b3-theme-success) 42%, var(--b3-border-color)); background: color-mix(in srgb, var(--b3-theme-success) 10%, transparent); color: var(--b3-theme-success); }
  .duration-comparison.slower { border-color: color-mix(in srgb, var(--b3-theme-error) 42%, var(--b3-border-color)); background: color-mix(in srgb, var(--b3-theme-error) 9%, transparent); color: var(--b3-theme-error); }
</style>
