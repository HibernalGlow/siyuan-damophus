<script lang="ts">
  import { ArrowDown, ArrowUp, Copy, LockKeyhole, LockKeyholeOpen, Plus, Trash2 } from "lucide-svelte";
  import type { ActionProps } from "svelte-querybuilder";

  export let className: ActionProps["className"] = undefined;
  export let disabled = false;
  export let disabledTranslation: ActionProps["disabledTranslation"] = undefined;
  export let handleOnClick: ActionProps["handleOnClick"];
  export let label: ActionProps["label"] = undefined;
  export let testID: ActionProps["testID"] = undefined;
  export let title: ActionProps["title"] = undefined;

  $: actionId = `${testID ?? ""} ${className ?? ""}`;
  $: locked = actionId.includes("lock");
  $: cloning = actionId.includes("clone");
  $: removing = actionId.includes("remove");
  $: movingUp = actionId.includes("shiftUp");
  $: movingDown = actionId.includes("shiftDown");
  $: effectiveDisabled = disabled && !disabledTranslation;
</script>

<button
  type="button"
  data-testid={testID}
  class={className}
  data-label={label}
  title={title}
  aria-label={title}
  disabled={effectiveDisabled}
  onclick={(event) => handleOnClick(event)}
>
  {#if locked}
    {#if disabledTranslation}<LockKeyholeOpen size={15} aria-hidden="true" />{:else}<LockKeyhole size={15} aria-hidden="true" />{/if}
  {:else if cloning}
    <Copy size={15} aria-hidden="true" />
  {:else if removing}
    <Trash2 size={15} aria-hidden="true" />
  {:else if movingUp}
    <ArrowUp size={15} aria-hidden="true" />
  {:else if movingDown}
    <ArrowDown size={15} aria-hidden="true" />
  {:else}
    <Plus size={15} aria-hidden="true" />
  {/if}
  <span class="sr-only">{title ?? "Action"}</span>
</button>
