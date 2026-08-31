<script lang="ts">
  import dagre from "@dagrejs/dagre";
  import { Background, BackgroundVariant, Controls, SvelteFlow, type Edge, type Node } from "@xyflow/svelte";
  import ConditionGraphNodeView from "./ConditionGraphNode.svelte";
  import type { ConditionGraphModel, ConditionGraphNode } from "./types";
  import "@xyflow/svelte/dist/style.css";

  export let model: ConditionGraphModel = { nodes: [], edges: [] };
  export let height = 360;
  export let onNodeActivate: ((id: string) => void) | undefined = undefined;

  let layoutNodes: Node[] = [];
  let layoutEdges: Edge[] = [];

  const nodeTypes = { condition: ConditionGraphNodeView };

  function nodeSize(node: ConditionGraphNode): { width: number; height: number } {
    return node.kind === "logic" ? { width: 92, height: 48 } : { width: 218, height: 58 };
  }

  function layoutModel(source: ConditionGraphModel): { nodes: Node[]; edges: Edge[] } {
    if (!source.nodes.length) return { nodes: [], edges: [] };
    const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "LR", nodesep: 26, ranksep: 60, marginx: 26, marginy: 24 });
    for (const node of source.nodes) {
      const size = nodeSize(node);
      graph.setNode(node.id, size);
    }
    for (const edge of source.edges) graph.setEdge(edge.source, edge.target);
    dagre.layout(graph);

    return {
      nodes: source.nodes.map((node) => {
        const size = nodeSize(node);
        const position = graph.node(node.id);
        return {
          id: node.id,
          type: "condition",
          position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
          data: { ...node } as Record<string, unknown>,
          draggable: false,
          connectable: false,
          selectable: true,
          focusable: true,
        };
      }),
      edges: source.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "smoothstep",
        selectable: false,
        focusable: false,
        style: "stroke: var(--b3-border-color); stroke-width: 1.5px;",
      })),
    };
  }

  $: {
    const next = layoutModel(model);
    layoutNodes = next.nodes;
    layoutEdges = next.edges;
  }

  function activateNode(event: { node: Node }): void {
    onNodeActivate?.(event.node.id);
  }
</script>

<div class="condition-graph" style={`height: ${height}px;`} data-testid="condition-graph">
  {#if layoutNodes.length}
    <SvelteFlow
      id="damophus-condition-graph"
      bind:nodes={layoutNodes}
      bind:edges={layoutEdges}
      {nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
      colorMode="light"
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      onnodeclick={activateNode}
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} patternColor="var(--b3-border-color)" />
      <Controls showLock={false} />
    </SvelteFlow>
  {:else}
    <div class="condition-graph-empty">No conditions</div>
  {/if}
</div>

<style>
  .condition-graph { position: relative; min-height: 220px; overflow: hidden; border: 1px solid var(--b3-border-color); border-radius: 7px; background: color-mix(in srgb, var(--b3-theme-surface) 38%, var(--b3-theme-background)); }
  .condition-graph-empty { display: grid; height: 100%; place-items: center; color: var(--b3-theme-on-surface); font-size: 12px; }
  :global(.condition-graph .svelte-flow) { width: 100%; height: 100%; background: transparent; }
  :global(.condition-graph .svelte-flow__controls) { overflow: hidden; border: 1px solid var(--b3-border-color); border-radius: 6px; box-shadow: none; }
  :global(.condition-graph .svelte-flow__controls-button) { width: 26px; height: 26px; border-bottom-color: var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); }
  :global(.condition-graph .svelte-flow__controls-button:hover) { background: var(--b3-list-hover); }
  :global(.condition-graph .svelte-flow__edge-path) { stroke: var(--b3-border-color); }
  :global(.condition-graph .svelte-flow__attribution) { opacity: 0.55; background: transparent; color: var(--b3-theme-on-surface); }
</style>
