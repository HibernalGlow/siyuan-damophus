import { describe, expect, it } from "vitest";
import {
  describePracticeFilterSpec,
  evaluatePracticeFilterSpec,
  isPracticeFilterSpecEmpty,
  normalizePracticeFilterSpec,
  singleFieldFilterSpec,
  specIncludesFilter,
  type PracticeFilterFacts,
  type PracticeFilterSpec,
} from "./filter-spec";
import { filterQuestions } from "./scope";
import type { Question } from "./types";

function question(id: string): Question {
  return {
    id,
    type: "single",
    markdown: id,
    options: [{ id: "A", markdown: "A" }],
    answer: { kind: "options", optionIds: ["A"] },
    metadata: { topicPath: [] },
  } as unknown as Question;
}

const facts = (overrides: Partial<PracticeFilterFacts>): PracticeFilterFacts => ({
  unattempted: false,
  wrong: false,
  review: false,
  due: false,
  bookmarked: false,
  "again-hard": false,
  ...overrides,
});

describe("normalizePracticeFilterSpec", () => {
  it("maps legacy strings and rejects unknown values", () => {
    expect(normalizePracticeFilterSpec("all")).toEqual({});
    expect(normalizePracticeFilterSpec("wrong")).toEqual({
      glue: "and",
      rules: [{ field: "wrong", type: "tuple", filter: "contains", includes: ["yes"] }],
    });
    expect(normalizePracticeFilterSpec("bogus")).toEqual({});
    expect(normalizePracticeFilterSpec(undefined)).toEqual({});
    expect(normalizePracticeFilterSpec(42)).toEqual({});
  });

  it("keeps valid nested groups and drops invalid leaves", () => {
    const spec = normalizePracticeFilterSpec({
      glue: "and",
      rules: [
        { field: "bookmarked", filter: "contains", includes: ["yes"] },
        { field: "wrong", filter: "notContains", includes: ["yes"] },
        { field: "hacker", filter: "contains", includes: ["yes"] },
        { field: "due", filter: "greater", value: 3 },
        {
          glue: "or",
          rules: [
            { field: "review", filter: "contains", includes: ["yes"] },
            { field: "nope", filter: "contains", includes: ["no"] },
          ],
        },
      ],
    });
    expect(spec).toEqual({
      glue: "and",
      rules: [
        { field: "bookmarked", type: "tuple", filter: "contains", includes: ["yes"] },
        { field: "wrong", type: "tuple", filter: "notContains", includes: ["yes"] },
        {
          glue: "or",
          rules: [{ field: "review", type: "tuple", filter: "contains", includes: ["yes"] }],
        },
      ],
    });
  });

  it("normalizes to empty when nothing valid remains", () => {
    expect(normalizePracticeFilterSpec({ glue: "and", rules: [{ field: "x", filter: "contains", includes: ["yes"] }] })).toEqual({});
    expect(normalizePracticeFilterSpec({})).toEqual({});
  });
});

describe("evaluatePracticeFilterSpec", () => {
  it("supports the bookmarked AND NOT wrong combination", () => {
    const spec = normalizePracticeFilterSpec({
      glue: "and",
      rules: [
        { field: "bookmarked", filter: "contains", includes: ["yes"] },
        { field: "wrong", filter: "notContains", includes: ["yes"] },
      ],
    });
    expect(evaluatePracticeFilterSpec(spec, facts({ bookmarked: true }))).toBe(true);
    expect(evaluatePracticeFilterSpec(spec, facts({ bookmarked: true, wrong: true }))).toBe(false);
    expect(evaluatePracticeFilterSpec(spec, facts({}))).toBe(false);
  });

  it("supports the wrong AND NOT review combination", () => {
    const spec = normalizePracticeFilterSpec({
      glue: "and",
      rules: [
        { field: "wrong", filter: "contains", includes: ["yes"] },
        { field: "review", filter: "notContains", includes: ["yes"] },
      ],
    });
    expect(evaluatePracticeFilterSpec(spec, facts({ wrong: true }))).toBe(true);
    expect(evaluatePracticeFilterSpec(spec, facts({ wrong: true, review: true }))).toBe(false);
  });

  it("supports OR groups nested under AND", () => {
    const spec: PracticeFilterSpec = {
      glue: "and",
      rules: [
        { field: "due", type: "tuple", filter: "contains", includes: ["yes"] },
        {
          glue: "or",
          rules: [
            { field: "wrong", type: "tuple", filter: "contains", includes: ["yes"] },
            { field: "bookmarked", type: "tuple", filter: "contains", includes: ["yes"] },
          ],
        },
      ],
    };
    expect(evaluatePracticeFilterSpec(spec, facts({ due: true, wrong: true }))).toBe(true);
    expect(evaluatePracticeFilterSpec(spec, facts({ due: true, bookmarked: true }))).toBe(true);
    expect(evaluatePracticeFilterSpec(spec, facts({ due: true }))).toBe(false);
    expect(evaluatePracticeFilterSpec(spec, facts({ wrong: true }))).toBe(false);
  });

  it("treats any-glue groups and empty specs as match-all", () => {
    expect(evaluatePracticeFilterSpec({}, facts({}))).toBe(true);
    expect(evaluatePracticeFilterSpec({ glue: "or", rules: [] }, facts({}))).toBe(true);
    expect(evaluatePracticeFilterSpec(
      { glue: "or", rules: [{ field: "due", type: "tuple", filter: "contains", includes: ["yes"] }] },
      facts({ due: true }),
    )).toBe(true);
  });
});

describe("helpers", () => {
  it("detects emptiness and included dimensions", () => {
    const spec = singleFieldFilterSpec("wrong", "notContains");
    expect(isPracticeFilterSpecEmpty({})).toBe(true);
    expect(isPracticeFilterSpecEmpty({ glue: "and", rules: [] })).toBe(true);
    expect(isPracticeFilterSpecEmpty(spec)).toBe(false);
    expect(specIncludesFilter(spec, "wrong", "notContains")).toBe(true);
    expect(specIncludesFilter(spec, "wrong", "contains")).toBe(false);
    expect(specIncludesFilter({
      glue: "and",
      rules: [{ glue: "or", rules: [singleFieldFilterSpec("due").rules![0]] }],
    }, "due")).toBe(true);
  });

  it("describes specs for the summary chip", () => {
    const labels = { field: (f: string) => f, notPrefix: "not-", and: " AND ", or: " OR " };
    expect(describePracticeFilterSpec({}, labels)).toBe("");
    expect(describePracticeFilterSpec(normalizePracticeFilterSpec({
      glue: "and",
      rules: [
        { field: "bookmarked", filter: "contains", includes: ["yes"] },
        { field: "wrong", filter: "notContains", includes: ["yes"] },
      ],
    }), labels)).toBe("bookmarked AND not-wrong");
  });
});

describe("filterQuestions with specs", () => {
  const questions = [question("q1"), question("q2"), question("q3")];

  it("keeps legacy single-filter behavior", () => {
    const aggregates = new Map([
      ["q1", { attempts: 2, objectiveIncorrect: 1 } as never],
    ]);
    expect(filterQuestions({ questions, topics: [], filter: "unattempted", aggregates }).map((q) => q.id))
      .toEqual(["q2", "q3"]);
    expect(filterQuestions({ questions, topics: [], filter: "wrong", aggregates }).map((q) => q.id))
      .toEqual(["q1"]);
  });

  it("evaluates combined conditions", () => {
    const aggregates = new Map<string, never>([
      ["q1", { attempts: 1, objectiveIncorrect: 1 } as never],
      ["q2", { attempts: 1, objectiveIncorrect: 0 } as never],
    ]);
    const spec = normalizePracticeFilterSpec({
      glue: "and",
      rules: [
        { field: "wrong", filter: "notContains", includes: ["yes"] },
        { field: "unattempted", filter: "notContains", includes: ["yes"] },
      ],
    });
    expect(filterQuestions({ questions, topics: [], filter: spec, aggregates }).map((q) => q.id))
      .toEqual(["q2"]);
  });
});
