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

function sourceShell(list: HTMLElement): string {
  const shell = list.cloneNode(true) as HTMLElement;
  for (const item of directListItems(shell)) item.remove();
  shell.classList.remove("protyle-wysiwyg--select");
  return shell.outerHTML;
}

function siblingBlockId(element: HTMLElement, direction: "previous" | "next"): string | undefined {
  let sibling = direction === "previous" ? element.previousElementSibling : element.nextElementSibling;
  while (sibling) {
    if (sibling instanceof HTMLElement && sibling.dataset.nodeId) return sibling.dataset.nodeId;
    sibling = direction === "previous" ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return undefined;
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

function applyListItemSubtype(item: HTMLElement, subtype: ListSubtype, index: number): void {
  const action = item.querySelector<HTMLElement>(":scope > .protyle-action");
  if (!action) throw new Error(`List item ${item.dataset.nodeId ?? "unknown"} has no marker`);
  item.dataset.subtype = subtype;
  action.setAttribute("draggable", "true");
  if (subtype === "o") {
    const marker = `${index + 1}.`;
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

function normalizedListItem(item: HTMLElement, subtype: ListSubtype, index: number): string {
  const clone = item.cloneNode(true) as HTMLElement;
  clone.classList.remove("protyle-wysiwyg--select");
  applyListItemSubtype(clone, subtype, index);
  return clone.outerHTML;
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
