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
    .filter((block) => block.type === "p")
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
