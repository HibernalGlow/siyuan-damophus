import type { IOperation } from "siyuan";

export interface DocumentFormatBlock {
  id: string;
  parent_id?: string;
  root_id: string;
  type: string;
  content: string;
  sort: number;
}

export interface EmptyParagraphCleanupPlan {
  doOperations: IOperation[];
  undoOperations: IOperation[];
  count: number;
}

export interface CodeBlankLineCleanupPlan extends EmptyParagraphCleanupPlan {
  removedLineCount: number;
}

const EMPTY_TEXT_BLOCK_TYPES = new Set(["p", "h", "c", "m", "html"]);
const EMPTY_CONTAINER_BLOCK_TYPES = new Set(["b", "callout", "s", "l", "i"]);
const EMPTY_TEXT = /^[\s\u00a0\u200b\u200c\u200d\ufeff]*$/u;
const EMBEDDED_CONTENT = [
  '[data-type="img"]',
  '[data-type="inline-math"]',
  '[data-type="block-ref"]',
  '[data-type="a"]',
  '[data-type="tag"]',
  "img",
  "audio",
  "video",
  "iframe",
  "object",
  "embed",
].join(",");

export function isEmptyText(value: string | undefined): boolean {
  return EMPTY_TEXT.test(value ?? "");
}

export function isEmptyTextBlockType(type: string): boolean {
  return EMPTY_TEXT_BLOCK_TYPES.has(type);
}

export function isEmptyContainerBlockType(type: string): boolean {
  return EMPTY_CONTAINER_BLOCK_TYPES.has(type);
}

/**
 * The persisted DOM is the source of truth: block index content can retain
 * nonempty text even when the saved paragraph DOM is blank.
 */
export function isEmptyParagraphDom(dom: string): boolean {
  if (typeof document === "undefined") return false;
  const template = document.createElement("template");
  template.innerHTML = dom;
  const block = template.content.firstElementChild;
  if (!block) return false;
  const content = block.cloneNode(true) as HTMLElement;
  content.querySelectorAll(".protyle-attr, br, wbr").forEach((node) => node.remove());
  if (content.querySelector(EMBEDDED_CONTENT)) return false;

  const text = content.textContent?.replace(/[\u200b\u200c\u200d\ufeff]/gu, "") ?? "";
  return isEmptyText(text);
}

const CONTAINER_MARKERS = [
  ".protyle-attr",
  ".protyle-action",
  ".callout-title",
  ".callout-icon",
  ".callout-fold",
  '[data-type="NodeBlockquoteMarker"]',
  '[data-type="NodeSuperBlockOpenMarker"]',
  '[data-type="NodeSuperBlockLayoutMarker"]',
  '[data-type="NodeSuperBlockCloseMarker"]',
  '[data-type="NodeTaskListItemMarker"]',
].join(",");

export function isEmptyContainerDom(dom: string): boolean {
  if (typeof document === "undefined") return false;
  const template = document.createElement("template");
  template.innerHTML = dom;
  const block = template.content.firstElementChild;
  if (!block) return false;
  const content = block.cloneNode(true) as HTMLElement;
  content.querySelectorAll(`${CONTAINER_MARKERS}, br, wbr`).forEach((node) => node.remove());
  if (content.querySelector(EMBEDDED_CONTENT)) return false;
  const text = content.textContent?.replace(/[\u200b\u200c\u200d\ufeff]/gu, "") ?? "";
  return isEmptyText(text);
}

function codeText(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement;
  copy.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
  return copy.textContent ?? "";
}

export function removeCodeBlankLinesDom(dom: string): { dom: string; removedLineCount: number } | undefined {
  if (typeof document === "undefined") return undefined;
  const template = document.createElement("template");
  template.innerHTML = dom;
  const block = template.content.firstElementChild as HTMLElement | null;
  if (!block) return undefined;
  const target = block.querySelector<HTMLElement>(
    '[data-type="NodeCodeBlockCode"], code, [contenteditable="true"], .hljs',
  );
  if (!target) return undefined;
  const original = codeText(target);
  const lines = original.split(/\r?\n/u);
  const kept = lines.filter((line) => line.trim().length > 0);
  const removedLineCount = lines.length - kept.length;
  if (removedLineCount === 0) return undefined;
  target.textContent = kept.join("\n");
  return { dom: block.outerHTML, removedLineCount };
}

function siblingOperations(
  documentId: string,
  blocks: readonly DocumentFormatBlock[],
  selected: readonly DocumentFormatBlock[],
  domById: Readonly<Record<string, string>>,
): EmptyParagraphCleanupPlan {
  const siblings = new Map<string, DocumentFormatBlock[]>();
  for (const block of blocks) {
    const parentId = block.parent_id || documentId;
    const entries = siblings.get(parentId) ?? [];
    entries.push(block);
    siblings.set(parentId, entries);
  }
  for (const entries of siblings.values()) {
    entries.sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id));
  }
  const doOperations: IOperation[] = selected.map((block) => ({ action: "delete", id: block.id }));
  const undoOperations: IOperation[] = selected.map((block) => {
    const parentId = block.parent_id || documentId;
    const entries = siblings.get(parentId) ?? [];
    const index = entries.findIndex((entry) => entry.id === block.id);
    const previousID = index > 0 ? entries[index - 1]?.id : undefined;
    return {
      action: "insert",
      id: block.id,
      data: domById[block.id],
      parentID: parentId,
      ...(previousID ? { previousID } : {}),
    };
  });
  return { doOperations, undoOperations, count: selected.length };
}

export function createEmptyContainerCleanupPlan(
  documentId: string,
  blocks: readonly DocumentFormatBlock[],
  domById: Readonly<Record<string, string>>,
): EmptyParagraphCleanupPlan {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const selectedIds = new Set(blocks
    .filter((block) => isEmptyContainerBlockType(block.type))
    .filter((block) => typeof domById[block.id] === "string" && isEmptyContainerDom(domById[block.id]))
    .map((block) => block.id));
  const selected = blocks.filter((block) => {
    if (!selectedIds.has(block.id)) return false;
    let parentId = block.parent_id;
    while (parentId) {
      if (selectedIds.has(parentId)) return false;
      parentId = byId.get(parentId)?.parent_id;
    }
    return true;
  });
  return siblingOperations(documentId, blocks, selected, domById);
}

export function createCodeBlankLineCleanupPlan(
  blocks: readonly DocumentFormatBlock[],
  domById: Readonly<Record<string, string>>,
): CodeBlankLineCleanupPlan {
  const changed = blocks.flatMap((block) => {
    if (block.type !== "c" || typeof domById[block.id] !== "string") return [];
    const result = removeCodeBlankLinesDom(domById[block.id]);
    return result ? [{ block, ...result }] : [];
  });
  return {
    doOperations: changed.map(({ block, dom }) => ({ action: "update", id: block.id, data: dom })),
    undoOperations: changed.map(({ block }) => ({ action: "update", id: block.id, data: domById[block.id] })),
    count: changed.length,
    removedLineCount: changed.reduce((count, item) => count + item.removedLineCount, 0),
  };
}

export function createEmptyParagraphCleanupPlan(
  documentId: string,
  blocks: readonly DocumentFormatBlock[],
  domById: Readonly<Record<string, string>>,
  includeContainerParagraphs: boolean,
): EmptyParagraphCleanupPlan {
  const siblings = new Map<string, DocumentFormatBlock[]>();
  for (const block of blocks) {
    const parentId = block.parent_id || documentId;
    const entries = siblings.get(parentId) ?? [];
    entries.push(block);
    siblings.set(parentId, entries);
  }
  for (const entries of siblings.values()) {
    entries.sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id));
  }

  const selected = blocks
    .filter((block) => isEmptyTextBlockType(block.type))
    .filter((block) => includeContainerParagraphs || block.parent_id === documentId)
    .filter((block) => typeof domById[block.id] === "string" && domById[block.id].length > 0)
    .sort((left, right) => left.sort - right.sort || left.id.localeCompare(right.id));

  const doOperations: IOperation[] = selected.map((block) => ({ action: "delete", id: block.id }));
  const undoOperations: IOperation[] = selected.map((block) => {
    const parentId = block.parent_id || documentId;
    const entries = siblings.get(parentId) ?? [];
    const index = entries.findIndex((entry) => entry.id === block.id);
    const previousID = index > 0 ? entries[index - 1]?.id : undefined;
    return {
      action: "insert",
      id: block.id,
      data: domById[block.id],
      parentID: parentId,
      ...(previousID ? { previousID } : {}),
    };
  });

  return { doOperations, undoOperations, count: selected.length };
}
