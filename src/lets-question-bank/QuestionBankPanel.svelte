<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ChevronDown } from "lucide-svelte";
  import * as Collapsible from "@/components/ui/collapsible";
  import "./question-bank-panel.css";

  export let open = false;
  export let Icon: typeof ChevronDown;
  export let title: string;
  export let description: string;
  export let contentId: string | undefined = undefined;
  export let className = "";

  const dispatch = createEventDispatcher<{
    openChange: boolean;
    trigger: MouseEvent;
  }>();

  function handleOpenChange(value: boolean): void {
    open = value;
    dispatch("openChange", value);
  }
</script>

<Collapsible.Root
  {open}
  class={`workspace-panel${className ? ` ${className}` : ""}`}
  onOpenChange={handleOpenChange}
>
  <Collapsible.Trigger
    class="workspace-panel-trigger"
    aria-controls={contentId}
    onclick={(event) => dispatch("trigger", event)}
  >
    <span class="workspace-panel-heading">
      <Icon aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </span>
    <span class="workspace-panel-meta">
      <slot name="meta" />
      <ChevronDown class={open ? "open" : ""} aria-hidden="true" />
    </span>
  </Collapsible.Trigger>
  <Collapsible.Content id={contentId} class="workspace-panel-content">
    <slot />
  </Collapsible.Content>
</Collapsible.Root>
