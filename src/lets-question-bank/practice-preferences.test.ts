import { describe, expect, it } from "vitest";
import { normalizePracticeFilterSpec } from "@/question-bank/core/filter-spec";
import { normalizePracticeDefaults, resolvePracticePreferences } from "./practice-preferences";

describe("practice preferences", () => {
  it("uses configured defaults when there is no remembered selection", () => {
    const defaults = normalizePracticeDefaults({
      order: "random",
      optionOrder: "source",
      filter: "review",
    });

    expect(resolvePracticePreferences(undefined, defaults)).toEqual(defaults);
    expect(defaults.filter).toEqual(normalizePracticeFilterSpec("review"));
  });

  it("gives each remembered selection priority over its configured default", () => {
    const defaults = normalizePracticeDefaults({
      order: "sequential",
      optionOrder: "random",
      filter: "all",
    });

    expect(resolvePracticePreferences({ order: "random", filter: "wrong" }, defaults)).toEqual({
      order: "random",
      optionOrder: "random",
      filter: normalizePracticeFilterSpec("wrong"),
    });
  });

  it("keeps remembered condition trees and restores legacy bookmarked strings", () => {
    const defaults = normalizePracticeDefaults({ filter: "all" });
    const remembered = {
      order: "random",
      optionOrder: "random",
      filter: {
        glue: "and",
        rules: [
          { field: "bookmarked", type: "tuple", filter: "contains", includes: ["yes"] },
          { field: "wrong", type: "tuple", filter: "notContains", includes: ["yes"] },
        ],
      },
    };

    expect(resolvePracticePreferences(remembered, defaults)).toEqual({
      order: "random",
      optionOrder: "random",
      filter: normalizePracticeFilterSpec(remembered.filter),
    });
  });

  it("ignores invalid remembered and default values", () => {
    const defaults = normalizePracticeDefaults({ order: "unexpected", optionOrder: "source", filter: 42 });

    expect(defaults.filter).toEqual({});
    expect(resolvePracticePreferences({ order: "random", optionOrder: "unknown", filter: "due" }, defaults)).toEqual({
      order: "random",
      optionOrder: "source",
      filter: normalizePracticeFilterSpec("due"),
    });
  });
});
