import { describe, expect, it } from "vitest";
import { normalizePracticeDefaults, resolvePracticePreferences } from "./practice-preferences";

describe("practice preferences", () => {
  it("uses configured defaults when there is no remembered selection", () => {
    const defaults = normalizePracticeDefaults({
      order: "random",
      optionOrder: "source",
      filter: "review",
    });

    expect(resolvePracticePreferences(undefined, defaults)).toEqual(defaults);
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
      filter: "wrong",
    });
  });

  it("ignores invalid remembered and default values", () => {
    const defaults = normalizePracticeDefaults({ order: "unexpected", optionOrder: "source", filter: 42 });

    expect(resolvePracticePreferences({ order: "random", optionOrder: "unknown", filter: "due" }, defaults)).toEqual({
      order: "random",
      optionOrder: "source",
      filter: "due",
    });
  });
});
