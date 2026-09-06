import type { ConditionGraphEdge, ConditionGraphModel, ConditionGraphNode } from "@/components/condition-graph/types";
import { practiceFilterToCondition, type PracticeFilter, type PracticeFilterGroup, type PracticeFilterRule } from "@/question-bank/core/scope";
import { Bookmark, CalendarClock, CheckCircle2, Clock3, GitBranch, History, ListFilter, RefreshCw, Repeat, Star, TrendingDown, XCircle } from "lucide-svelte";

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

// Same glyphs the field pills use, so the graph reads like the list view.
const FIELD_ICONS: Record<string, typeof ListFilter> = {
  attempted: CheckCircle2,
  wrong: XCircle,
  review: RefreshCw,
  due: Clock3,
  bookmarked: Bookmark,
  latest_rating: Star,
  last_result: History,
  wrong_count: TrendingDown,
  attempt_count: Repeat,
  last_answered_days: CalendarClock,
};

type Expression =
  | { kind: "rule"; id: string; node: ConditionGraphNode }
  | { kind: "gate"; id: string; node: ConditionGraphNode; children: Expression[] };

function isGroup(value: PracticeFilterRule | PracticeFilterGroup): value is PracticeFilterGroup {
  return "rules" in value;
}

function gate(id: string, operator: string, detail: string | undefined, children: Expression[]): Expression {
  return { kind: "gate", id, node: { id, kind: "logic", label: operator, detail, icon: GitBranch }, children };
}

/** Operator label plus the rule's value part; multi-select selections join with slashes. */
function ruleDetail(rule: PracticeFilterRule, labels: PracticeConditionGraphLabels): string {
  const operator = labels.operator[rule.filter ?? "equal"] ?? rule.filter ?? "equal";
  const valuePart = rule.includes?.length
    ? rule.includes.map((item) => labels.value[`${rule.field}:${item}`] ?? labels.value[item] ?? String(item)).join("/")
    : labels.value[`${rule.field}:${rule.value ?? ""}`] ?? labels.value[rule.value === undefined ? "" : String(rule.value)] ?? (rule.value === undefined ? "" : String(rule.value));
  return `${operator} ${valuePart}`.trim();
}

function groupExpression(group: PracticeFilterGroup, path: string, labels: PracticeConditionGraphLabels, rulePath: number[] = []): Expression | undefined {
  if (!group.rules.length) return undefined;
  const expressions = group.rules
    .map((rule, index) => isGroup(rule)
      ? groupExpression(rule, `${path}-${index}`, labels, [...rulePath, index])
      : {
          kind: "rule" as const,
          id: `${path}-rule-${index}`,
          node: {
            id: `${path}-rule-${index}`,
            kind: "rule" as const,
            label: labels.field[rule.field] ?? rule.field,
            detail: ruleDetail(rule, labels),
            disabled: rule.disabled,
            icon: FIELD_ICONS[rule.field] ?? ListFilter,
            meta: { rulePath: [...rulePath, index] },
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
  nodes.push({ id: resultId, kind: "result", label: labels.result, detail: root ? undefined : labels.empty, icon: ListFilter });
  if (root) {
    const rootId = visit(root);
    edges.push({ id: `${rootId}-${resultId}`, source: rootId, target: resultId });
  }
  return { nodes, edges };
}
