export const AFWD_ATTRIBUTE = "custom-afwd";

export const AFWD_DOC_KEYS = ["all", "db", "t", "p", "iframe", "sb"] as const;
export const AFWD_BLOCK_KEYS = ["on", "off"] as const;

// Image paragraphs additionally support "deep": break out of any container
// (lists, quotes, super blocks) to the full editor width.
export const AFWD_IMAGE_BLOCK_KEYS = ["on", "deep", "off"] as const;

// Exclusion setting values use SiYuan block types (the blockTypes selector);
// several embed kinds share the iframe breakout rules.
export const AFWD_TYPE_BY_BLOCK: Record<string, string> = {
  NodeParagraph: "p",
  NodeTable: "t",
  NodeAttributeView: "db",
  NodeIFrame: "iframe",
  NodeVideo: "iframe",
  NodeWidget: "iframe",
  NodeSuperBlock: "sb",
};

export function globalExcludedAfwdTypes(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const excluded = new Set<string>();
  for (const item of list) {
    const docType = AFWD_TYPE_BY_BLOCK[item];
    if (docType) excluded.add(docType);
  }
  return [...excluded];
}

export function parseAfwdAttr(value: string | undefined | null): string[] {
  if (!value) return [];
  return value.split(/\s+/).filter(Boolean);
}

export function serializeAfwdAttr(values: readonly string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    parts.push(trimmed);
  }
  return parts.join(" ");
}
