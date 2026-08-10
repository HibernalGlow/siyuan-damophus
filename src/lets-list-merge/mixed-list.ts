import type { ListMergeOperation, ListSubtype } from "./list-merge";

export interface MixedListBlock {
  id: string;
  isList: boolean;
  element?: HTMLElement;
}

export interface MixedListSelection {
  blocks: MixedListBlock[];
}

export interface MixedListItemPlan {
  id: string;
  blockIds: string[];
}

export interface MixedListPlan {
  outerListId: string;
  subtype: ListSubtype;
  items: MixedListItemPlan[];
}

export interface MixedListTransaction {
  doOperations: ListMergeOperation[];
  undoOperations: ListMergeOperation[];
  result: {
    nestedListCount: number;
    topLevelItemCount: number;
  };
}

const LIST_BLOCK_TYPE = "NodeList";
const LIST_ITEM_BLOCK_TYPE = "NodeListItem";

function compareDocumentOrder(left: HTMLElement, right: HTMLElement): number {
  const position = left.compareDocumentPosition(right);
  if (position & Node.DOCUMENT_POSITION_DISCONNECTED) return 0;
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

function hasContinuousSelection(elements: HTMLElement[]): boolean {
  const selectedIds = new Set(elements.map((element) => element.dataset.nodeId));
  let current: Element | null = elements[0];
  while (current && current !== elements.at(-1)) {
    current = current.nextElementSibling;
    if (current instanceof HTMLElement && current.dataset.nodeId && !selectedIds.has(current.dataset.nodeId)) {
      return false;
    }
  }
  return current === elements.at(-1);
}

export function resolveMixedListSelection(
  blockElements: readonly HTMLElement[],
): MixedListSelection | undefined {
  const uniqueBlocks = new Map<string, HTMLElement>();
  for (const element of blockElements) {
    const id = element.dataset.nodeId;
    if (!id || element.dataset.type === LIST_ITEM_BLOCK_TYPE) return undefined;
    uniqueBlocks.set(id, element);
  }
  if (uniqueBlocks.size < 2) return undefined;

  const blocks = [...uniqueBlocks.values()];
  const editor = blocks[0].closest(".protyle-wysiwyg");
  const parent = blocks[0].parentElement;
  if (!editor || !parent || blocks.some((block) => (
    block.closest(".protyle-wysiwyg") !== editor || block.parentElement !== parent
  ))) return undefined;

  blocks.sort(compareDocumentOrder);
  if (!hasContinuousSelection(blocks)) return undefined;
  const hasList = blocks.some((block) => block.dataset.type === LIST_BLOCK_TYPE);
  const hasNonList = blocks.some((block) => block.dataset.type !== LIST_BLOCK_TYPE);
  if (!hasList || !hasNonList || blocks[0].dataset.type === LIST_BLOCK_TYPE) return undefined;

  return {
    blocks: blocks.map((block) => ({
      id: block.dataset.nodeId!,
      isList: block.dataset.type === LIST_BLOCK_TYPE,
      element: block,
    })),
  };
}

function newNodeId(): string {
  const id = window.Lute?.NewNodeID?.();
  if (!id) throw new Error("SiYuan node ID generator is unavailable");
  return id;
}

export function createMixedListPlan(
  selection: MixedListSelection,
  subtype: ListSubtype,
  createId: () => string = newNodeId,
): MixedListPlan {
  const items: MixedListItemPlan[] = [];
  for (const block of selection.blocks) {
    if (!block.isList) items.push({ id: createId(), blockIds: [block.id] });
    else items.at(-1)!.blockIds.push(block.id);
  }
  return { outerListId: createId(), subtype, items };
}

function listMarker(subtype: ListSubtype, index: number): string {
  return subtype === "o" ? `${index + 1}.` : "*";
}

function listAction(subtype: ListSubtype, index: number): string {
  if (subtype === "o") {
    return `<div class="protyle-action protyle-action--order" contenteditable="false" draggable="true">${index + 1}.</div>`;
  }
  return '<div class="protyle-action" draggable="true"><svg><use xlink:href="#iconDot"></use></svg></div>';
}

function outerListShell(plan: MixedListPlan): string {
  const items = plan.items.map((item, index) => (
    `<div data-marker="${listMarker(plan.subtype, index)}" data-subtype="${plan.subtype}" data-node-id="${item.id}" data-type="NodeListItem" class="li">${listAction(plan.subtype, index)}<div class="protyle-attr" contenteditable="false"></div></div>`
  )).join("");
  return `<div data-subtype="${plan.subtype}" data-node-id="${plan.outerListId}" data-type="NodeList" class="list">${items}<div class="protyle-attr" contenteditable="false"></div></div>`;
}

function parentBlockId(first: HTMLElement, rootId?: string): string {
  const parentId = first.parentElement?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId;
  if (!parentId && !rootId) throw new Error("Cannot resolve the selected blocks' parent");
  return parentId ?? rootId!;
}

export function buildMixedListTransaction(
  plan: MixedListPlan,
  selection: MixedListSelection,
  rootId?: string,
): MixedListTransaction {
  const elements = new Map(selection.blocks.map((block) => [block.id, block.element]));
  const first = elements.get(selection.blocks[0].id);
  if (!first) throw new Error("The first selected block is no longer available");
  const parentID = parentBlockId(first, rootId);
  const doOperations: ListMergeOperation[] = [{
    action: "insert",
    id: plan.outerListId,
    data: outerListShell(plan),
    nextID: selection.blocks[0].id,
    parentID,
  }];

  for (const item of plan.items) {
    let previousID: string | undefined;
    for (const blockId of item.blockIds) {
      doOperations.push(previousID
        ? { action: "move", id: blockId, previousID }
        : { action: "move", id: blockId, parentID: item.id });
      previousID = blockId;
    }
  }

  const undoOperations: ListMergeOperation[] = [];
  let previousID = plan.outerListId;
  for (const block of selection.blocks) {
    undoOperations.push({ action: "move", id: block.id, previousID, parentID });
    previousID = block.id;
  }
  undoOperations.push({ action: "delete", id: plan.outerListId });

  return {
    doOperations,
    undoOperations,
    result: {
      nestedListCount: selection.blocks.filter((block) => block.isList).length,
      topLevelItemCount: plan.items.length,
    },
  };
}

export function applyMixedListDom(plan: MixedListPlan, selection: MixedListSelection): void {
  const elements = new Map(selection.blocks.map((block) => [block.id, block.element]));
  const first = elements.get(selection.blocks[0].id);
  if (!first) throw new Error("The first selected block is no longer available");

  const template = document.createElement("template");
  template.innerHTML = outerListShell(plan);
  const outerList = template.content.firstElementChild as HTMLElement | null;
  if (!outerList) throw new Error("Cannot create the mixed list container");
  first.before(outerList);

  for (const item of plan.items) {
    const itemElement = outerList.querySelector<HTMLElement>(`:scope > [data-node-id="${item.id}"]`);
    const attr = itemElement?.querySelector<HTMLElement>(":scope > .protyle-attr");
    if (!itemElement || !attr) throw new Error(`Cannot create list item ${item.id}`);
    for (const blockId of item.blockIds) {
      const block = elements.get(blockId);
      if (!block) throw new Error(`Block ${blockId} is no longer available`);
      block.classList.remove("protyle-wysiwyg--select");
      block.removeAttribute("select-start");
      block.removeAttribute("select-end");
      itemElement.insertBefore(block, attr);
    }
  }
}
