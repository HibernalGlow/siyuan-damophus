import { describe, expect, it } from "vitest";
import {
  applyListMergeDom,
  buildListMergeTransaction,
  createListMergePlan,
  hasMixedListTypes,
  resolveListMergeSelection,
  type ListMergeOperation,
} from "./list-merge";

function item(id: string, subtype: "o" | "u", marker: string, text: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.nodeId = id;
  element.dataset.type = "NodeListItem";
  element.dataset.subtype = subtype;
  element.dataset.marker = marker;
  element.className = "li";
  element.innerHTML = subtype === "o"
    ? `<div class="protyle-action protyle-action--order">${marker}</div><div data-node-id="${id}-p" data-type="NodeParagraph">${text}</div><div class="protyle-attr"></div>`
    : `<div class="protyle-action"><svg><use xlink:href="#iconDot"></use></svg></div><div data-node-id="${id}-p" data-type="NodeParagraph">${text}</div><div class="protyle-attr"></div>`;
  return element;
}

function list(
  id: string,
  subtype: "o" | "u" | "t",
  items: HTMLElement[] = [],
): HTMLElement {
  const element = document.createElement("div");
  element.dataset.nodeId = id;
  element.dataset.type = "NodeList";
  element.dataset.subtype = subtype;
  element.className = "list";
  element.append(...items, Object.assign(document.createElement("div"), { className: "protyle-attr" }));
  return element;
}

function replayOperations(root: HTMLElement, operations: ListMergeOperation[]): void {
  for (const operation of operations) {
    if (operation.action === "delete") {
      root.querySelector(`[data-node-id="${operation.id}"]`)?.remove();
      continue;
    }
    if (operation.action === "update") {
      const current = root.querySelector(`[data-node-id="${operation.id}"]`);
      if (current) current.outerHTML = operation.data!;
      continue;
    }
    if (operation.action === "insert") {
      if (operation.nextID) {
        root.querySelector(`[data-node-id="${operation.nextID}"]`)?.insertAdjacentHTML("beforebegin", operation.data!);
      } else if (operation.previousID) {
        root.querySelector(`[data-node-id="${operation.previousID}"]`)?.insertAdjacentHTML("afterend", operation.data!);
      } else {
        root.querySelector(`[data-node-id="${operation.parentID}"]`)?.insertAdjacentHTML("afterbegin", operation.data!);
      }
      continue;
    }
    const current = root.querySelector(`[data-node-id="${operation.id}"]`);
    if (!current) continue;
    if (operation.previousID) {
      root.querySelector(`[data-node-id="${operation.previousID}"]`)?.after(current);
    } else {
      const parent = root.querySelector(`[data-node-id="${operation.parentID}"]`);
      const attr = parent && Array.from(parent.children).find((child) => child.classList.contains("protyle-attr"));
      parent?.insertBefore(current, attr ?? parent.firstElementChild);
    }
  }
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
    expect(selection?.lists.map(({ id, subtype }) => ({ id, subtype }))).toEqual([
      { id: "first", subtype: "o" },
      { id: "second", subtype: "u" },
      { id: "third", subtype: "o" },
    ]);
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

describe("buildListMergeTransaction", () => {
  it("renumbers ordered items continuously and creates a complete undo transaction", () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    const target = list("target", "o", [
      item("target-1", "o", "1.", "A"),
      item("target-2", "o", "2.", "B"),
    ]);
    const source = list("source", "o", [
      item("source-1", "o", "1.", "C"),
      item("source-2", "o", "2.", "D"),
    ]);
    editor.append(target, source);
    document.body.append(editor);
    const selection = resolveListMergeSelection([target, source])!;
    const transaction = buildListMergeTransaction(createListMergePlan(selection)!, selection, "root");

    expect(transaction.doOperations.slice(0, 2)).toEqual([
      { action: "move", id: "source-1", previousID: "target-2" },
      { action: "move", id: "source-2", previousID: "source-1" },
    ]);
    const updates = transaction.doOperations.filter((operation) => operation.action === "update");
    expect(updates.map((operation) => {
      const dom = new DOMParser().parseFromString(operation.data!, "text/html").body.firstElementChild as HTMLElement;
      return [dom.dataset.marker, dom.querySelector(":scope > .protyle-action")?.textContent];
    })).toEqual([["1.", "1."], ["2.", "2."], ["3.", "3."], ["4.", "4."]]);
    expect(transaction.doOperations.at(-1)).toEqual({ action: "delete", id: "source" });

    expect(transaction.undoOperations[0]).toMatchObject({ action: "insert", id: "source", previousID: "target" });
    expect(transaction.undoOperations[0].data).not.toContain("NodeListItem");
    expect(transaction.undoOperations.slice(1, 3)).toEqual([
      { action: "move", id: "source-1", parentID: "source" },
      { action: "move", id: "source-2", previousID: "source-1" },
    ]);
    const restoredSource = transaction.undoOperations.find((operation) => operation.id === "source-1" && operation.action === "update");
    expect(restoredSource?.data).toContain('data-marker="1."');

    applyListMergeDom(createListMergePlan(selection)!, selection);
    expect(editor.querySelector('[data-node-id="source"]')).toBeNull();
    expect(Array.from(target.querySelectorAll<HTMLElement>(":scope > [data-type='NodeListItem']")).map((element) => (
      element.dataset.marker
    ))).toEqual(["1.", "2.", "3.", "4."]);

    replayOperations(editor, transaction.undoOperations);
    const restoredLists = editor.querySelectorAll<HTMLElement>(":scope > [data-type='NodeList']");
    expect(Array.from(restoredLists).map((restored) => (
      Array.from(restored.querySelectorAll<HTMLElement>(":scope > [data-type='NodeListItem']"))
        .map((element) => element.dataset.marker)
    ))).toEqual([["1.", "2."], ["1.", "2."]]);

    replayOperations(editor, transaction.doOperations);
    const redoneLists = editor.querySelectorAll<HTMLElement>(":scope > [data-type='NodeList']");
    expect(redoneLists).toHaveLength(1);
    expect(Array.from(redoneLists[0].querySelectorAll<HTMLElement>(":scope > [data-type='NodeListItem']"))
      .map((element) => element.dataset.marker)).toEqual(["1.", "2.", "3.", "4."]);
    editor.remove();
  });

  it("normalizes mixed items to unordered markers without losing their content", () => {
    const editor = document.createElement("div");
    editor.className = "protyle-wysiwyg";
    const ordered = list("ordered", "o", [item("ordered-1", "o", "1.", "Ordered")]);
    const unordered = list("unordered", "u", [item("unordered-1", "u", "*", "Unordered")]);
    editor.append(ordered, unordered);
    document.body.append(editor);
    const selection = resolveListMergeSelection([ordered, unordered])!;
    const transaction = buildListMergeTransaction(
      createListMergePlan(selection, "u")!,
      selection,
      "root",
    );
    const updates = transaction.doOperations.filter((operation) => operation.action === "update");
    for (const operation of updates) {
      expect(operation.data).toContain('data-subtype="u"');
      expect(operation.data).toContain('data-marker="*"');
      expect(operation.data).toContain("#iconDot");
    }
    expect(updates[0].data).toContain("Ordered");
    expect(updates[1].data).toContain("Unordered");
    editor.remove();
  });
});
