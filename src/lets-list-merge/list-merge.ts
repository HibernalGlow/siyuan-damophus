export type ListSubtype = "o" | "u";

export interface SelectedList {
  id: string;
  subtype: ListSubtype;
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

export interface ListChildBlock {
  id: string;
  type: string;
}

export interface ListMergeOperations {
  getChildBlocks(id: string): Promise<ListChildBlock[]>;
  moveBlock(id: string, previousID?: string, parentID?: string): Promise<unknown>;
  deleteBlock(id: string): Promise<unknown>;
}

export interface ListMergeResult {
  mergedItemCount: number;
  targetId: string;
  sourceIds: string[];
  subtype: ListSubtype;
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

function assertListItems(children: readonly ListChildBlock[], listId: string): void {
  if (children.some((child) => child.type !== "i")) {
    throw new Error(`List ${listId} contains an unsupported direct child`);
  }
  if (children.length === 0) throw new Error(`List ${listId} is empty`);
}

export async function mergeListBlocks(
  plan: ListMergePlan,
  operations: ListMergeOperations,
): Promise<ListMergeResult> {
  const childGroups = await Promise.all(
    plan.orderedListIds.map((listId) => operations.getChildBlocks(listId)),
  );
  childGroups.forEach((children, index) => assertListItems(children, plan.orderedListIds[index]));

  const targetIndex = plan.orderedListIds.indexOf(plan.targetId);
  const targetChildren = childGroups[targetIndex];
  const mergedItemCount = childGroups.reduce((count, children) => count + children.length, 0);

  if (plan.reorderTargetItems) {
    let previousId: string | undefined;
    for (const item of childGroups.flat()) {
      if (previousId) {
        await operations.moveBlock(item.id, previousId);
      } else {
        await operations.moveBlock(item.id, undefined, plan.targetId);
      }
      previousId = item.id;
    }
  } else {
    let previousId = targetChildren.at(-1)!.id;
    for (const [index, children] of childGroups.entries()) {
      if (index === targetIndex) continue;
      for (const item of children) {
        await operations.moveBlock(item.id, previousId);
        previousId = item.id;
      }
    }
  }

  for (const sourceId of plan.sourceIds) await operations.deleteBlock(sourceId);
  return {
    mergedItemCount,
    targetId: plan.targetId,
    sourceIds: plan.sourceIds,
    subtype: plan.subtype,
  };
}
