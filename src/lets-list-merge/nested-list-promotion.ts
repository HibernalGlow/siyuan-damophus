import type { ListMergeOperation, ListSubtype } from "./list-merge";

export interface NestedListPromotionSelection {
  list: HTMLElement;
}

export interface NestedListPromotionPlan {
  listId: string;
  originalHtml: string;
  promotedHtml: string;
  promotedItemCount: number;
}

export interface NestedListPromotionTransaction {
  doOperations: ListMergeOperation[];
  undoOperations: ListMergeOperation[];
  result: { listId: string; promotedItemCount: number };
}

interface PromotionCandidate {
  nestedItems: HTMLElement[];
  subtype: ListSubtype;
}

const LIST_TYPE = "NodeList";
const LIST_ITEM_TYPE = "NodeListItem";
const SUPPORTED_SUBTYPES = new Set<ListSubtype>(["o", "u"]);

function subtypeOf(element: HTMLElement): ListSubtype | undefined {
  const subtype = element.dataset.subtype as ListSubtype | undefined;
  return subtype && SUPPORTED_SUBTYPES.has(subtype) ? subtype : undefined;
}

function directListItems(list: HTMLElement): HTMLElement[] | undefined {
  const items = Array.from(list.children).filter((child): child is HTMLElement => (
    child instanceof HTMLElement && child.dataset.type === LIST_ITEM_TYPE
  ));
  return items.length > 0 && items.every((item) => Boolean(item.dataset.nodeId)) ? items : undefined;
}

function hasMeaningfulContent(element: HTMLElement): boolean {
  const text = (element.textContent ?? "").replace(/[\s\u200B\uFEFF]/gu, "");
  if (text.length > 0) return true;
  return element.matches("img, audio, video, iframe, embed, object, input, textarea, select, button, svg, protyle-html")
    || Boolean(element.querySelector("img, audio, video, iframe, embed, object, input, textarea, select, button, svg, protyle-html, [data-type='img'], [data-type='widget']"));
}

function candidateFor(item: HTMLElement): PromotionCandidate | undefined {
  const nestedLists = Array.from(item.children).filter((child): child is HTMLElement => (
    child instanceof HTMLElement && child.dataset.type === LIST_TYPE
  ));
  if (nestedLists.length !== 1) return undefined;
  const nestedList = nestedLists[0];
  const subtype = subtypeOf(nestedList);
  const nestedItems = directListItems(nestedList);
  if (!subtype || !nestedItems) return undefined;

  const directContent = Array.from(item.children).filter((child): child is HTMLElement => (
    child instanceof HTMLElement
    && child !== nestedList
    && !child.classList.contains("protyle-action")
    && !child.classList.contains("protyle-attr")
  ));
  return directContent.some(hasMeaningfulContent)
    ? undefined
    : { nestedItems, subtype };
}

function cleanClone(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.remove("protyle-wysiwyg--select");
  clone.removeAttribute("select-start");
  clone.removeAttribute("select-end");
  return clone;
}

function applySubtype(item: HTMLElement, subtype: ListSubtype, index: number, start: number): void {
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
    return;
  }
  item.dataset.marker = "*";
  action.className = "protyle-action";
  action.removeAttribute("contenteditable");
  action.innerHTML = '<svg><use xlink:href="#iconDot"></use></svg>';
}

function orderedStart(items: readonly HTMLElement[]): number {
  const marker = items[0]?.dataset.marker ?? "";
  const parsed = /^\d+\.$/u.test(marker) ? Number(marker.slice(0, -1)) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function resolveNestedListPromotionSelection(
  blockElements: readonly HTMLElement[],
): NestedListPromotionSelection | undefined {
  if (blockElements.length !== 1) return undefined;
  const [list] = blockElements;
  if (
    list.dataset.type !== LIST_TYPE
    || !list.dataset.nodeId
    || !subtypeOf(list)
    || !list.closest(".protyle-wysiwyg")
  ) return undefined;
  return directListItems(list)?.some((item) => Boolean(candidateFor(item))) ? { list } : undefined;
}

export function createNestedListPromotionPlan(
  selection: NestedListPromotionSelection,
): NestedListPromotionPlan | undefined {
  const list = selection.list;
  const originalItems = directListItems(list);
  const outerSubtype = subtypeOf(list);
  if (!originalItems || !outerSubtype) return undefined;
  const candidates = new Map(originalItems.map((item) => [item, candidateFor(item)]));
  const promoted = [...candidates.values()].filter((candidate): candidate is PromotionCandidate => Boolean(candidate));
  if (promoted.length === 0) return undefined;

  const allPromoted = promoted.length === originalItems.length;
  const sharedNestedSubtype = allPromoted && promoted.every((candidate) => candidate.subtype === promoted[0].subtype)
    ? promoted[0].subtype
    : undefined;
  const targetSubtype = sharedNestedSubtype ?? outerSubtype;
  const nextItems = originalItems.flatMap((item) => {
    const candidate = candidates.get(item);
    return candidate ? candidate.nestedItems.map(cleanClone) : [cleanClone(item)];
  });
  const start = targetSubtype === "o" ? orderedStart(nextItems) : 1;
  nextItems.forEach((item, index) => applySubtype(item, targetSubtype, index, start));

  const replacement = list.cloneNode(false) as HTMLElement;
  replacement.dataset.subtype = targetSubtype;
  replacement.classList.remove("protyle-wysiwyg--select");
  replacement.removeAttribute("select-start");
  replacement.removeAttribute("select-end");
  replacement.append(...nextItems);
  const attr = Array.from(list.children).find((child): child is HTMLElement => (
    child instanceof HTMLElement && child.classList.contains("protyle-attr")
  ));
  if (attr) replacement.append(cleanClone(attr));

  return {
    listId: list.dataset.nodeId,
    originalHtml: list.outerHTML,
    promotedHtml: replacement.outerHTML,
    promotedItemCount: promoted.reduce((count, candidate) => count + candidate.nestedItems.length, 0),
  };
}

export function buildNestedListPromotionTransaction(
  plan: NestedListPromotionPlan,
): NestedListPromotionTransaction {
  return {
    doOperations: [{ action: "update", id: plan.listId, data: plan.promotedHtml }],
    undoOperations: [{ action: "update", id: plan.listId, data: plan.originalHtml }],
    result: { listId: plan.listId, promotedItemCount: plan.promotedItemCount },
  };
}

export function applyNestedListPromotionDom(plan: NestedListPromotionPlan): void {
  const list = document.querySelector<HTMLElement>(`[data-node-id="${plan.listId}"]`);
  if (!list) throw new Error(`List ${plan.listId} is no longer available`);
  list.outerHTML = plan.promotedHtml;
}

export function restoreNestedListPromotionDom(plan: NestedListPromotionPlan): void {
  const list = document.querySelector<HTMLElement>(`[data-node-id="${plan.listId}"]`);
  if (list) list.outerHTML = plan.originalHtml;
}
