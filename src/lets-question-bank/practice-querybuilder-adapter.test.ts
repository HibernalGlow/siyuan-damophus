import { describe, expect, it } from "vitest";
import { practiceFilterToQuery, queryToPracticeFilter } from "./practice-querybuilder-adapter";

describe("practice query builder adapter", () => {
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
      combinator: "and",
      name: "Saved favorites",
      rules: [
        { field: "bookmarked", operator: "equal", value: "yes" },
        { combinator: "or", name: "Needs attention" },
      ],
    });
    expect(queryToPracticeFilter(query)).toEqual(filter);
  });

  it("uses valid defaults for a newly added rule", () => {
    expect(queryToPracticeFilter({
      combinator: "and",
      rules: [{ field: "attempted", operator: "equal", value: "yes" }],
    })).toEqual({
      glue: "and",
      rules: [{ field: "attempted", type: "tuple", filter: "equal", value: "yes" }],
    });
  });
});
