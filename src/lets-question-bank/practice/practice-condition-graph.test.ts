import { describe, expect, it } from "vitest";
import { practiceFilterToGraph } from "./practice-condition-graph";

const labels = {
  field: { attempted: "Attempt", wrong: "Wrong", review: "Review", due: "Due", bookmarked: "Bookmark" },
  operator: { equal: "=", notEqual: "≠" },
  value: { yes: "Yes", no: "No", any: "Any" },
  and: "AND",
  or: "OR",
  not: "NOT",
  result: "Questions",
  empty: "All questions",
};

describe("practiceFilterToGraph", () => {
  it("always ends at a result node and renders empty filters", () => {
    const graph = practiceFilterToGraph("all", labels);
    expect(graph.nodes).toEqual([{ id: "result", kind: "result", label: "Questions", detail: "All questions" }]);
    expect(graph.edges).toHaveLength(0);
  });

  it("renders explicit AND and OR gates with precedence", () => {
    const graph = practiceFilterToGraph({
      glue: "and",
      combinators: ["and", "or"],
      rules: [
        { field: "attempted", value: "yes" },
        { field: "wrong", value: "yes" },
        { field: "review", value: "yes" },
      ],
    }, labels);
    expect(graph.nodes.filter((node) => node.kind === "logic").map((node) => node.label)).toEqual(expect.arrayContaining(["AND", "OR"]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      { id: "root-rule-0-root-and-0", source: "root-rule-0", target: "root-and-0" },
      { id: "root-rule-1-root-and-0", source: "root-rule-1", target: "root-and-0" },
      { id: "root-and-0-root-or", source: "root-and-0", target: "root-or" },
      { id: "root-rule-2-root-or", source: "root-rule-2", target: "root-or" },
    ]));
  });

  it("keeps nested groups and NOT visible", () => {
    const graph = practiceFilterToGraph({
      glue: "and",
      not: true,
      name: "Review gate",
      rules: [{ glue: "or", rules: [{ field: "wrong", value: "yes" }, { field: "review", value: "yes" }] }],
    }, labels);
    expect(graph.nodes.filter((node) => node.kind === "logic").map((node) => node.label)).toEqual(expect.arrayContaining(["OR", "NOT"]));
    expect(graph.nodes.find((node) => node.label === "NOT")?.detail).toBe("Review gate");
  });

  it("preserves disabled rule state", () => {
    const graph = practiceFilterToGraph({ glue: "and", rules: [{ field: "due", value: "yes", disabled: true }] }, labels);
    expect(graph.nodes.find((node) => node.kind === "rule")?.disabled).toBe(true);
  });
});
