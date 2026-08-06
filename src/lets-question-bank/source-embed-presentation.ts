export const sourceBlockProtyleActions = [] as const;

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
): () => void {
  let pruning = false;

  const prune = (): void => {
    if (pruning) return;
    const target = [...wysiwyg.querySelectorAll<HTMLElement>("[data-node-id]")]
      .find((element) => element.dataset.nodeId === blockId);
    if (!target) return;

    pruning = true;
    try {
      let branch = target;
      while (branch.parentElement && branch.parentElement !== wysiwyg) {
        const parent = branch.parentElement;
        for (const sibling of [...parent.children]) {
          if (sibling !== branch && (sibling as HTMLElement).hasAttribute("data-node-id")) {
            sibling.remove();
          }
        }
        branch = parent;
      }
      for (const sibling of [...wysiwyg.children]) {
        if (sibling !== branch) sibling.remove();
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
