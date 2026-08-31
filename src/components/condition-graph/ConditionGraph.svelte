<!--
  [条件图形视图-暂停维护] The graph view is temporarily disabled and its heavy
  dependencies (@xyflow/svelte, @dagrejs/dagre) are uninstalled, so nothing of it
  is compiled into the plugin bundle. To bring it back: restore the commented
  implementation below, re-add the two dependencies, and uncomment the graph
  branches in PracticeConditionEditor.svelte, CoverTemplateConditionEditor.svelte
  and the migration dialog in MoreBackgroundSettings.svelte.
-->
<script lang="ts">
  // import dagre from "@dagrejs/dagre";
  // import { Background, BackgroundVariant, Controls, SvelteFlow, type Edge, type Node } from "@xyflow/svelte";
  // import ConditionGraphNodeView from "./ConditionGraphNode.svelte";
  // import type { ConditionGraphModel, ConditionGraphNode } from "./types";
  // import "@xyflow/svelte/dist/style.css";
  //
  // export let model: ConditionGraphModel = { nodes: [], edges: [] };
  // export let height = 360;
  // export let onNodeActivate: ((id: string) => void) | undefined = undefined;
  //
  // let layoutNodes: Node[] = [];
  // let layoutEdges: Edge[] = [];
  //
  // const nodeTypes = { condition: ConditionGraphNodeView };
  //
  // function nodeSize(node: ConditionGraphNode): { width: number; height: number } {
  //   return node.kind === "logic" ? { width: 92, height: 48 } : { width: 218, height: 58 };
  // }
  //
  // function layoutModel(source: ConditionGraphModel): { nodes: Node[]; edges: Edge[] } {
  //   if (!source.nodes.length) return { nodes: [], edges: [] };
  //   const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  //   graph.setGraph({ rankdir: "LR", nodesep: 26, ranksep: 60, marginx: 26, marginy: 24 });
  //   for (const node of source.nodes) {
  //     const size = nodeSize(node);
  //     graph.setNode(node.id, size);
  //   }
  //   for (const edge of source.edges) graph.setEdge(edge.source, edge.target);
  //   dagre.layout(graph);
  //
  //   return {
  //     nodes: source.nodes.map((node) => {
  //       const size = nodeSize(node);
  //       const position = graph.node(node.id);
  //       return {
  //         id: node.id,
  //         type: "condition",
  //         position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
  //         data: { ...node } as Record<string, unknown>,
  //         draggable: false,
  //         connectable: false,
  //         selectable: true,
  //         focusable: true,
  //       };
  //     }),
  //     edges: source.edges.map((edge) => ({
  //       id: edge.id,
  //       source: edge.source,
  //       target: edge.target,
  //       type: "smoothstep",
  //       selectable: false,
  //       focusable: false,
  //       style: "stroke: var(--b3-border-color); stroke-width: 1.5px;",
  //     })),
  //   };
  // }
  //
  // $: {
  //   const next = layoutModel(model);
  //   layoutNodes = next.nodes;
  //   layoutEdges = next.edges;
  // }
  //
  // function activateNode(event: { node: Node }): void {
  //   onNodeActivate?.(event.node.id);
  // }
</script>

<!-- [条件图形视图-暂停维护] <div class="condition-graph" data-testid="condition-graph">
  <SvelteFlow id="damophus-condition-graph" ... />
</div> -->
