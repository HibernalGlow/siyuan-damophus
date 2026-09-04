import { describe, expect, it } from "vitest";
import { practiceFilterToQuery, queryToPracticeFilter, type PracticeQueryGroup, type PracticeQueryValue } from "./practice-querybuilder-adapter";

describe("practice query builder adapter", () => {
  it("carries the manual bypass flag through both directions", () => {
    const query: PracticeQueryGroup = {
      glue: "and",
      bypassed: true,
      rules: [{ field: "attempted", operator: "equal", value: "yes", bypassed: true }],
    };
    const filter = queryToPracticeFilter(query);
    expect(filter).toMatchObject({ bypassed: true, rules: [{ bypassed: true }] });
    expect(practiceFilterToQuery(filter)).toMatchObject({ bypassed: true, rules: [{ bypassed: true }] });
  });
  it("maps named nested groups without changing filter semantics", () => {
    const filter = {
      glue: "and" as const,
      name: "Saved favorites",
      rules: [
        { field: "bookmarked" as const, type: "tuple" as const, filter: "equal" as const, value: "yes" as const },
        {
          glue: "or" as const,
          name: "Needs attention",
          rules: [
            { field: "wrong" as const, type: "tuple" as const, filter: "equal" as const, value: "yes" as const },
            { field: "review" as const, type: "tuple" as const, filter: "notEqual" as const, value: "no" as const },
          ],
        },
      ],
    };

    const query = practiceFilterToQuery(filter);
    expect(query).toMatchObject({
      glue: "and",
      name: "Saved favorites",
      rules: [
        { field: "bookmarked", operator: "equal", value: "yes" },
        "and",
        { glue: "or", name: "Needs attention" },
      ],
    });
    expect(queryToPracticeFilter(query)).toEqual(filter);
  });

  it("uses valid defaults for a newly added rule", () => {
    expect(queryToPracticeFilter({
      glue: "and",
      rules: [{ field: "attempted", operator: "equal", value: "yes" }],
    })).toEqual({
      glue: "and",
      rules: [{ field: "attempted", type: "tuple", filter: "equal", value: "yes" }],
    });
  });

  it("keeps 全部题/cleared rules value-less so they restrict nothing but stay editable", () => {
    // 全部题 (or a cleared value) must not be coerced to "yes" nor dropped: the
    // rule persists without a value — the core evaluator treats that as match-all.
    const filter = queryToPracticeFilter({
      glue: "and",
      rules: [
        { field: "attempted", operator: "equal", value: "" as PracticeQueryValue },
        "and",
        { field: "wrong", operator: "equal", value: "any" },
        "and",
        { field: "bookmarked", operator: "equal", value: "yes" },
      ],
    });
    expect(filter.rules).toEqual([
      { field: "attempted", type: "tuple", filter: "equal" },
      { field: "wrong", type: "tuple", filter: "equal" },
      { field: "bookmarked", type: "tuple", filter: "equal", value: "yes" },
    ]);
  });

  it("round-trips the 全部题 option through a value-less rule", () => {
    const query: PracticeQueryGroup = {
      glue: "and",
      rules: [{ field: "attempted", operator: "equal", value: "any" }],
    };
    const filter = queryToPracticeFilter(query);
    expect(filter.rules).toEqual([{ field: "attempted", type: "tuple", filter: "equal" }]);
    expect(practiceFilterToQuery(filter).rules).toEqual([
      { field: "attempted", operator: "equal", value: "any" },
    ]);
  });

  it("round-trips independent combinators and editing state", () => {
    const filter = {
      glue: "and" as const,
      not: true,
      rules: [
        { field: "bookmarked" as const, type: "tuple" as const, filter: "equal" as const, value: "yes" as const, disabled: true },
        { field: "wrong" as const, type: "tuple" as const, filter: "equal" as const, value: "yes" as const },
        { field: "review" as const, type: "tuple" as const, filter: "equal" as const, value: "yes" as const },
      ],
      combinators: ["and" as const, "or" as const],
    };
    const query = practiceFilterToQuery(filter);
    expect(query.rules).toEqual([
      expect.objectContaining({ field: "bookmarked", disabled: true }),
      "and",
      expect.objectContaining({ field: "wrong" }),
      "or",
      expect.objectContaining({ field: "review" }),
    ]);
    expect(queryToPracticeFilter(query)).toEqual(filter);
  });
});
