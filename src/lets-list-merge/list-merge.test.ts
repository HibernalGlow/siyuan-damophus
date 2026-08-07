import { describe, expect, it, vi } from "vitest";
import {
  createListMergePlan,
  mergeListBlocks,
  type ListMergeOperations,
  type ListMergeSelection,
} from "./list-merge";

function operations(children: Record<string, Array<{ id: string; type: string }>>): ListMergeOperations {
  return {
    getChildBlocks: vi.fn(async (id) => children[id] ?? []),
    moveBlock: vi.fn(async () => undefined),
    deleteBlock: vi.fn(async () => undefined),
  };
}

describe("createListMergePlan", () => {
  it("keeps the first list as target when every list already has the same type", () => {
    const selection: ListMergeSelection = {
      lists: [{ id: "first", subtype: "o" }, { id: "second", subtype: "o" }],
    };
    expect(createListMergePlan(selection, "u")).toEqual({
      targetId: "first",
      sourceIds: ["second"],
      orderedListIds: ["first", "second"],
      subtype: "o",
      reorderTargetItems: false,
    });
  });

  it("uses an existing requested-type list as the target for mixed selections", () => {
    const selection: ListMergeSelection = {
      lists: [
        { id: "first", subtype: "u" },
        { id: "second", subtype: "o" },
        { id: "third", subtype: "u" },
      ],
    };
    expect(createListMergePlan(selection)).toBeUndefined();
    expect(createListMergePlan(selection, "o")).toEqual({
      targetId: "second",
      sourceIds: ["first", "third"],
      orderedListIds: ["first", "second", "third"],
      subtype: "o",
      reorderTargetItems: true,
    });
  });
});

describe("mergeListBlocks", () => {
  it("appends source items in document order before deleting any source list", async () => {
    const calls: string[] = [];
    const ops = operations({
      target: [{ id: "target-item", type: "i" }],
      source: [{ id: "source-a", type: "i" }],
      third: [{ id: "third-a", type: "i" }],
    });
    vi.mocked(ops.moveBlock).mockImplementation(async (id, previousID, parentID) => {
      calls.push(`move:${id}:${previousID ?? ""}:${parentID ?? ""}`);
    });
    vi.mocked(ops.deleteBlock).mockImplementation(async (id) => {
      calls.push(`delete:${id}`);
    });

    await mergeListBlocks({
      targetId: "target",
      sourceIds: ["source", "third"],
      orderedListIds: ["target", "source", "third"],
      subtype: "o",
      reorderTargetItems: false,
    }, ops);
    expect(calls).toEqual([
      "move:source-a:target-item:",
      "move:third-a:source-a:",
      "delete:source",
      "delete:third",
    ]);
  });

  it("rebuilds item order inside a later target without rebuilding item DOM", async () => {
    const ops = operations({
      first: [{ id: "first-a", type: "i" }, { id: "first-b", type: "i" }],
      target: [{ id: "target-a", type: "i" }],
      third: [{ id: "third-a", type: "i" }],
    });
    await mergeListBlocks({
      targetId: "target",
      sourceIds: ["first", "third"],
      orderedListIds: ["first", "target", "third"],
      subtype: "o",
      reorderTargetItems: true,
    }, ops);
    expect(ops.moveBlock).toHaveBeenNthCalledWith(1, "first-a", undefined, "target");
    expect(ops.moveBlock).toHaveBeenNthCalledWith(2, "first-b", "first-a");
    expect(ops.moveBlock).toHaveBeenNthCalledWith(3, "target-a", "first-b");
    expect(ops.moveBlock).toHaveBeenNthCalledWith(4, "third-a", "target-a");
  });

  it("does not delete any source when a move fails", async () => {
    const ops = operations({
      target: [{ id: "target-a", type: "i" }],
      source: [{ id: "source-a", type: "i" }],
    });
    vi.mocked(ops.moveBlock).mockRejectedValueOnce(new Error("move failed"));
    await expect(mergeListBlocks({
      targetId: "target",
      sourceIds: ["source"],
      orderedListIds: ["target", "source"],
      subtype: "u",
      reorderTargetItems: false,
    }, ops)).rejects.toThrow("move failed");
    expect(ops.deleteBlock).not.toHaveBeenCalled();
  });

  it("validates every direct child before moving anything", async () => {
    const ops = operations({
      target: [{ id: "target-a", type: "i" }],
      source: [{ id: "paragraph", type: "p" }],
    });
    await expect(mergeListBlocks({
      targetId: "target",
      sourceIds: ["source"],
      orderedListIds: ["target", "source"],
      subtype: "u",
      reorderTargetItems: false,
    }, ops)).rejects.toThrow("unsupported direct child");
    expect(ops.moveBlock).not.toHaveBeenCalled();
    expect(ops.deleteBlock).not.toHaveBeenCalled();
  });
});
