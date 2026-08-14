import { describe, expect, it } from "vitest";
import { moveMenuEntry, orderPluginNames, parseMenuOrder } from "./menu-order";

describe("plugin menu order", () => {
  it("accepts only string-array preferences and appends new modules", () => {
    expect(parseMenuOrder(["b", "a"])).toEqual(["b", "a"]);
    expect(parseMenuOrder({})).toBeUndefined();
    expect(orderPluginNames(["a", "b", "c"], ["c", "a"])).toEqual(["c", "a", "b"]);
  });

  it("moves an entry one position while keeping boundary positions stable", () => {
    expect(moveMenuEntry(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveMenuEntry(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(moveMenuEntry(["a", "b"], "a", "up")).toEqual(["a", "b"]);
  });
});
