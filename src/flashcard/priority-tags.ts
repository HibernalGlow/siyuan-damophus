export type FlashcardPriorityTag = "P1" | "P2" | "P3" | "P4";

/** Maps the adapter's 0-100 priority scale to the portable user-facing tag. */
export function priorityTag(priority: number): FlashcardPriorityTag {
  const value = Number.isFinite(priority) ? priority : 0;
  if (value >= 76) return "P1";
  if (value >= 51) return "P2";
  if (value >= 26) return "P3";
  return "P4";
}

const PRIORITY_TAG_PREFIX = "#\u95ea\u5361/\u4f18\u5148\u7ea7/";
export const PRIORITY_TAG_PATTERN = /#\u95ea\u5361\/\u4f18\u5148\u7ea7\/P[1-4]#/gu;

export interface PriorityTagInfo {
  tags: FlashcardPriorityTag[];
  conflict: boolean;
}

function tagDepth(line: string): number {
  const indentation = line.match(/^\s*/u)?.[0].length ?? 0;
  const quoteDepth = (line.match(/(?:^|\s)>/gu) ?? []).length;
  return indentation + quoteDepth * 4;
}

function hasPriorityTag(line: string): boolean {
  PRIORITY_TAG_PATTERN.lastIndex = 0;
  const found = PRIORITY_TAG_PATTERN.test(line);
  PRIORITY_TAG_PATTERN.lastIndex = 0;
  return found;
}

/** Reads the shallowest tag scope so nested child-card tags do not override a parent. */
export function readPriorityTags(markdown: string): PriorityTagInfo {
  const lines = markdown.split(/\r?\n/u);
  const taggedLines = lines.filter(hasPriorityTag);
  if (taggedLines.length === 0) return { tags: [], conflict: false };
  const shallowest = Math.min(...taggedLines.map((line) => tagDepth(line)));
  const tags = [...new Set(taggedLines
    .filter((line) => tagDepth(line) === shallowest)
    .flatMap((line) => [...line.matchAll(PRIORITY_TAG_PATTERN)].map((match) => match[0].slice(-3, -1) as FlashcardPriorityTag)))];
  PRIORITY_TAG_PATTERN.lastIndex = 0;
  return { tags, conflict: tags.length > 1 };
}

export function replacePriorityTag(markdown: string, priority: number): string {
  const replacement = `${PRIORITY_TAG_PREFIX}${priorityTag(priority)}#`;
  const lines = markdown.split(/\r?\n/u);
  const taggedLines = lines.filter(hasPriorityTag);
  if (taggedLines.length > 0) {
    const shallowest = Math.min(...taggedLines.map((line) => tagDepth(line)));
    return lines.map((line) => {
      if (tagDepth(line) !== shallowest || !hasPriorityTag(line)) return line;
      PRIORITY_TAG_PATTERN.lastIndex = 0;
      return line.replace(PRIORITY_TAG_PATTERN, replacement);
    }).join("\n");
  }
  const trimmed = markdown.replace(/\n+$/u, "");
  return trimmed ? `${trimmed}\n${replacement}` : replacement;
}
