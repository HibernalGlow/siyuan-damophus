export type ListSubtype = "o" | "u";

export interface SelectedList {
  id: string;
  subtype: ListSubtype;
  element?: HTMLElement;
}

export interface ListMergeSelection {
  lists: SelectedList[];
}

export interface ListMergePlan {
  targetId: string;
  sourceIds: string[];
  orderedListIds: string[];
  subtype: ListSubtype;
  reorderTargetItems: boolean;
}

export interface ListMergeResult {
  mergedItemCount: number;
  targetId: string;
  sourceIds: string[];
  subtype: ListSubtype;
}

export interface ListMergeOperation {
  action: "move" | "delete" | "insert" | "update";
  id?: string;
  data?: string;
  parentID?: string;
  previousID?: string;
  nextID?: string;
}

export interface ListMergeTransaction {
  doOperations: ListMergeOperation[];
  undoOperations: ListMergeOperation[];
  result: ListMergeResult;
}

export interface ListNumberingSelection {
  list: SelectedList;
}

export interface ListNumberingPlan {
  listId: string;
  start: number;
}

export interface ListNumberingResult {
  listId: string;
  itemCount: number;
  start: number;
}

export interface ListNumberingTransaction {
  doOperations: ListMergeOperation[];
  undoOperations: ListMergeOperation[];
  result: ListNumberingResult;
}

export interface ListItemDetachSelection {
  item: HTMLElement;
}

export interface ListItemDetachPlan {
  itemId: string;
  listId: string;
  parentId: string;
  rootId?: string;
  previousId?: string;
  nextId?: string;
  beforeListHtml?: string;
  afterListHtml?: string;
  bodyBlocks: HTMLElement[];
  originalListHtml: string;
  beforeListId?: string;
  afterListId?: string;
}

export interface ListItemDetachTransaction {
  doOperations: ListMergeOperation[];
  undoOperations: ListMergeOperation[];
  result: { itemId: string; blockCount: number };
}

const LIST_BLOCK_TYPE = "NodeList";
const MERGEABLE_LIST_SUBTYPES = new Set<ListSubtype>(["o", "u"]);

function listSubtype(element: HTMLElement): ListSubtype | undefined {
  const subtype = element.dataset.subtype as ListSubtype | undefined;
  return subtype && MERGEABLE_LIST_SUBTYPES.has(subtype) ? subtype : undefined;
}

function compareDocumentOrder(left: HTMLElement, right: HTMLElement): number {
  const position = left.compareDocumentPosition(right);
  if (position & Node.DOCUMENT_POSITION_DISCONNECTED) return 0;
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
  return 0;
}

export function resolveListMergeSelection(
  blockElements: readonly HTMLElement[],
): ListMergeSelection | undefined {
  const uniqueLists = new Map<string, HTMLElement>();
  for (const element of blockElements) {
    const id = element.dataset.nodeId;
    if (!id || element.dataset.type !== LIST_BLOCK_TYPE || !listSubtype(element)) return undefined;
    uniqueLists.set(id, element);
  }
  if (uniqueLists.size < 2) return undefined;

  const lists = [...uniqueLists.values()];
  const editor = lists[0].closest(".protyle-wysiwyg");
  if (!editor || lists.some((list) => list.closest(".protyle-wysiwyg") !== editor)) return undefined;
  if (lists.some((list, index) => lists.some((other, otherIndex) => (
    index !== otherIndex && list.contains(other)
  )))) return undefined;

  lists.sort(compareDocumentOrder);
  if (lists.some((list, index) => index > 0 && compareDocumentOrder(lists[index - 1], list) === 0)) {
    return undefined;
  }
  return {
    lists: lists.map((list) => ({
      id: list.dataset.nodeId!,
      subtype: listSubtype(list)!,
      element: list,
    })),
  };
}

export function resolveListNumberingSelection(
  blockElements: readonly HTMLElement[],
): ListNumberingSelection | undefined {
  if (blockElements.length !== 1) return undefined;
  const [list] = blockElements;
  if (
    list.dataset.nodeId === undefined
    || list.dataset.type !== LIST_BLOCK_TYPE
    || listSubtype(list) !== "o"
    || !list.closest(".protyle-wysiwyg")
  ) return undefined;
  return {
    list: {
      id: list.dataset.nodeId,
      subtype: "o",
      element: list,
    },
  };
}

export function hasMixedListTypes(selection: ListMergeSelection): boolean {
  return selection.lists.some((list) => list.subtype !== selection.lists[0].subtype);
}

export function createListMergePlan(
  selection: ListMergeSelection,
  requestedSubtype?: ListSubtype,
): ListMergePlan | undefined {
  const mixed = hasMixedListTypes(selection);
  if (mixed && !requestedSubtype) return undefined;

  const subtype = mixed ? requestedSubtype! : selection.lists[0].subtype;
  const targetIndex = mixed
    ? selection.lists.findIndex((list) => list.subtype === subtype)
    : 0;
  if (targetIndex < 0) return undefined;
  const targetId = selection.lists[targetIndex].id;
  return {
    targetId,
    sourceIds: selection.lists.filter((list) => list.id !== targetId).map((list) => list.id),
    orderedListIds: selection.lists.map((list) => list.id),
    subtype,
    reorderTargetItems: targetIndex !== 0,
  };
}

function directListItems(list: HTMLElement): HTMLElement[] {
  const items = Array.from(list.children).filter((child): child is HTMLElement => (
    child instanceof HTMLElement && child.dataset.type === "NodeListItem"
  ));
  if (items.length === 0 || items.some((item) => !item.dataset.nodeId)) {
    throw new Error(`List ${list.dataset.nodeId ?? "unknown"} has invalid items`);
  }
  return items;
}

function directBlockChildren(item: HTMLElement): HTMLElement[] {
  return Array.from(item.children).filter((child): child is HTMLElement => (
    child instanceof HTMLElement
    && Boolean(child.dataset.nodeId)
    && Boolean(child.dataset.type)
    && child.dataset.type !== "NodeList"
    && !child.classList.contains("protyle-attr")
    && !child.classList.contains("protyle-action")
  ));
}

function siblingBlockId(element: HTMLElement, direction: "previous" | "next"): string | undefined {
  let sibling = direction === "previous" ? element.previousElementSibling : element.nextElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement && sibling.dataset.nodeId) return sibling.dataset.nodeId;
    sibling = direction === "previous" ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return undefined;
}

export function resolveListItemDetachSelection(
  blockElements: readonly HTMLElement[],
): ListItemDetachSelection | undefined {
  if (blockElements.length !== 1) return undefined;
  const [item] = blockElements;
  if (item.dataset.type !== "NodeListItem" || !item.dataset.nodeId) return undefined;
  const list = item.parentElement;
  if (!list || list.dataset.type !== "NodeList" || !list.dataset.nodeId) return undefined;
  if (!item.closest(".protyle-wysiwyg")) return undefined;
  if (item.querySelector(':scope > [data-type="NodeList"]')) return undefined;
  if (directBlockChildren(item).length === 0) return undefined;
  return { item };
}

function listShell(list: HTMLElement, items: readonly HTMLElement[], id: string): string {
  const clone = list.cloneNode(false) as HTMLElement;
  clone.dataset.nodeId = id;
  clone.classList.remove("protyle-wysiwyg--select");
  clone.innerHTML = `${items.map((item) => {
    const itemClone = item.cloneNode(true) as HTMLElement;
    itemClone.classList.remove("protyle-wysiwyg--select");
    return itemClone.outerHTML;
  }).join("")}<div class="protyle-attr" contenteditable="false">\u200b</div>`;
  return clone.outerHTML;
}

export function createListItemDetachPlan(
  selection: ListItemDetachSelection,
  rootId?: string,
  newNodeId: () => string = () => window.Lute.NewNodeID(),
): ListItemDetachPlan | undefined {
  const item = selection.item;
  const list = item.parentElement;
  const parent = list?.parentElement;
  if (!list || !parent || list.dataset.type !== "NodeList" || !list.dataset.nodeId) return undefined;
  const bodyBlocks = directBlockChildren(item);
  if (bodyBlocks.length === 0 || item.querySelector(':scope > [data-type="NodeList"]')) return undefined;
  const items = directListItems(list);
  const index = items.indexOf(item);
  if (index < 0) return undefined;
  const beforeItems = items.slice(0, index);
  const afterItems = items.slice(index + 1);
  const beforeListId = beforeItems.length > 0 ? list.dataset.nodeId : undefined;
  const afterListId = afterItems.length > 0 ? newNodeId() : undefined;
  const parentId = parent.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId ?? rootId;
  if (!parentId) return undefined;
  return {
    itemId: item.dataset.nodeId!,
    listId: list.dataset.nodeId,
    parentId,
    rootId,
    previousId: siblingBlockId(list, "previous"),
    nextId: siblingBlockId(list, "next"),
    beforeListHtml: beforeListId ? listShell(list, beforeItems, beforeListId) : undefined,
    afterListHtml: afterListId ? listShell(list, afterItems, afterListId) : undefined,
    bodyBlocks,
    originalListHtml: list.outerHTML,
    beforeListId,
    afterListId,
  };
}

export function buildListItemDetachTransaction(plan: ListItemDetachPlan): ListItemDetachTransaction {
  const doOperations: ListMergeOperation[] = [];
  // Move each body block after the current list first. This keeps the move
  // target valid even when the selected item is the first item in the list.
  let previousId = plan.beforeListId ?? plan.listId;
  for (const block of plan.bodyBlocks) {
    const id = block.dataset.nodeId!;
    doOperations.push({
      action: "move",
      id,
      previousID: previousId,
    });
    previousId = id;
  }
  if (plan.beforeListHtml && plan.beforeListId) {
    doOperations.push({ action: "update", id: plan.listId, data: plan.beforeListHtml });
  } else {
    doOperations.push({ action: "delete", id: plan.listId });
  }
  if (plan.afterListHtml && plan.afterListId) {
    doOperations.push({ action: "insert", id: plan.afterListId, data: plan.afterListHtml, previousID: previousId, nextID: previousId ? undefined : plan.nextId, parentID: plan.parentId });
  }
  const undoOperations: ListMergeOperation[] = [];
  if (plan.afterListId) undoOperations.push({ action: "delete", id: plan.afterListId });
  undoOperations.push(...plan.bodyBlocks.map((block) => ({ action: "delete" as const, id: block.dataset.nodeId! })));
  if (plan.beforeListId) {
    undoOperations.push({ action: "update", id: plan.listId, data: plan.originalListHtml });
  } else {
    undoOperations.push({ action: "insert", id: plan.listId, data: plan.originalListHtml, previousID: plan.previousId, nextID: plan.previousId ? undefined : plan.nextId, parentID: plan.parentId });
  }
  return { doOperations, undoOperations, result: { itemId: plan.itemId, blockCount: plan.bodyBlocks.length } };
}

export function applyListItemDetachDom(plan: ListItemDetachPlan): void {
  const item = document.querySelector<HTMLElement>(`[data-node-id="${plan.itemId}"]`);
  const list = item?.parentElement;
  const parent = list?.parentElement;
  if (!item || !list || !parent) throw new Error(`List item ${plan.itemId} is no longer available`);
  const anchor = list.nextElementSibling;
  const before = plan.beforeListHtml ? document.createElement("template") : undefined;
  if (before) before.innerHTML = plan.beforeListHtml!;
  const after = plan.afterListHtml ? document.createElement("template") : undefined;
  if (after) after.innerHTML = plan.afterListHtml!;
  const blocks = [...plan.bodyBlocks];
  list.remove();
  const insert = (element: Element): void => {
    parent.insertBefore(element, anchor && anchor.parentElement === parent ? anchor : null);
  };
  if (before?.content.firstElementChild) insert(before.content.firstElementChild);
  for (const block of blocks) insert(block);
  if (after?.content.firstElementChild) insert(after.content.firstElementChild);
}

export function restoreListItemDetachDom(plan: ListItemDetachPlan): void {
  const current = document.querySelector<HTMLElement>(
    `[data-node-id="${plan.afterListId ?? plan.listId}"]`,
  );
  const parent = current?.parentElement;
  if (!current || !parent) return;
  const anchor = current.nextElementSibling;
  if (plan.afterListId) parent.querySelector<HTMLElement>(`[data-node-id="${plan.afterListId}"]`)?.remove();
  if (plan.beforeListId) parent.querySelector<HTMLElement>(`[data-node-id="${plan.beforeListId}"]`)?.remove();
  for (const block of plan.bodyBlocks) {
    parent.querySelector<HTMLElement>(`[data-node-id="${block.dataset.nodeId}"]`)?.remove();
  }
  const template = document.createElement("template");
  template.innerHTML = plan.originalListHtml;
  const restored = template.content.firstElementChild;
  if (restored) parent.insertBefore(restored, anchor && anchor.parentElement === parent ? anchor : null);
}

function sourceShell(list: HTMLElement): string {
  const shell = list.cloneNode(true) as HTMLElement;
  for (const item of directListItems(shell)) item.remove();
  shell.classList.remove("protyle-wysiwyg--select");
  return shell.outerHTML;
}

function insertSourceOperation(list: HTMLElement, rootId?: string): ListMergeOperation {
  const id = list.dataset.nodeId!;
  const nextID = siblingBlockId(list, "next");
  if (nextID) return { action: "insert", id, data: sourceShell(list), nextID };
  const previousID = siblingBlockId(list, "previous");
  if (previousID) return { action: "insert", id, data: sourceShell(list), previousID };
  const parentID = list.parentElement?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId ?? rootId;
  if (!parentID) throw new Error(`Cannot restore list ${list.dataset.nodeId ?? "unknown"}`);
  return { action: "insert", id, data: sourceShell(list), parentID };
}

function applyListItemSubtype(item: HTMLElement, subtype: ListSubtype, index: number, start = 1): void {
  const action = item.querySelector<HTMLElement>(":scope > .protyle-action");
  if (!action) throw new Error(`List item ${item.dataset.nodeId ?? "unknown"} has no marker`);
  item.dataset.subtype = subtype;
  action.setAttribute("draggable", "true");
  if (subtype === "o") {
    const marker = `${start + index}.`;
    item.dataset.marker = marker;
    action.className = "protyle-action protyle-action--order";
    action.setAttribute("contenteditable", "false");
    action.textContent = marker;
  } else {
    item.dataset.marker = "*";
    action.className = "protyle-action";
    action.removeAttribute("contenteditable");
    action.innerHTML = '<svg><use xlink:href="#iconDot"></use></svg>';
  }
}

function normalizedListItem(item: HTMLElement, subtype: ListSubtype, index: number, start = 1): string {
  const clone = item.cloneNode(true) as HTMLElement;
  clone.classList.remove("protyle-wysiwyg--select");
  applyListItemSubtype(clone, subtype, index, start);
  return clone.outerHTML;
}

export function currentListNumberingStart(selection: ListNumberingSelection): number {
  const firstItem = selection.list.element?.querySelector<HTMLElement>(
    ':scope > [data-type="NodeListItem"]',
  );
  const marker = firstItem?.dataset.marker ?? "";
  const parsed = Number(/^\d+\.$/u.test(marker) ? marker.slice(0, -1) : Number.NaN);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function createListNumberingPlan(
  selection: ListNumberingSelection,
  start: number,
): ListNumberingPlan | undefined {
  if (!Number.isSafeInteger(start) || start < 1) return undefined;
  return { listId: selection.list.id, start };
}

export function buildListNumberingTransaction(
  plan: ListNumberingPlan,
  selection: ListNumberingSelection,
): ListNumberingTransaction {
  if (selection.list.id !== plan.listId || !selection.list.element) {
    throw new Error(`List ${plan.listId} is no longer available`);
  }
  const items = directListItems(selection.list.element);
  if (!Number.isSafeInteger(plan.start + items.length - 1)) {
    throw new Error(`List ${plan.listId} numbering exceeds the safe integer range`);
  }
  const doOperations = items.map((item, index) => ({
    action: "update" as const,
    id: item.dataset.nodeId!,
    data: normalizedListItem(item, "o", index, plan.start),
  }));
  return {
    doOperations,
    undoOperations: items.map((item) => ({
      action: "update" as const,
      id: item.dataset.nodeId!,
      data: item.outerHTML,
    })),
    result: {
      listId: plan.listId,
      itemCount: items.length,
      start: plan.start,
    },
  };
}

export function applyListNumberingDom(
  plan: ListNumberingPlan,
  selection: ListNumberingSelection,
): void {
  if (selection.list.id !== plan.listId || !selection.list.element) {
    throw new Error(`List ${plan.listId} is no longer available`);
  }
  directListItems(selection.list.element).forEach((item, index) => {
    applyListItemSubtype(item, "o", index, plan.start);
  });
}

export function applyListMergeDom(plan: ListMergePlan, selection: ListMergeSelection): void {
  const listsById = new Map(selection.lists.map((list) => [list.id, list.element]));
  const lists = plan.orderedListIds.map((listId) => {
    const element = listsById.get(listId);
    if (!element) throw new Error(`List ${listId} is no longer available`);
    return element;
  });
  const target = lists.find((list) => list.dataset.nodeId === plan.targetId)!;
  const targetAttr = Array.from(target.children).find((child) => child.classList.contains("protyle-attr"));
  const items = lists.flatMap(directListItems);
  items.forEach((item, index) => {
    target.insertBefore(item, targetAttr ?? null);
    applyListItemSubtype(item, plan.subtype, index);
  });
  lists.forEach((list) => {
    list.classList.remove("protyle-wysiwyg--select");
    if (list !== target) list.remove();
  });
}

export function buildListMergeTransaction(
  plan: ListMergePlan,
  selection: ListMergeSelection,
  rootId?: string,
): ListMergeTransaction {
  const listsById = new Map(selection.lists.map((list) => [list.id, list.element]));
  const lists = plan.orderedListIds.map((listId) => {
    const element = listsById.get(listId);
    if (!element) throw new Error(`List ${listId} is no longer available`);
    return element;
  });
  const childGroups = lists.map(directListItems);

  const targetIndex = plan.orderedListIds.indexOf(plan.targetId);
  const targetChildren = childGroups[targetIndex];
  const mergedItemCount = childGroups.reduce((count, children) => count + children.length, 0);
  const doOperations: ListMergeOperation[] = [];

  if (plan.reorderTargetItems) {
    let previousId: string | undefined;
    for (const item of childGroups.flat()) {
      const itemId = item.dataset.nodeId!;
      if (previousId) {
        doOperations.push({ action: "move", id: itemId, previousID: previousId });
      } else {
        doOperations.push({ action: "move", id: itemId, parentID: plan.targetId });
      }
      previousId = itemId;
    }
  } else {
    let previousId = targetChildren.at(-1)!.dataset.nodeId!;
    for (const [index, children] of childGroups.entries()) {
      if (index === targetIndex) continue;
      for (const item of children) {
        const itemId = item.dataset.nodeId!;
        doOperations.push({ action: "move", id: itemId, previousID: previousId });
        previousId = itemId;
      }
    }
  }

  childGroups.flat().forEach((item, index) => {
    doOperations.push({
      action: "update",
      id: item.dataset.nodeId!,
      data: normalizedListItem(item, plan.subtype, index),
    });
  });
  plan.sourceIds.forEach((sourceId) => doOperations.push({ action: "delete", id: sourceId }));

  const sourceLists = lists.filter((list) => list.dataset.nodeId !== plan.targetId);
  const undoOperations: ListMergeOperation[] = sourceLists
    .slice()
    .reverse()
    .map((list) => insertSourceOperation(list, rootId));
  for (const [listIndex, items] of childGroups.entries()) {
    if (listIndex === targetIndex) continue;
    let previousID: string | undefined;
    for (const item of items) {
      const id = item.dataset.nodeId!;
      undoOperations.push(previousID
        ? { action: "move", id, previousID }
        : { action: "move", id, parentID: plan.orderedListIds[listIndex] });
      previousID = id;
    }
  }
  childGroups.flat().forEach((item) => undoOperations.push({
    action: "update",
    id: item.dataset.nodeId!,
    data: item.outerHTML,
  }));

  return {
    doOperations,
    undoOperations,
    result: {
      mergedItemCount,
      targetId: plan.targetId,
      sourceIds: plan.sourceIds,
      subtype: plan.subtype,
    },
  };
}
