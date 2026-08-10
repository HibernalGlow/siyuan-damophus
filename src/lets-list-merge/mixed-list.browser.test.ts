import { describe, expect, it } from "vitest";
import type { ListMergeOperation } from "./list-merge";
import {
  applyMixedListDom,
  buildMixedListTransaction,
  createMixedListPlan,
  resolveMixedListSelection,
} from "./mixed-list";

function block(id: string, type = "NodeParagraph", text = id): HTMLElement {
  const element = document.createElement("div");
  element.dataset.nodeId = id;
  element.dataset.type = type;
  element.className = type === "NodeHeading" ? "h2" : "p";
  element.textContent = text;
  return element;
}

function list(id: string, subtype: "o" | "u", text: string): HTMLElement {
  const element = document.createElement("div");
  element.dataset.nodeId = id;
  element.dataset.type = "NodeList";
  element.dataset.subtype = subtype;
  element.className = "list";
  element.innerHTML = `<div data-marker="*" data-subtype="${subtype}" data-node-id="${id}-item" data-type="NodeListItem" class="li"><div class="protyle-action"></div><div data-node-id="${id}-p" data-type="NodeParagraph">${text}</div><div class="protyle-attr"></div></div><div class="protyle-attr"></div>`;
  return element;
}

function editorWith(...blocks: HTMLElement[]): HTMLElement {
  const editor = document.createElement("div");
  editor.className = "protyle-wysiwyg";
  editor.dataset.nodeId = "root";
  editor.append(...blocks);
  document.body.append(editor);
  return editor;
}

function replayOperations(root: HTMLElement, operations: ListMergeOperation[]): void {
  for (const operation of operations) {
    if (operation.action === "delete") {
      root.querySelector(`[data-node-id="${operation.id}"]`)?.remove();
    } else if (operation.action === "insert") {
      const next = root.querySelector(`[data-node-id="${operation.nextID}"]`);
      if (next) next.insertAdjacentHTML("beforebegin", operation.data!);
    } else if (operation.action === "move") {
      const current = root.querySelector(`[data-node-id="${operation.id}"]`);
      if (!current) continue;
      if (operation.previousID) {
        root.querySelector(`[data-node-id="${operation.previousID}"]`)?.after(current);
      } else {
        const parent = root.querySelector(`[data-node-id="${operation.parentID}"]`);
        const attr = parent?.querySelector(":scope > .protyle-attr");
        parent?.insertBefore(current, attr ?? null);
      }
    }
  }
}

describe("mixed block list", () => {
  it("turns non-list blocks into top-level items and keeps following lists nested", () => {
    const title = block("title", "NodeHeading", "Title");
    const details = list("details", "u", "Detail");
    const note = block("note", "NodeParagraph", "Note");
    const steps = list("steps", "o", "Step");
    const editor = editorWith(title, details, note, steps);
    const selection = resolveMixedListSelection([steps, note, details, title])!;
    const ids = ["item-title", "item-note", "outer"][Symbol.iterator]();
    const plan = createMixedListPlan(selection, "o", () => ids.next().value!);

    expect(plan).toEqual({
      outerListId: "outer",
      subtype: "o",
      items: [
        { id: "item-title", blockIds: ["title", "details"] },
        { id: "item-note", blockIds: ["note", "steps"] },
      ],
    });
    const transaction = buildMixedListTransaction(plan, selection, "root");
    expect(transaction.doOperations).toEqual([
      expect.objectContaining({ action: "insert", id: "outer", nextID: "title", parentID: "root" }),
      { action: "move", id: "title", parentID: "item-title" },
      { action: "move", id: "details", previousID: "title" },
      { action: "move", id: "note", parentID: "item-note" },
      { action: "move", id: "steps", previousID: "note" },
    ]);

    applyMixedListDom(plan, selection);
    const topItems = editor.querySelectorAll<HTMLElement>(":scope > [data-node-id='outer'] > [data-type='NodeListItem']");
    expect(topItems).toHaveLength(2);
    expect(Array.from(topItems[0].children).map((child) => (child as HTMLElement).dataset.nodeId ?? child.className))
      .toEqual(["protyle-action protyle-action--order", "title", "details", "protyle-attr"]);
    expect(details.dataset.subtype).toBe("u");
    expect(steps.dataset.subtype).toBe("o");
    expect(editor.querySelector('[data-node-id="details-item"]')).not.toBeNull();

    replayOperations(editor, transaction.undoOperations);
    expect(Array.from(editor.children).map((child) => (child as HTMLElement).dataset.nodeId))
      .toEqual(["title", "details", "note", "steps"]);

    replayOperations(editor, transaction.doOperations);
    expect(editor.querySelectorAll(":scope > [data-type='NodeList']")).toHaveLength(1);
    expect(editor.querySelector('[data-node-id="item-title"] > [data-node-id="details"]')).not.toBeNull();
    editor.remove();
  });

  it("rejects ambiguous leading lists, gaps, and list-only selections", () => {
    const leading = list("leading", "u", "Leading");
    const title = block("title");
    const gap = block("gap");
    const nested = list("nested", "o", "Nested");
    const editor = editorWith(leading, title, gap, nested);

    expect(resolveMixedListSelection([leading, title])).toBeUndefined();
    expect(resolveMixedListSelection([title, nested])).toBeUndefined();
    expect(resolveMixedListSelection([leading, nested])).toBeUndefined();
    editor.remove();
  });
});
