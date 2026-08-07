import { describe, expect, it } from "vitest";
import {
  createListMergePlan,
  type ListMergeSelection,
} from "./list-merge";
import pluginMetadata from "./plugin";

describe("list merge settings", () => {
  it("registers an independent module setting for the mixed-list default", () => {
    expect(pluginMetadata.settings).toEqual([
      expect.objectContaining({
        key: "defaultMixedSubtype",
        type: "select",
        value: "o",
        options: {
          o: "lets-list-merge.defaultMixedSubtypeOrdered",
          u: "lets-list-merge.defaultMixedSubtypeUnordered",
        },
      }),
    ]);
  });
});

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
