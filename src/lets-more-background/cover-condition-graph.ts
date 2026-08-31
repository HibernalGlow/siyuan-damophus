// Builds the shared condition-graph model from the cover template condition tree.
// The cover tree is AND-only (the builder exposes a single combinator), so every
// group renders as one 且 gate over its children, rules render as leaf nodes and
// the whole graph flows into a single result node.
import type { ConditionGraphEdge, ConditionGraphModel, ConditionGraphNode } from "@/components/condition-graph/types";
import type { CoverConditionGroup, CoverConditionRule } from "./sources";

export interface CoverConditionGraphLabels {
  field: Record<string, string>;
  operator: Record<string, string>;
  and: string;
  result: string;
  empty: string;
}

type CoverEntry = CoverConditionRule | CoverConditionGroup;

function isGroup(entry: CoverEntry): entry is CoverConditionGroup {
  return "rules" in entry;
}

export function coverConditionToGraph(condition: CoverConditionGroup, labels: CoverConditionGraphLabels): ConditionGraphModel {
  const nodes: ConditionGraphNode[] = [];
  const edges: ConditionGraphEdge[] = [];

  const visitGroup = (group: CoverConditionGroup, path: string, indices: number[]): string | undefined => {
    const childIds: string[] = [];
    group.rules.forEach((entry, index) => {
      if (isGroup(entry)) {
        const childId = visitGroup(entry, `${path}-${index}`, [...indices, index]);
        if (childId) childIds.push(childId);
        return;
      }
      const id = `${path}-rule-${index}`;
      nodes.push({
        id,
        kind: "rule",
        label: labels.field[entry.field] ?? entry.field,
        detail: `${labels.operator[entry.operator] ?? entry.operator} ${String(entry.value ?? "")}`.trim(),
        disabled: entry.disabled,
        meta: { rulePath: [...indices, index] },
      });
      childIds.push(id);
    });
    if (!childIds.length) return undefined;
    const gateId = `${path}-and`;
    nodes.push({ id: gateId, kind: "logic", label: labels.and });
    childIds.forEach((childId) => edges.push({ id: `${childId}-${gateId}`, source: childId, target: gateId }));
    return gateId;
  };

  const model: ConditionGraphModel = { nodes, edges };
  const rootId = visitGroup(condition, "root", []);
  const resultId = "result";
  nodes.push({ id: resultId, kind: "result", label: labels.result, detail: rootId ? undefined : labels.empty });
  if (rootId) edges.push({ id: `${rootId}-${resultId}`, source: rootId, target: resultId });
  return model;
}
