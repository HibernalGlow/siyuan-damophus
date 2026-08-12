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

function queryRangeFromHint(
  block: HTMLElement,
  activeRange: Range,
  hint: Pick<SmartInsertHint, "lastIndex" | "splitChar">,
): Range | undefined {
  const beforeCaret = block.ownerDocument.createRange();
  beforeCaret.selectNodeContents(block);
  try {
    beforeCaret.setEnd(activeRange.endContainer, activeRange.endOffset);
  } catch {
    return undefined;
  }

  const text = beforeCaret.toString();
  const hintedIndex = hint.lastIndex;
  const hintedStartIsValid = hintedIndex >= 0
    && hintedIndex < text.length
    && text.startsWith(hint.splitChar, hintedIndex);
  const queryStart = hintedStartIsValid
    ? hintedIndex
    : text.lastIndexOf(hint.splitChar);
  if (queryStart < 0) return undefined;

  const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let offset = 0;
  let startNode: Text | undefined;
  let startOffset = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const nextOffset = offset + textNode.data.length;
    if (queryStart < nextOffset) {
      startNode = textNode;
      startOffset = queryStart - offset;
      break;
    }
    offset = nextOffset;
  }
  if (!startNode || !startNode.data.startsWith(hint.splitChar, startOffset)) return undefined;

  const queryRange = block.ownerDocument.createRange();
  try {
    queryRange.setStart(startNode, startOffset);
    queryRange.setEnd(activeRange.endContainer, activeRange.endOffset);
  } catch {
    return undefined;
  }
  return queryRange;
}

function hasMeaningfulContent(block: HTMLElement): boolean {
  const clone = block.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".protyle-attr, .protyle-action, wbr, br").forEach((item) => item.remove());
  const text = clone.textContent?.replace(/[\s\u200b\u200c\u200d\ufeff]/g, "") ?? "";
  if (text.length > 0) return true;
  return clone.querySelector("img, video, audio, iframe, canvas, svg, [data-type]") !== null;
}

function prepareEmptyParagraph(paragraph: HTMLElement, id: string): HTMLElement | undefined {
  if (paragraph.dataset.type !== "NodeParagraph") return undefined;
  let editable = paragraph.querySelector<HTMLElement>(":scope > [contenteditable=\"true\"]");
  if (!editable && paragraph.matches('[contenteditable="true"]')) {
    editable = paragraph.ownerDocument.createElement("div");
    editable.contentEditable = "true";
    editable.spellcheck = paragraph.spellcheck;
    paragraph.removeAttribute("contenteditable");
    paragraph.removeAttribute("spellcheck");
    const attributes = paragraph.querySelector<HTMLElement>(":scope > .protyle-attr")
      ?? paragraph.ownerDocument.createElement("div");
    attributes.classList.add("protyle-attr");
    attributes.contentEditable = "false";
    paragraph.replaceChildren(editable, attributes);
  }
  if (!editable) return undefined;

  paragraph.dataset.nodeId = id;
  editable.replaceChildren(paragraph.ownerDocument.createElement("wbr"));
  return paragraph;
}

function isLegalCalloutChild(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const type = element.dataset.type;
  return Boolean(type && type !== "NodeListItem" && type !== "NodeDocument");
}

function nextContentBlock(element: HTMLElement): {
  block?: HTMLElement;
  atContainerEnd: boolean;
} {
  const next = element.nextElementSibling;
  if (!next || (next.classList.contains("protyle-attr") && next.nextElementSibling === null)) {
    return { atContainerEnd: true };
  }
  if (next instanceof HTMLElement && next.dataset.nodeId && next.dataset.type) {
    return { block: next, atContainerEnd: false };
  }
  return { atContainerEnd: false };
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
    const block = blockElementAt(activeRange.endContainer, protyle.wysiwyg.element);
    if (!block) return false;

    const queryRange = queryRangeFromHint(block, activeRange, hint);
    if (!queryRange) return false;
    const simulated = cloneAfterDeletingRange(block, queryRange);
    if (!simulated) return false;

    const wrapsCurrent = hasMeaningfulContent(simulated);
    const following = nextContentBlock(block);
    const nextBlock = following.block;
    const createsEmptyBody = !wrapsCurrent && (
      following.atContainerEnd || nextBlock?.dataset.type === "NodeList"
    );
    if (!wrapsCurrent && !createsEmptyBody && !isLegalCalloutChild(nextBlock)) return false;

    const blockId = block.dataset.nodeId;
    const outerParentId = parentBlockId(block, protyle);
    const targetId = !wrapsCurrent && !createsEmptyBody
      ? (nextBlock as HTMLElement).dataset.nodeId
      : undefined;
    const instance = protyle.getInstance?.();
    const transaction = instance?.transaction;
    if (!blockId || !outerParentId || (!wrapsCurrent && !createsEmptyBody && !targetId)
      || typeof transaction !== "function") {
      return false;
    }

    const calloutId = wrapsCurrent ? this.runtime.newNodeId() : blockId;
    const callout = createCalloutShell(protyle, value, type, calloutId);
    const calloutContent = callout?.querySelector<HTMLElement>(":scope > .callout-content");
    if (!callout || !calloutContent) return false;
    const emptyParagraph = createsEmptyBody
      ? prepareEmptyParagraph(simulated, this.runtime.newNodeId())
      : undefined;
    if (createsEmptyBody && !emptyParagraph) return false;

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

    if (createsEmptyBody) {
      if (!emptyParagraph) return false;
      calloutContent.append(emptyParagraph);
      const calloutHtml = callout.outerHTML;
      block.replaceWith(callout);
      const doOperations: IOperation[] = [
        { action: "update", id: blockId, data: calloutHtml },
      ];
      const undoOperations: IOperation[] = [
        { action: "update", id: blockId, data: originalBlockHtml },
      ];
      transaction.call(instance, doOperations, undoOperations);
      focusStart(emptyParagraph);
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
