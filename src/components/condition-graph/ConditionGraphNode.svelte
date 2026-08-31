<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";
  import { GitBranch, ListFilter, ShieldCheck } from "lucide-svelte";
  import type { ConditionGraphNode } from "./types";

  export let data: ConditionGraphNode;
  export let selected = false;

  // Node data carries the field's own lucide glyph; unknown falls back per kind.
  $: NodeIcon = (data.icon ?? (data.kind === "logic" ? GitBranch : data.kind === "result" ? ShieldCheck : ListFilter)) as typeof ListFilter;

</script>

<Handle type="target" position={Position.Left} isConnectable={false} />
<div
  class:condition-graph-node-selected={selected}
  class:condition-graph-node-disabled={data.disabled}
  class:condition-graph-node-logic={data.kind === "logic"}
  class:condition-graph-node-result={data.kind === "result"}
  class="condition-graph-node"
  data-kind={data.kind}
  data-node-id={data.id}
  role="button"
  tabindex="0"
  aria-label={data.detail ? `${data.label}: ${data.detail}` : data.label}
>
  <span class="condition-graph-node-icon" aria-hidden="true">
    <NodeIcon size={15} />
  </span>
  <span class="condition-graph-node-copy">
    <strong>{data.label}</strong>
    {#if data.detail}<small>{data.detail}</small>{/if}
  </span>
</div>
<Handle type="source" position={Position.Right} isConnectable={false} />

<style>
  .condition-graph-node {
    display: flex;
    width: 218px;
    min-height: 58px;
    align-items: center;
    gap: 9px;
    padding: 9px 11px;
    border: 1px solid var(--b3-border-color);
    border-left: 3px solid var(--b3-theme-primary);
    border-radius: 8px;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
    box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
    cursor: pointer;
  }

  .condition-graph-node:hover,
  .condition-graph-node-selected {
    border-color: var(--b3-theme-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--b3-theme-primary) 22%, transparent);
  }

  .condition-graph-node-logic {
    width: 92px;
    min-height: 48px;
    justify-content: center;
    border-color: color-mix(in srgb, var(--b3-theme-primary) 52%, var(--b3-border-color));
    border-left-width: 1px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-primary) 13%, var(--b3-theme-background));
  }

  .condition-graph-node-result {
    border-left-color: var(--b3-theme-success, var(--b3-theme-primary));
    background: color-mix(in srgb, var(--b3-theme-success, var(--b3-theme-primary)) 9%, var(--b3-theme-background));
  }

  .condition-graph-node-disabled { opacity: 0.52; }
  .condition-graph-node-icon { display: grid; flex: 0 0 auto; place-items: center; color: var(--b3-theme-primary); }
  .condition-graph-node-copy { min-width: 0; display: grid; gap: 2px; }
  .condition-graph-node-copy strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .condition-graph-node-copy small { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .condition-graph-node-logic .condition-graph-node-copy { display: block; }
  .condition-graph-node-logic .condition-graph-node-copy small { display: none; }

  :global(.condition-graph-node .svelte-flow__handle) { width: 7px; height: 7px; border: 2px solid var(--b3-theme-background); background: var(--b3-theme-primary); }
</style>
