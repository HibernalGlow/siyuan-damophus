import { describe, expect, it } from "vitest";
import {
  applyNavOrder,
  moveBefore,
  orderByPreference,
  parseSettingsNavState,
} from "./settings-nav-state";

describe("settings nav state", () => {
  it("parses only well-formed stored state", () => {
    expect(parseSettingsNavState(undefined)).toEqual({});
    expect(parseSettingsNavState("nope")).toEqual({});
    expect(parseSettingsNavState({ categoryOrder: "nope", moduleOrder: { a: [1] } })).toEqual({});
    expect(parseSettingsNavState({
      sidebarExpanded: { study: false },
      categoryOrder: ["study", "core"],
      moduleOrder: { study: ["b", "a"] },
    })).toEqual({
      sidebarExpanded: { study: false },
      switchesExpanded: undefined,
      categoryOrder: ["study", "core"],
      moduleOrder: { study: ["b", "a"] },
    });
  });

  it("orders known ids by preference and appends unknown ids", () => {
    expect(orderByPreference(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
    expect(orderByPreference(["a", "b"], undefined)).toEqual(["a", "b"]);
    expect(orderByPreference(["a", "b"], ["x", "b"])).toEqual(["b", "a"]);
  });

  it("moves an id before the target or appends it", () => {
    expect(moveBefore(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveBefore(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
    expect(moveBefore(["a", "b"], "a", "a")).toEqual(["b", "a"]);
  });

  it("applies stored category and module order", () => {
    const ordered = applyNavOrder([
      { id: "core", groups: ["开关", "入口"] },
      { id: "study", groups: ["questionBank", "quickAttr"] },
    ], {
      categoryOrder: ["study", "core"],
      moduleOrder: { study: ["quickAttr", "questionBank"] },
    });
    expect(ordered.map((category) => category.id)).toEqual(["study", "core"]);
    expect(ordered[0]?.groups).toEqual(["quickAttr", "questionBank"]);
    expect(ordered[1]?.groups).toEqual(["开关", "入口"]);
  });
});
