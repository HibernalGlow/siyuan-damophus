import { afterEach, describe, expect, it, vi } from "vitest";
import type { IOperation, IProtyle } from "siyuan";
import {
  CALLOUT_TYPE_DEFINITIONS,
  convertBlocksToCallout,
  createCalloutConversionPlan,
} from "./callout-conversion";

function render(html: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "protyle-wysiwyg";
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

function createProtyle(root: HTMLElement) {
  const transaction = vi.fn();
  const instance = { transaction };
  const protyle = {
    block: { parentID: "document-root" },
    disabled: false,
    element: root,
    getInstance: () => instance,
    wysiwyg: { element: root },
  } as unknown as IProtyle;
  return { protyle, transaction };
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
      else if (parent.dataset.type === "NodeListItem") {
        const firstBlock = Array.from(parent.children).find(
          (child) => child instanceof HTMLElement && child.dataset.nodeId,
        );
        if (firstBlock) firstBlock.before(element);
        else parent.querySelector(":scope > .protyle-attr")?.before(element);
      }
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

afterEach(() => document.body.replaceChildren());

describe("Callout block conversion", () => {
  it("wraps consecutive blocks in the selected type with one reversible transaction", () => {
    const root = render(`
      <div data-node-id="before" data-type="NodeParagraph">Before</div>
      <div data-node-id="p" data-type="NodeParagraph">Paragraph</div>
      <div data-node-id="h" data-type="NodeHeading">Heading</div>
      <div data-node-id="after" data-type="NodeParagraph">After</div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const blocks = [
      root.querySelector<HTMLElement>('[data-node-id="p"]')!,
      root.querySelector<HTMLElement>('[data-node-id="h"]')!,
    ];
    blocks[0].classList.add("protyle-wysiwyg--select");
    blocks[0].setAttribute("select-start", "true");
    const important = CALLOUT_TYPE_DEFINITIONS.find((item) => item.type === "IMPORTANT")!;
    const plan = createCalloutConversionPlan(blocks, important, protyle)!;

    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = root.querySelector<HTMLElement>('[data-node-id="callout"]')!;
    expect(callout.dataset.subtype).toBe("IMPORTANT");
    expect(callout.querySelector(":scope > .callout-info > .callout-title")?.textContent).toBe("Important");
    expect(Array.from(callout.querySelector(":scope > .callout-content")!.children)
      .map((item) => (item as HTMLElement).dataset.nodeId)).toEqual(["p", "h"]);
    expect(callout.querySelector(".protyle-wysiwyg--select, [select-start], [select-end]")).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
    const [doOperations, undoOperations] = transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations.map((operation) => operation.action)).toEqual(["insert", "move", "move"]);
    expect(undoOperations.map((operation) => operation.action)).toEqual(["move", "move", "delete"]);
    applyOperations(root, undoOperations);
    expect(Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-node-id]"))
      .map((item) => item.dataset.nodeId)).toEqual(["before", "p", "h", "after"]);
    expect(root.querySelector('[data-node-id="callout"]')).toBeNull();
    expect(root.querySelector('[data-node-id="p"]')?.textContent).toBe("Paragraph");
    expect(root.querySelector('[data-node-id="h"]')?.textContent).toBe("Heading");
  });

  it("changes an existing Callout type without nesting it", () => {
    const root = render(`
      <div class="callout" data-node-id="callout" data-type="NodeCallout" data-subtype="NOTE">
        <div class="callout-info"><span class="callout-icon">old</span><span class="callout-title">Note</span></div>
        <div class="callout-content"><div data-node-id="p" data-type="NodeParagraph">Body</div></div>
        <div class="protyle-attr"></div>
      </div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const caution = CALLOUT_TYPE_DEFINITIONS.find((item) => item.type === "CAUTION")!;
    const callout = root.firstElementChild as HTMLElement;
    const plan = createCalloutConversionPlan([callout], caution, protyle)!;

    expect(convertBlocksToCallout(plan, protyle)).toBe(true);
    expect(callout.dataset.subtype).toBe("CAUTION");
    expect(callout.querySelector(".callout-title")?.textContent).toBe("Caution");
    expect(callout.querySelector('[data-node-id="p"]')).not.toBeNull();
    expect(transaction.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ action: "update", id: "callout" }),
    ]);
  });

  it("converts a list item's body without absorbing its child list", () => {
    const root = render(`
      <div data-node-id="list" data-type="NodeList">
        <div data-node-id="li" data-type="NodeListItem">
          <div class="protyle-action">1.</div>
          <div data-node-id="body" data-type="NodeParagraph">Item body</div>
          <div data-node-id="child-list" data-type="NodeList">
            <div data-node-id="child-li" data-type="NodeListItem">
              <div class="protyle-action">a.</div>
              <div data-node-id="child-body" data-type="NodeParagraph">Child item</div>
              <div class="protyle-attr"></div>
            </div>
            <div class="protyle-attr"></div>
          </div>
          <div class="protyle-attr"></div>
        </div>
        <div class="protyle-attr"></div>
      </div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const listItem = root.querySelector<HTMLElement>('[data-node-id="li"]')!;
    const warning = CALLOUT_TYPE_DEFINITIONS.find((item) => item.type === "WARNING")!;
    const plan = createCalloutConversionPlan([listItem], warning, protyle)!;

    expect(plan.blocks.map((block) => block.dataset.nodeId)).toEqual(["body"]);
    expect(plan.parentId).toBe("li");
    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = listItem.querySelector<HTMLElement>(":scope > [data-node-id=callout]")!;
    const childList = listItem.querySelector<HTMLElement>(":scope > [data-node-id=child-list]")!;
    expect(callout.dataset.subtype).toBe("WARNING");
    expect(callout.querySelector(":scope > .callout-content > [data-node-id=body]")).not.toBeNull();
    expect(callout.nextElementSibling).toBe(childList);
    expect(callout.querySelector('[data-node-id="child-list"]')).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);

    const [, undoOperations] = transaction.mock.calls[0] as [IOperation[], IOperation[]];
    applyOperations(root, undoOperations);
    expect(listItem.querySelector(":scope > [data-node-id=callout]")).toBeNull();
    expect(listItem.querySelector(":scope > [data-node-id=body]")?.nextElementSibling).toBe(childList);
  });

  it("rejects nonconsecutive selections and cross-parent selections", () => {
    const root = render(`
      <div data-node-id="list" data-type="NodeList">
        <div data-node-id="li" data-type="NodeListItem">
          <div data-node-id="nested" data-type="NodeParagraph">Nested</div>
        </div>
      </div>
      <div data-node-id="first" data-type="NodeParagraph">First</div>
      <div data-node-id="middle" data-type="NodeParagraph">Middle</div>
      <div data-node-id="last" data-type="NodeParagraph">Last</div>
    `);
    const { protyle } = createProtyle(root);
    const note = CALLOUT_TYPE_DEFINITIONS[0];
    const block = (id: string) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!;

    expect(createCalloutConversionPlan([block("li")], note, protyle)).toBeDefined();
    expect(createCalloutConversionPlan([block("first"), block("last")], note, protyle)).toBeUndefined();
    expect(createCalloutConversionPlan([block("nested"), block("first")], note, protyle)).toBeUndefined();
    expect(createCalloutConversionPlan([block("list")], note, protyle)).toBeDefined();
  });
});
