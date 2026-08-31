import type { ConditionGraphEdge, ConditionGraphModel, ConditionGraphNode } from "@/components/condition-graph/types";
import { practiceFilterToCondition, type PracticeFilter, type PracticeFilterGroup, type PracticeFilterRule } from "@/question-bank/core/scope";

export interface PracticeConditionGraphLabels {
  field: Record<string, string>;
  operator: Record<string, string>;
  value: Record<string, string>;
  and: string;
  or: string;
  not: string;
  result: string;
  empty: string;
}

type Expression =
  | { kind: "rule"; id: string; node: ConditionGraphNode }
  | { kind: "gate"; id: string; node: ConditionGraphNode; children: Expression[] };

function isGroup(value: PracticeFilterRule | PracticeFilterGroup): value is PracticeFilterGroup {
  return "rules" in value;
}

function gate(id: string, operator: string, detail: string | undefined, children: Expression[]): Expression {
  return { kind: "gate", id, node: { id, kind: "logic", label: operator, detail }, children };
}

function groupExpression(group: PracticeFilterGroup, path: string, labels: PracticeConditionGraphLabels): Expression | undefined {
  if (!group.rules.length) return undefined;
  const expressions = group.rules
    .map((rule, index) => isGroup(rule)
      ? groupExpression(rule, `${path}-${index}`, labels)
      : {
          kind: "rule" as const,
          id: `${path}-rule-${index}`,
          node: {
            id: `${path}-rule-${index}`,
            kind: "rule" as const,
            label: labels.field[rule.field] ?? rule.field,
            detail: `${labels.operator[rule.filter ?? "equal"] ?? rule.filter ?? "equal"} ${labels.value[`${rule.field}:${rule.value ?? ""}`] ?? labels.value[rule.value ?? ""] ?? rule.value ?? ""}`,
            disabled: rule.disabled,
          },
        })
    .filter((item): item is Expression => Boolean(item));
  if (!expressions.length) return undefined;

  const connectors = expressions.length > 1
    ? expressions.slice(0, -1).map((_, index) => group.combinators?.[index] ?? group.glue)
    : [];
  const segments: Expression[][] = [[]];
  expressions.forEach((expression, index) => {
    if (index > 0 && connectors[index - 1] === "or") segments.push([]);
    segments.at(-1)!.push(expression);
  });
  const andExpressions = segments.map((segment, index) => segment.length === 1
    ? segment[0]
    : gate(`${path}-and-${index}`, labels.and, group.name, segment));
  let expression = andExpressions.length === 1
    ? andExpressions[0]
    : gate(`${path}-or`, labels.or, group.name, andExpressions);
  if (group.not) expression = gate(`${path}-not`, labels.not, group.name, [expression]);
  return expression;
}

export function practiceFilterToGraph(filter: PracticeFilter, labels: PracticeConditionGraphLabels): ConditionGraphModel {
  const root = groupExpression(practiceFilterToCondition(filter), "root", labels);
  const nodes: ConditionGraphNode[] = [];
  const edges: ConditionGraphEdge[] = [];
  const visit = (expression: Expression): string => {
    nodes.push(expression.node);
    if (expression.kind === "gate") {
      expression.children.forEach((child) => {
        const childId = visit(child);
        edges.push({ id: `${childId}-${expression.id}`, source: childId, target: expression.id });
      });
    }
    return expression.id;
  };

  const resultId = "result";
  nodes.push({ id: resultId, kind: "result", label: labels.result, detail: root ? undefined : labels.empty });
  if (root) {
    const rootId = visit(root);
    edges.push({ id: `${rootId}-${resultId}`, source: rootId, target: resultId });
  }
  return { nodes, edges };
}
