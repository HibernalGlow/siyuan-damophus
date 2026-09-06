import { describe, expect, it } from "vitest";
import { practiceFilterToGraph } from "./practice-condition-graph";

const labels = {
  field: { attempted: "Attempt", wrong: "Wrong", review: "Review", due: "Due", bookmarked: "Bookmark", latest_rating: "Latest rating", last_result: "Last result", wrong_count: "Wrong count", attempt_count: "Attempt count", last_answered_days: "Days since last attempt" },
  operator: { equal: "=", notEqual: "≠", greaterOrEqual: "≥", lessOrEqual: "≤" },
  value: { yes: "Yes", no: "No", any: "Any", correct: "Correct", wrong: "Wrong answer", unattempted: "Unattempted", "latest_rating:again": "Again", "latest_rating:hard": "Hard", "latest_rating:good": "Good" },
  and: "AND",
  or: "OR",
  not: "NOT",
  result: "Questions",
  empty: "All questions",
};

describe("practiceFilterToGraph", () => {
  it("always ends at a result node and renders empty filters", () => {
    const graph = practiceFilterToGraph("all", labels);
    expect(graph.nodes).toEqual([{ id: "result", kind: "result", label: "Questions", detail: "All questions", icon: expect.any(Function) }]);
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

  it("renders rating selections, last results, and numeric thresholds", () => {
    const graph = practiceFilterToGraph({
      glue: "and",
      rules: [
        { field: "latest_rating", type: "tuple", filter: "equal", includes: ["again", "hard"] },
        { field: "last_result", type: "tuple", filter: "notEqual", value: "unattempted" },
        { field: "wrong_count", type: "tuple", filter: "greaterOrEqual", value: 2 },
        { field: "last_answered_days", type: "tuple", filter: "lessOrEqual", value: 7 },
      ],
    }, labels);
    const ruleNodes = graph.nodes.filter((node) => node.kind === "rule");
    expect(ruleNodes.map((node) => node.detail)).toEqual([
      "= Again/Hard",
      "≠ Unattempted",
      "≥ 2",
      "≤ 7",
    ]);
  });
});
