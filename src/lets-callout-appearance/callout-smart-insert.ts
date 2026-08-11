import type { IOperation, IProtyle } from "siyuan";

export const NATIVE_CALLOUT_TYPES = [
  "NOTE",
  "TIP",
  "IMPORTANT",
  "WARNING",
  "CAUTION",
] as const;

export type NativeCalloutType = (typeof NATIVE_CALLOUT_TYPES)[number];

type HintFill = (
  value: string,
  protyle: IProtyle,
  updateRange?: boolean,
  refIsS?: boolean,
) => void;

interface SmartInsertHint {
  element?: HTMLElement;
  fill: HintFill;
  lastIndex: number;
  splitChar: string;
}

interface InstalledHint {
  hint: SmartInsertHint;
  originalFill: HintFill;
  wrappedFill: HintFill;
}

export interface CalloutSmartInsertRuntime {
  caret: string;
  newNodeId: () => string;
}

function defaultRuntime(): CalloutSmartInsertRuntime | undefined {
  const lute = window.Lute;
  if (!lute?.Caret || typeof lute.NewNodeID !== "function") return undefined;
  return {
    caret: lute.Caret,
    newNodeId: () => lute.NewNodeID(),
  };
}

export function parseNativeCalloutValue(
  value: string,
  caret: string,
): NativeCalloutType | undefined {
  const match = value.match(/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n> (.*)$/);
  if (!match || match[2] !== caret) return undefined;
  return match[1] as NativeCalloutType;
}

function blockElementAt(node: Node, root: HTMLElement): HTMLElement | undefined {
  const element = node instanceof HTMLElement ? node : node.parentElement;
  const block = element?.closest<HTMLElement>("[data-node-id]");
  return block && root.contains(block) ? block : undefined;
}

function nodePath(root: Node, node: Node): number[] | undefined {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return undefined;
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return current === root ? path : undefined;
}

function nodeAtPath(root: Node, path: readonly number[]): Node | undefined {
  let current = root;
  for (const index of path) {
    const child = current.childNodes[index];
    if (!child) return undefined;
    current = child;
  }
  return current;
}

function cloneAfterDeletingRange(block: HTMLElement, range: Range): HTMLElement | undefined {
  const startPath = nodePath(block, range.startContainer);
  const endPath = nodePath(block, range.endContainer);
  if (!startPath || !endPath) return undefined;

  const clone = block.cloneNode(true) as HTMLElement;
  const start = nodeAtPath(clone, startPath);
  const end = nodeAtPath(clone, endPath);
  if (!start || !end) return undefined;

  const cloneRange = block.ownerDocument.createRange();
  try {
    cloneRange.setStart(start, range.startOffset);
    cloneRange.setEnd(end, range.endOffset);
    cloneRange.deleteContents();
  } catch {
    return undefined;
  }
  return clone;
}

function hasMeaningfulContent(block: HTMLElement): boolean {
  const clone = block.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".protyle-attr, .protyle-action, wbr, br").forEach((item) => item.remove());
  const text = clone.textContent?.replace(/[\s\u200b\u200c\u200d\ufeff]/g, "") ?? "";
  if (text.length > 0) return true;
  return clone.querySelector("img, video, audio, iframe, canvas, svg, [data-type]") !== null;
}

function isLegalCalloutChild(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const type = element.dataset.type;
  return Boolean(type && type !== "NodeListItem" && type !== "NodeDocument");
}

function parentBlockId(element: HTMLElement, protyle: IProtyle): string | undefined {
  return element.parentElement?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId
    ?? protyle.block.parentID;
}

function createCalloutShell(
  protyle: IProtyle,
  value: string,
  type: NativeCalloutType,
  id: string,
): HTMLElement | undefined {
  const html = protyle.lute?.SpinBlockDOM(value);
  if (!html) return undefined;
  const host = protyle.element.ownerDocument.createElement("div");
  host.innerHTML = html;
  const callout = host.querySelector<HTMLElement>('[data-type="NodeCallout"]');
  const content = callout?.querySelector<HTMLElement>(":scope > .callout-content");
  if (!callout || !content) return undefined;
  callout.dataset.nodeId = id;
  callout.dataset.subtype = type;
  content.replaceChildren();
  return callout;
}

function focusStart(element: HTMLElement): void {
  const editable = element.matches('[contenteditable="true"]')
    ? element
    : element.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!editable) return;
  const selection = editable.ownerDocument.getSelection();
  if (!selection) return;
  const range = editable.ownerDocument.createRange();
  range.selectNodeContents(editable);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function hideHint(hint: SmartInsertHint, protyle: IProtyle): void {
  hint.element?.classList.add("fn__none");
  protyle.toolbar?.element?.classList.add("fn__none");
}

export class CalloutSmartInsert {
  private readonly installed = new Map<IProtyle, InstalledHint>();

  constructor(private readonly runtime: CalloutSmartInsertRuntime | undefined = defaultRuntime()) {}

  attach(protyle: IProtyle): void {
    if (this.installed.has(protyle) || !protyle.hint) return;
    const hint = protyle.hint as unknown as SmartInsertHint;
    if (typeof hint.fill !== "function") return;

    const originalFill = hint.fill;
    const controller = this;
    const wrappedFill: HintFill = function (
      this: SmartInsertHint,
      value,
      activeProtyle,
      updateRange = true,
      refIsS = false,
    ): void {
      if (!controller.tryInsert(this, value, activeProtyle, updateRange)) {
        originalFill.call(this, value, activeProtyle, updateRange, refIsS);
      }
    };
    hint.fill = wrappedFill;
    this.installed.set(protyle, { hint, originalFill, wrappedFill });
  }

  detach(protyle: IProtyle): void {
    const installed = this.installed.get(protyle);
    if (!installed) return;
    if (installed.hint.fill === installed.wrappedFill) {
      installed.hint.fill = installed.originalFill;
    }
    this.installed.delete(protyle);
  }

  dispose(): void {
    for (const protyle of [...this.installed.keys()]) this.detach(protyle);
  }

  private tryInsert(
    hint: SmartInsertHint,
    value: string,
    protyle: IProtyle,
    updateRange: boolean,
  ): boolean {
    if (!this.runtime || !["/", "\u3001"].includes(hint.splitChar)) return false;
    const type = parseNativeCalloutValue(value, this.runtime.caret);
    if (!type || !protyle.toolbar || !protyle.wysiwyg) return false;

    if (updateRange) {
      const selection = protyle.wysiwyg.element.ownerDocument.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      protyle.toolbar.range = selection.getRangeAt(0);
    }
    const activeRange = protyle.toolbar.range;
    if (!activeRange) return false;
    const block = blockElementAt(activeRange.startContainer, protyle.wysiwyg.element);
    if (!block || activeRange.startContainer !== activeRange.endContainer) return false;

    const queryRange = activeRange.cloneRange();
    if (hint.lastIndex > -1) {
      try {
        queryRange.setStart(queryRange.startContainer, hint.lastIndex);
      } catch {
        return false;
      }
    }
    const simulated = cloneAfterDeletingRange(block, queryRange);
    if (!simulated) return false;

    const wrapsCurrent = hasMeaningfulContent(simulated);
    const nextBlock = block.nextElementSibling;
    if (!wrapsCurrent && !isLegalCalloutChild(nextBlock)) return false;

    const blockId = block.dataset.nodeId;
    const outerParentId = parentBlockId(block, protyle);
    const targetId = wrapsCurrent ? undefined : (nextBlock as HTMLElement).dataset.nodeId;
    const instance = protyle.getInstance?.();
    const transaction = instance?.transaction;
    if (!blockId || !outerParentId || (!wrapsCurrent && !targetId) || typeof transaction !== "function") {
      return false;
    }

    const calloutId = wrapsCurrent ? this.runtime.newNodeId() : blockId;
    const callout = createCalloutShell(protyle, value, type, calloutId);
    const calloutContent = callout?.querySelector<HTMLElement>(":scope > .callout-content");
    if (!callout || !calloutContent) return false;

    const originalBlockHtml = block.outerHTML;
    queryRange.deleteContents();
    queryRange.collapse(true);
    hideHint(hint, protyle);

    if (wrapsCurrent) {
      const updatedBlockHtml = block.outerHTML;
      const shellHtml = callout.outerHTML;
      block.before(callout);
      calloutContent.append(block);
      const doOperations: IOperation[] = [
        { action: "insert", id: calloutId, data: shellHtml, nextID: blockId, parentID: outerParentId },
        { action: "update", id: blockId, data: updatedBlockHtml },
        { action: "move", id: blockId, parentID: calloutId },
      ];
      const undoOperations: IOperation[] = [
        { action: "move", id: blockId, previousID: calloutId, parentID: outerParentId },
        { action: "update", id: blockId, data: originalBlockHtml },
        { action: "delete", id: calloutId },
      ];
      transaction.call(instance, doOperations, undoOperations);
      return true;
    }

    const target = nextBlock as HTMLElement;
    const shellHtml = callout.outerHTML;
    block.replaceWith(callout);
    calloutContent.append(target);
    const doOperations: IOperation[] = [
      { action: "update", id: blockId, data: shellHtml },
      { action: "move", id: targetId, parentID: blockId },
    ];
    const undoOperations: IOperation[] = [
      { action: "move", id: targetId, previousID: blockId, parentID: outerParentId },
      { action: "update", id: blockId, data: originalBlockHtml },
    ];
    transaction.call(instance, doOperations, undoOperations);
    focusStart(target);
    return true;
  }
}
