import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRACTICE_PREFERENCES,
  normalizePracticeDefaults,
  resolvePracticePreferences,
} from "./practice-preferences";

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

  it("preserves a normalized condition tree as the remembered filter", () => {
    const filter = {
      glue: "and",
      rules: [
        { field: "bookmarked", type: "tuple", filter: "equal", value: "yes" },
        { field: "wrong", type: "tuple", filter: "equal", value: "no" },
      ],
    };

    expect(resolvePracticePreferences({ filter }, DEFAULT_PRACTICE_PREFERENCES).filter).toEqual(filter);
  });

  it("normalizes and restores multiple named filter presets", () => {
    const preferences = resolvePracticePreferences({
      presets: [
        { id: "favorites", name: " Favorites ", filter: "bookmarked" },
        { id: "favorites", name: "Needs review", filter: "review" },
      ],
      activePresetId: "favorites",
      filter: "all",
    }, DEFAULT_PRACTICE_PREFERENCES);

    expect(preferences.presets).toHaveLength(2);
    expect(preferences.presets?.[0]).toMatchObject({ id: "favorites", name: "Favorites", filter: "bookmarked" });
    expect(preferences.presets?.[1].id).toBe("favorites-2");
    expect(preferences.filter).toBe("bookmarked");
    expect(preferences.activePresetId).toBe("favorites");
  });
});
