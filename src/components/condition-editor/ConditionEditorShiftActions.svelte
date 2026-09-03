<script lang="ts">
  import { ArrowDown, ArrowUp } from "lucide-svelte";
  import type { ShiftActionsProps } from "svelte-querybuilder";

  export let className: ShiftActionsProps["className"] = undefined;
  export let disabled = false;
  export let shiftDown: ShiftActionsProps["shiftDown"] = undefined;
  export let shiftDownDisabled = false;
  export let shiftUp: ShiftActionsProps["shiftUp"] = undefined;
  export let shiftUpDisabled = false;
  export let testID: ShiftActionsProps["testID"] = undefined;
  export let titles: ShiftActionsProps["titles"] = undefined;
</script>

<div data-testid={testID} class={className}>
  <button type="button" title={titles?.shiftUp} aria-label={titles?.shiftUp} disabled={disabled || shiftUpDisabled} onclick={(event) => shiftUp?.(event)}>
    <ArrowUp size={14} aria-hidden="true" />
  </button>
  <button type="button" title={titles?.shiftDown} aria-label={titles?.shiftDown} disabled={disabled || shiftDownDisabled} onclick={(event) => shiftDown?.(event)}>
    <ArrowDown size={14} aria-hidden="true" />
  </button>
</div>
