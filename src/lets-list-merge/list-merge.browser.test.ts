import { describe, expect, it } from "vitest";
import { hasMixedListTypes, resolveListMergeSelection } from "./list-merge";

function list(id: string, subtype: "o" | "u" | "t"): HTMLElement {
  const element = document.createElement("div");
  element.dataset.nodeId = id;
  element.dataset.type = "NodeList";
  element.dataset.subtype = subtype;
  return element;
}

describe("resolveListMergeSelection", () => {
  it("accepts multiple lists and normalizes them to document order", () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    const first = list("first", "o");
    const second = list("second", "u");
    const third = list("third", "o");
    editor.append(first, second, third);
    document.body.append(editor);

    const selection = resolveListMergeSelection([third, second, first]);
    expect(selection).toEqual({
      lists: [
        { id: "first", subtype: "o" },
        { id: "second", subtype: "u" },
        { id: "third", subtype: "o" },
      ],
    });
    expect(hasMixedListTypes(selection!)).toBe(true);
    editor.remove();
  });

  it("requires at least two ordinary ordered or unordered lists", () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    const first = list("first", "u");
    const task = list("task", "t");
    editor.append(first, task);
    document.body.append(editor);

    expect(resolveListMergeSelection([first])).toBeUndefined();
    expect(resolveListMergeSelection([first, task])).toBeUndefined();
    editor.remove();
  });

  it("rejects lists from different editors and nested list selections", () => {
    const firstEditor = document.createElement("div");
    firstEditor.className = "protyle-wysiwyg";
    const secondEditor = document.createElement("div");
    secondEditor.className = "protyle-wysiwyg";
    const first = list("first", "u");
    const second = list("second", "o");
    firstEditor.append(first);
    secondEditor.append(second);
    document.body.append(firstEditor, secondEditor);
    expect(resolveListMergeSelection([first, second])).toBeUndefined();

    first.append(second);
    expect(resolveListMergeSelection([first, second])).toBeUndefined();
    firstEditor.remove();
    secondEditor.remove();
  });
});
