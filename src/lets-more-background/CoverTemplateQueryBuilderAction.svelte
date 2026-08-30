<script lang="ts">
  import { Copy, Plus, Trash2 } from "lucide-svelte";
  import type { ActionProps } from "svelte-querybuilder";

  export let className: ActionProps["className"] = undefined;
  export let disabled = false;
  export let disabledTranslation: ActionProps["disabledTranslation"] = undefined;
  export let handleOnClick: ActionProps["handleOnClick"];
  export let label: ActionProps["label"] = undefined;
  export let testID: ActionProps["testID"] = undefined;
  export let title: ActionProps["title"] = undefined;

  $: actionId = `${testID ?? ""} ${className ?? ""}`;
  $: addingRule = actionId.includes("addRule");
  $: cloning = actionId.includes("clone");
  $: removing = actionId.includes("remove");
</script>

<button
  type="button"
  data-testid={testID}
  class={className}
  title={title}
  aria-label={title}
  disabled={disabled && !disabledTranslation}
  onclick={(event) => handleOnClick(event)}
>
  {#if addingRule}
    <Plus size={15} aria-hidden="true" />
    <span>{label}</span>
  {:else if cloning}
    <Copy size={15} aria-hidden="true" />
    <span class="sr-only">{title ?? "Clone"}</span>
  {:else if removing}
    <Trash2 size={15} aria-hidden="true" />
    <span class="sr-only">{title ?? "Delete"}</span>
  {:else}
    <Plus size={15} aria-hidden="true" />
    <span class="sr-only">{title ?? "Action"}</span>
  {/if}
</button>
