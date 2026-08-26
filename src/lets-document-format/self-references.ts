import type { IOperation } from "siyuan";

export interface SelfReferenceCleanupPlan {
  doOperations: IOperation[];
  undoOperations: IOperation[];
  referenceCount: number;
  blockCount: number;
}

/**
 * Removes block references to the current document from persisted block DOM.
 * The caller supplies only SQL-filtered candidate blocks, so unloaded content
 * is handled without traversing the editor's rendered DOM.
 */
export function createSelfReferenceCleanupPlan(
  documentId: string,
  domById: Readonly<Record<string, string>>,
): SelfReferenceCleanupPlan {
  if (typeof document === "undefined") {
    return { doOperations: [], undoOperations: [], referenceCount: 0, blockCount: 0 };
  }

  const doOperations: IOperation[] = [];
  const undoOperations: IOperation[] = [];
  let referenceCount = 0;

  for (const [id, originalDom] of Object.entries(domById)) {
    const template = document.createElement("template");
    template.innerHTML = originalDom;
    const block = template.content.firstElementChild as HTMLElement | null;
    if (!block) continue;

    const references = Array.from(block.querySelectorAll<HTMLElement>('[data-type~="block-ref"]'))
      .filter((reference) => reference.dataset.id === documentId);
    if (references.length === 0) continue;

    for (const reference of references) reference.remove();
    referenceCount += references.length;
    doOperations.push({ action: "update", id, data: block.outerHTML });
    undoOperations.push({ action: "update", id, data: originalDom });
  }

  return {
    doOperations,
    undoOperations,
    referenceCount,
    blockCount: doOperations.length,
  };
}
