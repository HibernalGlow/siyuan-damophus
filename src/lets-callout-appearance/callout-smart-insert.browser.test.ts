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
  const textNode = caretBlock.firstChild!;
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
    ["list", '<div data-node-id="target" data-type="NodeList"><div data-node-id="item" data-type="NodeListItem"><div data-node-id="item-p" data-type="NodeParagraph" contenteditable="true">Item</div></div></div>'],
  ])("moves the following %s into the Callout", (_label, target) => {
    const editor = createEditor(
      `<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout<div class="protyle-attr" contenteditable="false"></div></div>${target}`,
    );
    const before = editor.root.innerHTML;

    runCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("slash");
    expect(callout.dataset.type).toBe("NodeCallout");
    expect(callout.dataset.subtype).toBe("NOTE");
    expect(callout.querySelector(":scope > .callout-content > [data-node-id=target]")).not.toBeNull();
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);

    const [doOperations, undoOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations.map((operation) => operation.action)).toEqual(["update", "move"]);
    expect(undoOperations.map((operation) => operation.action)).toEqual(["move", "update"]);
    applyOperations(editor.root, undoOperations);
    expect(editor.root.innerHTML).toBe(before);
  });

  it("wraps the current block when text remains after the slash query", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/calloutExisting text<div class="protyle-attr" contenteditable="false"></div></div>',
    );
    const before = editor.root.innerHTML;

    runCallout(editor);

    const callout = editor.root.firstElementChild as HTMLElement;
    expect(callout.dataset.nodeId).toBe("new-callout-1");
    expect(callout.querySelector<HTMLElement>(":scope > .callout-content > [data-node-id=slash]")?.firstChild?.textContent)
      .toBe("Existing text");
    expect(editor.transaction).toHaveBeenCalledTimes(1);
    const [doOperations, undoOperations] = editor.transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations.map((operation) => operation.action)).toEqual(["insert", "update", "move"]);
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
    expect(callout.querySelector(":scope > .callout-content > [data-node-id=target]")).not.toBeNull();
    expect(editor.originalFill).not.toHaveBeenCalled();
    expect(editor.transaction).toHaveBeenCalledTimes(1);
  });

  it("falls back to native empty Callout insertion at the end of a document", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout<div class="protyle-attr" contenteditable="false"></div></div>',
    );

    runCallout(editor);

    expect(editor.originalFill).toHaveBeenCalledOnce();
    expect(editor.transaction).not.toHaveBeenCalled();
  });

  it("falls back when the following block cannot be a Callout child", () => {
    const editor = createEditor(
      '<div data-node-id="slash" data-type="NodeParagraph" contenteditable="true">/callout</div><div data-node-id="target" data-type="NodeListItem">Item</div>',
    );

    runCallout(editor);

    expect(editor.originalFill).toHaveBeenCalledOnce();
    expect(editor.transaction).not.toHaveBeenCalled();
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
