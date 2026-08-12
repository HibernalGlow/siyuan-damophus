import type { IOperation, IProtyle } from "siyuan";
import type { NativeCalloutType } from "./callout-smart-insert";

export interface CalloutTypeDefinition {
  type: NativeCalloutType;
  title: string;
  icon: string;
  color: string;
}

export const CALLOUT_TYPE_DEFINITIONS: readonly CalloutTypeDefinition[] = [
  { type: "NOTE", title: "Note", icon: "\u270f\ufe0f", color: "var(--b3-callout-note)" },
  { type: "TIP", title: "Tip", icon: "\ud83d\udca1", color: "var(--b3-callout-tip)" },
  { type: "IMPORTANT", title: "Important", icon: "\u2757", color: "var(--b3-callout-important)" },
  { type: "WARNING", title: "Warning", icon: "\u26a0\ufe0f", color: "var(--b3-callout-warning)" },
  { type: "CAUTION", title: "Caution", icon: "\ud83d\udea8", color: "var(--b3-callout-caution)" },
] as const;

export interface CalloutConversionPlan {
  blocks: HTMLElement[];
  parentId: string;
  promoteHeadingToTitle: boolean;
  type: CalloutTypeDefinition;
}

const DISALLOWED_BLOCK_TYPES = new Set(["NodeDocument"]);

function uniqueTopLevelBlocks(blocks: readonly HTMLElement[]): HTMLElement[] {
  const unique = [...new Set(blocks)].filter((block) => block.dataset.nodeId && block.dataset.type);
  return unique.filter((block) => !unique.some((candidate) => candidate !== block && candidate.contains(block)));
}

function listItemBodyBlocks(listItem: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  for (const child of listItem.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.dataset.type === "NodeList") break;
    if (!child.dataset.nodeId || !child.dataset.type) continue;
    if (DISALLOWED_BLOCK_TYPES.has(child.dataset.type) || child.dataset.type === "NodeListItem") return [];
    blocks.push(child);
  }
  return blocks;
}

function conversionBlocks(sourceBlocks: readonly HTMLElement[]): HTMLElement[] {
  const blocks = uniqueTopLevelBlocks(sourceBlocks);
  if (blocks.length !== 1 || blocks[0].dataset.type !== "NodeListItem") return blocks;
  return listItemBodyBlocks(blocks[0]);
}

export function createCalloutConversionPlan(
  sourceBlocks: readonly HTMLElement[],
  type: CalloutTypeDefinition,
  protyle: IProtyle,
  promoteHeadingToTitle = true,
): CalloutConversionPlan | undefined {
  if (protyle.disabled) return undefined;
  const blocks = conversionBlocks(sourceBlocks);
  if (blocks.length === 0) return undefined;
  if (blocks.some((block) => DISALLOWED_BLOCK_TYPES.has(block.dataset.type ?? ""))) return undefined;

  if (blocks.length === 1 && blocks[0].dataset.type === "NodeCallout") {
    return {
      blocks,
      parentId: blocks[0].parentElement?.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId
        ?? protyle.block.parentID ?? "",
      promoteHeadingToTitle,
      type,
    };
  }

  const parent = blocks[0].parentElement;
  if (!parent || blocks.some((block) => block.parentElement !== parent)) return undefined;
  const ordered = Array.from(parent.children).filter((item): item is HTMLElement => blocks.includes(item as HTMLElement));
  if (ordered.length !== blocks.length) return undefined;
  const firstIndex = Array.from(parent.children).indexOf(ordered[0]);
  if (ordered.some((block, index) => parent.children[firstIndex + index] !== block)) return undefined;

  const parentId = parent.closest<HTMLElement>("[data-node-id]")?.dataset.nodeId
    ?? protyle.block.parentID;
  if (!parentId) return undefined;
  return { blocks: ordered, parentId, promoteHeadingToTitle, type };
}

function createCalloutElement(
  document: Document,
  id: string,
  definition: CalloutTypeDefinition,
  titleHtml?: string,
): HTMLElement {
  const callout = document.createElement("div");
  callout.className = "callout";
  callout.dataset.nodeId = id;
  callout.dataset.type = "NodeCallout";
  callout.dataset.subtype = definition.type;
  callout.contentEditable = "false";
  callout.innerHTML = `<div class="callout-info"><span class="callout-icon">${definition.icon}</span><span class="callout-title">${definition.title}</span></div><div class="callout-content"></div><div class="protyle-attr" contenteditable="false">\u200b</div>`;
  if (titleHtml !== undefined) {
    callout.querySelector<HTMLElement>(":scope > .callout-info > .callout-title")!.innerHTML = titleHtml;
  }
  return callout;
}

function headingTitleHtml(heading: HTMLElement): string {
  const editable = heading.matches('[contenteditable="true"]')
    ? heading
    : heading.querySelector<HTMLElement>(":scope > [contenteditable=\"true\"]");
  const clone = (editable ?? heading).cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".protyle-attr, .protyle-action, .protyle-icons").forEach((item) => item.remove());
  return clone.innerHTML;
}

function clearSelectionMarkers(block: HTMLElement): void {
  block.classList.remove("protyle-wysiwyg--select");
  block.removeAttribute("select-start");
  block.removeAttribute("select-end");
}

export function convertBlocksToCallout(
  plan: CalloutConversionPlan,
  protyle: IProtyle,
  newNodeId: () => string = () => window.Lute.NewNodeID(),
): boolean {
  const instance = protyle.getInstance?.();
  if (!instance || typeof instance.transaction !== "function") return false;

  if (plan.blocks.length === 1 && plan.blocks[0].dataset.type === "NodeCallout") {
    const callout = plan.blocks[0];
    const oldHtml = callout.outerHTML;
    callout.dataset.subtype = plan.type.type;
    const title = callout.querySelector<HTMLElement>(":scope > .callout-info > .callout-title");
    const icon = callout.querySelector<HTMLElement>(":scope > .callout-info > .callout-icon");
    if (!title || !icon) return false;
    title.textContent = plan.type.title;
    icon.textContent = plan.type.icon;
    instance.transaction(
      [{ action: "update", id: callout.dataset.nodeId, data: callout.outerHTML }],
      [{ action: "update", id: callout.dataset.nodeId, data: oldHtml }],
    );
    return true;
  }

  const first = plan.blocks[0];
  const titleBlock = plan.promoteHeadingToTitle && plan.blocks.length > 1
    ? plan.blocks.find((block) => block.dataset.type === "NodeHeading")
    : undefined;
  const bodyBlocks = titleBlock ? plan.blocks.filter((block) => block !== titleBlock) : plan.blocks;
  if (bodyBlocks.length === 0 || plan.blocks.some((block) => !block.dataset.nodeId)) return false;
  const calloutId = newNodeId();
  const callout = createCalloutElement(
    first.ownerDocument,
    calloutId,
    plan.type,
    titleBlock ? headingTitleHtml(titleBlock) : undefined,
  );
  const content = callout.querySelector<HTMLElement>(":scope > .callout-content")!;
  const shellHtml = callout.outerHTML;
  first.before(callout);

  const doOperations: IOperation[] = [{
    action: "insert",
    id: calloutId,
    data: shellHtml,
    nextID: first.dataset.nodeId,
    parentID: plan.parentId,
  }];
  const undoOperations: IOperation[] = [];
  let previousMovedId: string | undefined;
  if (titleBlock) {
    clearSelectionMarkers(titleBlock);
    doOperations.push({ action: "delete", id: titleBlock.dataset.nodeId });
  }
  for (const block of bodyBlocks) {
    const blockId = block.dataset.nodeId!;
    clearSelectionMarkers(block);
    doOperations.push({
      action: "move",
      id: blockId,
      previousID: previousMovedId,
      parentID: calloutId,
    });
    content.append(block);
    previousMovedId = blockId;
  }
  let previousRestoredId = calloutId;
  for (const block of plan.blocks) {
    const blockId = block.dataset.nodeId!;
    if (block === titleBlock) {
      undoOperations.push({
        action: "insert",
        id: blockId,
        data: block.outerHTML,
        previousID: previousRestoredId,
        parentID: plan.parentId,
      });
    } else {
      undoOperations.push({
        action: "move",
        id: blockId,
        previousID: previousRestoredId,
        parentID: plan.parentId,
      });
    }
    previousRestoredId = blockId;
  }
  titleBlock?.remove();
  undoOperations.push({ action: "delete", id: calloutId });
  instance.transaction(doOperations, undoOperations);
  return true;
}
