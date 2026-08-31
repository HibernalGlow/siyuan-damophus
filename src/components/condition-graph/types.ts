export type ConditionGraphNodeKind = "rule" | "logic" | "result";

export interface ConditionGraphNode {
  id: string;
  kind: ConditionGraphNodeKind;
  label: string;
  detail?: string;
  disabled?: boolean;
  meta?: Record<string, unknown>;
}

export interface ConditionGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface ConditionGraphModel {
  nodes: ConditionGraphNode[];
  edges: ConditionGraphEdge[];
}
