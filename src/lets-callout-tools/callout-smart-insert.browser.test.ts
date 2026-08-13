import { afterEach, describe, expect, it, vi } from "vitest";
import type { IOperation, IProtyle } from "siyuan";
import {
  CalloutSmartInsert,
  parseNativeCalloutValue,
  type CalloutSmartInsertRuntime,
} from "./callout-smart-insert";

const CARET = "|CARET|";
const NOTE_VALUE = `> [!NOTE]\n> ${CARET}`;

interface TestEditor {
  controller: CalloutSmartInsert;
  hint: {
    element: HTMLElement;
    fill: (value: string, protyle: IProtyle, updateRange?: boolean, refIsS?: boolean) => void;
    lastIndex: number;
    splitChar: string;
  };
  originalFill: ReturnType<typeof vi.fn>;
  protyle: IProtyle;
  root: HTMLElement;
  transaction: ReturnType<typeof vi.fn>;
}

function createRuntime(): CalloutSmartInsertRuntime {
  let index = 0;
  return {
    caret: CARET,
    newNodeId: () => `new-callout-${++index}`,
  };
}

function calloutHtml(value: string): string {
  const type = value.match(/\[!([A-Z]+)\]/)?.[1] ?? "NOTE";
  return `<div class="callout" data-node-id="generated" data-type="NodeCallout" data-subtype="${type}" contenteditable="false">
    <div class="callout-info"><span class="callout-icon">icon</span><span class="callout-title">${type}</span></div>
    <div class="callout-content"><div data-node-id="generated-child" data-type="NodeParagraph"></div></div>
    <div class="protyle-attr" contenteditable="false"></div>
  </div>`;
}

function createEditor(blocks: string, caretBlockId = "slash", caretOffset = "/callout".length): TestEditor {
  const host = document.createElement("div");
  const toolbar = document.createElement("div");
  const hintElement = document.createElement("div");
  const root = document.createElement("div");
  root.className = "protyle-wysiwyg";
  root.innerHTML = blocks;
  host.append(toolbar, hintElement, root);
  document.body.append(host);

  const caretBlock = root.querySelector<HTMLElement>(`[data-node-id="${caretBlockId}"]`)!;
  const editable = caretBlock.matches('[contenteditable="true"]')
    ? caretBlock
    : caretBlock.querySelector<HTMLElement>(":scope > [contenteditable=\"true\"]")!;
  const textNode = editable.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, caretOffset);
  range.collapse(true);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  const originalFill = vi.fn();
  const transaction = vi.fn();
  const instance = { transaction };
  const hint = {
    element: hintElement,
    fill: originalFill,
    lastIndex: 0,
    splitChar: "/",
  };
  const protyle = {
    block: { parentID: "document-root" },
    element: host,
    getInstance: () => instance,
    hint,
    lute: { SpinBlockDOM: calloutHtml },
    toolbar: { element: toolbar, range },
    wysiwyg: { element: root },
  } as unknown as IProtyle;
  const controller = new CalloutSmartInsert(createRuntime());
  controller.attach(protyle);
  return { controller, hint, originalFill, protyle, root, transaction };
}

function runCallout(editor: TestEditor, value = NOTE_VALUE): void {
  editor.hint.fill(value, editor.protyle, true);
}

function clickCallout(editor: TestEditor, value = NOTE_VALUE): void {
  const menuButton = document.createElement("button");
  menuButton.textContent = "Callout";
  editor.hint.element.append(menuButton);
  const menuRange = document.createRange();
  menuRange.selectNodeContents(menuButton);
  menuRange.collapse(false);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(menuRange);
  editor.hint.fill(value, editor.protyle, false);
}

function setSavedRange(editor: TestEditor, container: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(container, offset);
  range.collapse(true);
  editor.protyle.toolbar!.range = range;
}

function operationElement(root: HTMLElement, id: string | undefined): HTMLElement | null {
  return id ? root.querySelector<HTMLElement>(`[data-node-id="${id}"]`) : null;
}

function applyOperations(root: HTMLElement, operations: IOperation[]): void {
  for (const operation of operations) {
    if (operation.action === "move") {
      const element = operationElement(root, operation.id)!;
      const parent = operation.parentID === "document-root"
        ? root
        : operationElement(root, operation.parentID)!;
      const content = parent.dataset.type === "NodeCallout"
        ? parent.querySelector<HTMLElement>(":scope > .callout-content")!
        : parent;
      const previous = operationElement(root, operation.previousID);
      if (previous?.parentElement === content) previous.after(element);
      else if (previous === parent) parent.after(element);
      else content.prepend(element);
      continue;
    }
    if (operation.action === "update") {
      const current = operationElement(root, operation.id)!;
      const host = document.createElement("div");
      host.innerHTML = operation.data as string;
      current.replaceWith(host.firstElementChild!);
      continue;
    }
    if (operation.action === "delete") operationElement(root, operation.id)?.remove();
  }
}

afterEach(() => {
  document.body.replaceChildren();
  document.getSelection()?.removeAllRanges();
});

describe("smart Callout insertion", () => {
  it("recognizes only the five native Callout slash values", () => {
    expect(parseNativeCalloutValue(NOTE_VALUE, CARET)).toBe("NOTE");
    expect(parseNativeCalloutValue(`> [!CAUTION]\n> ${CARET}`, CARET)).toBe("CAUTION");
    expect(parseNativeCalloutValue(`> [!CUSTOM]\n> ${CARET}`, CARET)).toBeUndefined();
    expect(parseNativeCalloutValue("> [!NOTE]\n> body", CARET)).toBeUndefined();
  });

  it.each([
    ["paragraph", '<div data-node-id="target" data-type="NodeParagraph" contenteditable="true">Body</div>'],
    ["heading", '<div data-node-id="target" data-type="NodeHeading" contenteditable="true">Heading</div>'],
  ])("creates an empty body without absorbing the following %s", (_label, target) => {
    const editor = createEditor(
      `<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout<div class="protyle-attr" contenteditable="false"></div></div>${target}`,
    );
    const before = editor.root.innerHTML;

    runCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("slash");
    expect(callout.dataset.type).toBe("NodeCallout");
    expect(callout.dataset.subtype).toBe("NOTE");
    const emptyParagraph = callout.querySelector<HTMLElement>(
      ":scope > .callout-content > [data-node-id=new-callout-1]",
    );
    expect(emptyParagraph?.querySelector('[contenteditable="true"] > wbr')).not.toBeNull();
    expect(document.getSelection()?.anchorNode).toBe(emptyParagraph?.querySelector('[contenteditable="true"]'));
    expect(callout.querySelector("[data-node-id=target]")).toBeNull();
    expect(callout.nextElementSibling?.getAttribute("data-node-id")).toBe("target");
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);

    const [doOperations, undoOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations).toEqual([
      expect.objectContaining({ action: "update", id: "slash" }),
      expect.objectContaining({ action: "insert", id: "new-callout-1", parentID: "slash" }),
    ]);
    expect(doOperations.some((operation) => operation.id === "target")).toBe(false);
    expect(undoOperations.map((operation) => operation.action)).toEqual(["delete", "update"]);
    applyOperations(editor.root, undoOperations);
    expect(editor.root.innerHTML).toBe(before);
  });

  it("wraps the current block when text remains after the slash query", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/calloutExisting text<div class="protyle-attr" contenteditable="false"></div></div><div data-node-id="following" data-type="NodeHeading" contenteditable="true">Following heading</div>',
    );
    const before = editor.root.innerHTML;

    runCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("new-callout-1");
    expect(callout.querySelector<HTMLElement>(":scope > .callout-content > [data-node-id=slash]")?.firstChild?.textContent)
      .toBe("Existing text");
    expect(callout.querySelector("[data-node-id=following]")).toBeNull();
    expect(callout.nextElementSibling?.getAttribute("data-node-id")).toBe("following");
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations, undoOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations.map((operation) => operation.action)).toEqual(["insert", "update", "move"]);
    expect(doOperations.some((operation) => operation.id === "following")).toBe(false);
    expect(undoOperations.map((operation) => operation.action)).toEqual(["move", "update", "delete"]);
    applyOperations(editor.root, undoOperations);
    expect(editor.root.innerHTML).toBe(before);
  });

  it("removes the slash when a menu click arrives without a hint index", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/<div class="protyle-attr" contenteditable="false"></div></div><div data-node-id="target" data-type="NodeParagraph" contenteditable="true">Body</div>',
      "slash",
      1,
    );
    editor.hint.lastIndex = -1;

    clickCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("slash");
    expect(callout.textContent).not.toContain("/");
    expect(callout.querySelector(
      ':scope > .callout-content > [data-node-id=new-callout-1] [contenteditable="true"] > wbr',
    )).not.toBeNull();
    expect(callout.querySelector("[data-node-id=target]")).toBeNull();
    expect(callout.nextElementSibling?.getAttribute("data-node-id")).toBe("target");
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
  });

  it("removes a slash query split across adjacent text nodes", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout<div class="protyle-attr" contenteditable="false"></div></div><div data-node-id="target" data-type="NodeParagraph" contenteditable="true">Body</div>',
    );
    const block = editor.root.querySelector<HTMLElement>('[data-node-id="slash"]')!;
    const query = block.firstChild as Text;
    const suffix = query.splitText(1);
    setSavedRange(editor, suffix, suffix.data.length);
    editor.hint.lastIndex = 0;

    clickCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("slash");
    expect(callout.textContent).not.toContain("/");
    expect(callout.querySelector(
      ':scope > .callout-content > [data-node-id=new-callout-1] [contenteditable="true"] > wbr',
    )).not.toBeNull();
    expect(callout.querySelector("[data-node-id=target]")).toBeNull();
    expect(callout.nextElementSibling?.getAttribute("data-node-id")).toBe("target");
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
  });

  it("removes the slash when the saved caret is on the editable container", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph"><div contenteditable="true"><span>/callout</span></div><div class="protyle-attr" contenteditable="false"></div></div><div data-node-id="target" data-type="NodeParagraph" contenteditable="true">Body</div>',
      "slash",
      0,
    );
    const editable = editor.root.querySelector<HTMLElement>(
      '[data-node-id="slash"] > [contenteditable="true"]',
    )!;
    setSavedRange(editor, editable, editable.childNodes.length);
    editor.hint.lastIndex = -1;

    clickCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("slash");
    expect(callout.textContent).not.toContain("/");
    expect(callout.querySelector(
      ':scope > .callout-content > [data-node-id=new-callout-1] [contenteditable="true"] > wbr',
    )).not.toBeNull();
    expect(callout.querySelector("[data-node-id=target]")).toBeNull();
    expect(callout.nextElementSibling?.getAttribute("data-node-id")).toBe("target");
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
  });

  it("creates an editable empty body when inserting at the end of a document", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout<div class="protyle-attr" contenteditable="false"></div></div>',
    );
    const before = editor.root.innerHTML;

    runCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    const emptyParagraph = callout.querySelector<HTMLElement>(
      ":scope > .callout-content > [data-type=NodeParagraph]",
    );
    expect(callout.dataset.nodeId).toBe("slash");
    expect(emptyParagraph?.dataset.nodeId).toBe("new-callout-1");
    expect(emptyParagraph?.querySelector('[contenteditable="true"] > wbr')).not.toBeNull();
    expect(document.getSelection()?.anchorNode).toBe(emptyParagraph?.querySelector('[contenteditable="true"]'));
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations, undoOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations).toEqual([
      expect.objectContaining({ action: "update", id: "slash" }),
      expect.objectContaining({
        action: "insert",
        id: "new-callout-1",
        parentID: "slash",
      }),
    ]);
    expect(undoOperations).toEqual([
      expect.objectContaining({ action: "delete", id: "new-callout-1" }),
      expect.objectContaining({ action: "update", id: "slash" }),
    ]);
    applyOperations(editor.root, undoOperations);
    expect(editor.root.innerHTML).toBe(before);
  });

  it("creates the empty Callout body inside a list item without moving adjacent items", () => {
    const editor = createEditor(`
      <div data-node-id="list" data-type="NodeList" class="list">
        <div data-node-id="item-1" data-type="NodeListItem" class="li">
          <div class="protyle-action"></div>
          <div data-node-id="slash" data-type="NodeParagraph" class="p">
            <div contenteditable="true">/callout</div>
            <div class="protyle-attr" contenteditable="false"></div>
          </div>
          <div class="protyle-attr" contenteditable="false"></div>
        </div>
        <div data-node-id="item-2" data-type="NodeListItem" class="li">
          <div class="protyle-action"></div>
          <div data-node-id="item-2-p" data-type="NodeParagraph" class="p">
            <div contenteditable="true">Second item</div>
            <div class="protyle-attr" contenteditable="false"></div>
          </div>
          <div class="protyle-attr" contenteditable="false"></div>
        </div>
        <div class="protyle-attr" contenteditable="false"></div>
      </div>
    `);

    runCallout(editor);

    const firstItem = editor.root.querySelector<HTMLElement>('[data-node-id="item-1"]')!;
    const secondItem = editor.root.querySelector<HTMLElement>('[data-node-id="item-2"]')!;
    const callout = firstItem.querySelector<HTMLElement>(":scope > [data-type=NodeCallout]")!;
    const emptyParagraph = callout.querySelector<HTMLElement>(
      ":scope > .callout-content > [data-type=NodeParagraph]",
    );
    expect(callout.dataset.nodeId).toBe("slash");
    expect(emptyParagraph?.dataset.nodeId).toBe("new-callout-1");
    expect(emptyParagraph?.querySelector('[contenteditable="true"] > wbr')).not.toBeNull();
    expect(secondItem.parentElement?.dataset.nodeId).toBe("list");
    expect(secondItem.textContent).toContain("Second item");
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations, undoOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations).toEqual([
      expect.objectContaining({ action: "update", id: "slash" }),
      expect.objectContaining({ action: "insert", id: "new-callout-1", parentID: "slash" }),
    ]);
    expect(undoOperations).toEqual([
      expect.objectContaining({ action: "delete", id: "new-callout-1" }),
      expect.objectContaining({ action: "update", id: "slash" }),
    ]);
  });

  it("keeps a child ordered list outside an empty Callout", () => {
    const editor = createEditor(`
      <div data-node-id="list" data-type="NodeList" class="list">
        <div data-node-id="item-1" data-type="NodeListItem" class="li">
          <div class="protyle-action"></div>
          <div data-node-id="slash" data-type="NodeParagraph" class="p">
            <div contenteditable="true">/callout</div>
            <div class="protyle-attr" contenteditable="false"></div>
          </div>
          <div data-node-id="child-list" data-type="NodeList" data-subtype="o" class="list">
            <div data-node-id="child-item" data-type="NodeListItem" data-subtype="o" class="li">
              <div class="protyle-action">1.</div>
              <div data-node-id="child-p" data-type="NodeParagraph" class="p">
                <div contenteditable="true">Child item</div>
                <div class="protyle-attr" contenteditable="false"></div>
              </div>
              <div class="protyle-attr" contenteditable="false"></div>
            </div>
            <div class="protyle-attr" contenteditable="false"></div>
          </div>
          <div class="protyle-attr" contenteditable="false"></div>
        </div>
        <div class="protyle-attr" contenteditable="false"></div>
      </div>
    `);

    runCallout(editor);

    const item = editor.root.querySelector<HTMLElement>('[data-node-id="item-1"]')!;
    const callout = item.querySelector<HTMLElement>(":scope > [data-type=NodeCallout]")!;
    const childList = item.querySelector<HTMLElement>(':scope > [data-node-id="child-list"]')!;
    expect(callout.querySelector(":scope > .callout-content > [data-type=NodeParagraph]")).not.toBeNull();
    expect(callout.querySelector('[data-node-id="child-list"]')).toBeNull();
    expect(childList.previousElementSibling).toBe(callout);
    expect(childList.textContent).toContain("Child item");
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations).toEqual([
      expect.objectContaining({ action: "update", id: "slash" }),
      expect.objectContaining({ action: "insert", id: "new-callout-1", parentID: "slash" }),
    ]);
  });

  it("keeps a top-level list outside an empty Callout", () => {
    const editor = createEditor(`
      <div data-node-id="slash" data-type="NodeParagraph" class="p">
        <div contenteditable="true">/callout</div>
        <div class="protyle-attr" contenteditable="false"></div>
      </div>
      <div data-node-id="list" data-type="NodeList" class="list">
        <div data-node-id="item" data-type="NodeListItem" class="li">
          <div class="protyle-action">1.</div>
          <div data-node-id="item-p" data-type="NodeParagraph" class="p">
            <div contenteditable="true">List item</div>
            <div class="protyle-attr" contenteditable="false"></div>
          </div>
          <div class="protyle-attr" contenteditable="false"></div>
        </div>
        <div class="protyle-attr" contenteditable="false"></div>
      </div>
    `);

    runCallout(editor);

    const callout = editor.root.querySelector<HTMLElement>(":scope > [data-type=NodeCallout]")!;
    const list = editor.root.querySelector<HTMLElement>(':scope > [data-node-id="list"]')!;
    expect(callout.querySelector(":scope > .callout-content > [data-type=NodeParagraph]")).not.toBeNull();
    expect(callout.querySelector('[data-node-id="list"]')).toBeNull();
    expect(list.previousElementSibling).toBe(callout);
    expect(list.textContent).toContain("List item");
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations).toEqual([
      expect.objectContaining({ action: "update", id: "slash" }),
      expect.objectContaining({ action: "insert", id: "new-callout-1", parentID: "slash" }),
    ]);
  });

  it("keeps a following list item outside the Callout", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout</div><div data-node-id="target" data-type="NodeListItem">Item</div>',
    );

    runCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("slash");
    expect(callout.querySelector("[data-node-id=target]")).toBeNull();
    expect(callout.nextElementSibling?.getAttribute("data-node-id")).toBe("target");
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations] = editor.transaction.mock.calls[0] as [IOperation[]];
    expect(doOperations.some((operation) => operation.id === "target")).toBe(false);
  });

  it("restores the original hint fill when disabled or disposed", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout</div>',
    );

    editor.controller.detach(editor.protyle);
    expect(editor.hint.fill).toBe(editor.originalFill);
    runCallout(editor);
    expect(editor.originalFill).toHaveBeenCalledOnce();

    editor.controller.attach(editor.protyle);
    expect(editor.hint.fill).not.toBe(editor.originalFill);
    editor.controller.dispose();
    expect(editor.hint.fill).toBe(editor.originalFill);
  });
});
