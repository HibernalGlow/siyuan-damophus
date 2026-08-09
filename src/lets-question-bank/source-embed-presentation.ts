export const sourceBlockProtyleActions = ["cb-get-all"] as const;

export const sourceBlockEditorMode = "wysiwyg" as const;

export function enforceSourceBlockReadOnly(root: HTMLElement): () => void {
  const apply = () => {
    root.querySelectorAll<HTMLElement>('[contenteditable="true"]').forEach((element) => {
      element.contentEditable = "false";
    });
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["contenteditable"],
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}

export type SourceEmbedHeadingMode = "0" | "1" | "2";

export function normalizeSourceEmbedHeadingMode(value: unknown): SourceEmbedHeadingMode {
  return value === "1" || value === "2" ? value : "0";
}

export function sourceEmbedBlockAttributes(options: {
  breadcrumb?: boolean;
  headingMode?: unknown;
} = {}): Record<string, string> {
  return {
    breadcrumb: String(options.breadcrumb === true),
    "custom-heading-mode": normalizeSourceEmbedHeadingMode(options.headingMode),
  };
}

export function observeFocusedBlock(
  wysiwyg: HTMLElement,
  blockId: string,
  retainedBlockIds: readonly string[] = [blockId],
): () => void {
  let pruning = false;
  const retainedIds = new Set(retainedBlockIds);
  retainedIds.add(blockId);

  const prune = (): void => {
    if (pruning) return;
    const target = [...wysiwyg.querySelectorAll<HTMLElement>("[data-node-id]")]
      .find((element) => element.dataset.nodeId === blockId);
    if (!target) return;

    pruning = true;
    try {
      const blocks = [...wysiwyg.querySelectorAll<HTMLElement>("[data-node-id]")];
      for (const element of blocks.reverse()) {
        const id = element.dataset.nodeId;
        if (id && retainedIds.has(id)) continue;
        if (element.closest([...retainedIds].map((retainedId) => `[data-node-id="${retainedId}"]`).join(","))) continue;
        if ([...element.querySelectorAll<HTMLElement>("[data-node-id]")]
          .some((descendant) => descendant.dataset.nodeId && retainedIds.has(descendant.dataset.nodeId))) continue;
        element.remove();
      }
    } finally {
      pruning = false;
    }
  };

  prune();
  const observer = new MutationObserver(prune);
  observer.observe(wysiwyg, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function defocusProtyleEditor(wysiwyg: HTMLElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && wysiwyg.contains(active)) active.blur();
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && wysiwyg.contains(selection.anchorNode)) {
    selection.removeAllRanges();
  }
}
