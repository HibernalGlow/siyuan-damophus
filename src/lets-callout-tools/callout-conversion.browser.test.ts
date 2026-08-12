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
    if (operation.action === "insert") {
      const host = document.createElement("div");
      host.innerHTML = operation.data as string;
      const element = host.firstElementChild!;
      const next = operationElement(root, operation.nextID);
      const previous = operationElement(root, operation.previousID);
      const parent = operation.parentID === "document-root"
        ? root
        : operationElement(root, operation.parentID);
      if (next) next.before(element);
      else if (previous) previous.after(element);
      else parent?.prepend(element);
      continue;
    }
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
      <div data-node-id="quote" data-type="NodeBlockquote">Quote</div>
      <div data-node-id="after" data-type="NodeParagraph">After</div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const blocks = [
      root.querySelector<HTMLElement>('[data-node-id="p"]')!,
      root.querySelector<HTMLElement>('[data-node-id="quote"]')!,
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
      .map((item) => (item as HTMLElement).dataset.nodeId)).toEqual(["p", "quote"]);
    expect(callout.querySelector(".protyle-wysiwyg--select, [select-start], [select-end]")).toBeNull();
    expect(transaction).toHaveBeenCalledTimes(1);
    const [doOperations, undoOperations] = transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations.map((operation) => operation.action)).toEqual(["insert", "move", "move"]);
    expect(undoOperations.map((operation) => operation.action)).toEqual(["move", "move", "delete"]);
    applyOperations(root, undoOperations);
    expect(Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-node-id]"))
      .map((item) => item.dataset.nodeId)).toEqual(["before", "p", "quote", "after"]);
    expect(root.querySelector('[data-node-id="callout"]')).toBeNull();
    expect(root.querySelector('[data-node-id="p"]')?.textContent).toBe("Paragraph");
    expect(root.querySelector('[data-node-id="quote"]')?.textContent).toBe("Quote");
  });

  it("uses the first heading as the Callout title when converting multiple blocks", () => {
    const root = render(`
      <div data-node-id="before" data-type="NodeParagraph">Before</div>
      <div class="h2 protyle-wysiwyg--select" select-start="true"
        data-node-id="heading" data-type="NodeHeading">
        <div contenteditable="true">A <strong data-type="strong">rich</strong> title</div>
        <div class="protyle-attr"></div>
      </div>
      <div data-node-id="body-1" data-type="NodeParagraph">First body</div>
      <div data-node-id="body-2" data-type="NodeParagraph">Second body</div>
      <div data-node-id="after" data-type="NodeParagraph">After</div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const blocks = ["heading", "body-1", "body-2"].map(
      (id) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!,
    );
    const tip = CALLOUT_TYPE_DEFINITIONS.find((item) => item.type === "TIP")!;
    const plan = createCalloutConversionPlan(blocks, tip, protyle)!;

    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = root.querySelector<HTMLElement>('[data-node-id="callout"]')!;
    const title = callout.querySelector<HTMLElement>(":scope > .callout-info > .callout-title")!;
    expect(title.textContent).toBe("A rich title");
    expect(title.querySelector('strong[data-type="strong"]')?.textContent).toBe("rich");
    expect(root.querySelector('[data-node-id="heading"]')).toBeNull();
    expect(Array.from(callout.querySelector(":scope > .callout-content")!.children)
      .map((item) => (item as HTMLElement).dataset.nodeId)).toEqual(["body-1", "body-2"]);
    expect(transaction).toHaveBeenCalledTimes(1);

    const [doOperations, undoOperations] = transaction.mock.calls[0] as [IOperation[], IOperation[]];
    expect(doOperations.map((operation) => operation.action)).toEqual(["insert", "delete", "move", "move"]);
    expect(undoOperations.map((operation) => operation.action)).toEqual(["insert", "move", "move", "delete"]);
    applyOperations(root, undoOperations);
    expect(Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-node-id]"))
      .map((item) => item.dataset.nodeId)).toEqual(["before", "heading", "body-1", "body-2", "after"]);
    expect(root.querySelector('[data-node-id="heading"] strong')?.textContent).toBe("rich");
    expect(root.querySelector('[data-node-id="callout"]')).toBeNull();
  });

  it("keeps a single heading as Callout body content", () => {
    const root = render('<div data-node-id="heading" data-type="NodeHeading">Only heading</div>');
    const { protyle, transaction } = createProtyle(root);
    const heading = root.firstElementChild as HTMLElement;
    const note = CALLOUT_TYPE_DEFINITIONS[0];
    const plan = createCalloutConversionPlan([heading], note, protyle)!;

    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = root.querySelector<HTMLElement>('[data-node-id="callout"]')!;
    expect(callout.querySelector(".callout-title")?.textContent).toBe("Note");
    expect(callout.querySelector(":scope > .callout-content > [data-node-id=heading]")).not.toBeNull();
    expect(transaction.mock.calls[0]?.[0].map((operation: IOperation) => operation.action))
      .toEqual(["insert", "move"]);
  });

  it("keeps headings in the body when title promotion is disabled", () => {
    const root = render(`
      <div data-node-id="heading" data-type="NodeHeading">Section title</div>
      <div data-node-id="body" data-type="NodeParagraph">Body</div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const blocks = ["heading", "body"].map(
      (id) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!,
    );
    const warning = CALLOUT_TYPE_DEFINITIONS.find((item) => item.type === "WARNING")!;
    const plan = createCalloutConversionPlan(blocks, warning, protyle, false)!;

    expect(plan.promoteHeadingToTitle).toBe(false);
    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = root.querySelector<HTMLElement>('[data-node-id="callout"]')!;
    expect(callout.querySelector(".callout-title")?.textContent).toBe("Warning");
    expect(Array.from(callout.querySelector(":scope > .callout-content")!.children)
      .map((item) => (item as HTMLElement).dataset.nodeId)).toEqual(["heading", "body"]);
    expect(transaction.mock.calls[0]?.[0].map((operation: IOperation) => operation.action))
      .toEqual(["insert", "move", "move"]);
  });

  it("uses the first heading even when an introductory block precedes it", () => {
    const root = render(`
      <div data-node-id="intro" data-type="NodeParagraph">Introduction</div>
      <div data-node-id="heading-1" data-type="NodeHeading" contenteditable="true">
        First title<div class="protyle-attr">metadata</div>
      </div>
      <div data-node-id="heading-2" data-type="NodeHeading">Second heading</div>
      <div data-node-id="body" data-type="NodeParagraph">Body</div>
    `);
    const { protyle, transaction } = createProtyle(root);
    const blocks = ["intro", "heading-1", "heading-2", "body"].map(
      (id) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!,
    );
    const note = CALLOUT_TYPE_DEFINITIONS[0];
    const plan = createCalloutConversionPlan(blocks, note, protyle)!;

    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = root.querySelector<HTMLElement>('[data-node-id="callout"]')!;
    expect(callout.querySelector(".callout-title")?.textContent?.trim()).toBe("First title");
    expect(callout.querySelector(".callout-title .protyle-attr")).toBeNull();
    expect(Array.from(callout.querySelector(":scope > .callout-content")!.children)
      .map((item) => (item as HTMLElement).dataset.nodeId))
      .toEqual(["intro", "heading-2", "body"]);

    const [, undoOperations] = transaction.mock.calls[0] as [IOperation[], IOperation[]];
    applyOperations(root, undoOperations);
    expect(Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-node-id]"))
      .map((item) => item.dataset.nodeId)).toEqual(["intro", "heading-1", "heading-2", "body"]);
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

  it("uses a list item's heading as the title while preserving its child list", () => {
    const root = render(`
      <div data-node-id="list" data-type="NodeList">
        <div data-node-id="li" data-type="NodeListItem">
          <div class="protyle-action">1.</div>
          <div data-node-id="heading" data-type="NodeHeading">Item title</div>
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
    const tip = CALLOUT_TYPE_DEFINITIONS.find((item) => item.type === "TIP")!;
    const plan = createCalloutConversionPlan([listItem], tip, protyle)!;

    expect(convertBlocksToCallout(plan, protyle, () => "callout")).toBe(true);

    const callout = listItem.querySelector<HTMLElement>(":scope > [data-node-id=callout]")!;
    const childList = listItem.querySelector<HTMLElement>(":scope > [data-node-id=child-list]")!;
    expect(callout.querySelector(".callout-title")?.textContent).toBe("Item title");
    expect(callout.querySelector(":scope > .callout-content > [data-node-id=body]")).not.toBeNull();
    expect(callout.querySelector('[data-node-id="heading"]')).toBeNull();
    expect(callout.nextElementSibling).toBe(childList);

    const [, undoOperations] = transaction.mock.calls[0] as [IOperation[], IOperation[]];
    applyOperations(root, undoOperations);
    expect(Array.from(listItem.children).filter((item) => item instanceof HTMLElement && item.dataset.nodeId)
      .map((item) => (item as HTMLElement).dataset.nodeId)).toEqual(["heading", "body", "child-list"]);
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
