export type FlashcardPriorityTag = "P1" | "P2" | "P3" | "P4";

/** Maps the adapter's 0-100 priority scale to the portable user-facing tag. */
export function priorityTag(priority: number): FlashcardPriorityTag {
  const value = Number.isFinite(priority) ? priority : 50;
  if (value >= 76) return "P1";
  if (value >= 51) return "P2";
  if (value >= 26) return "P3";
  return "P4";
}

const PRIORITY_TAG_PREFIX = "#\u95ea\u5361/\u4f18\u5148\u7ea7/";
export const PRIORITY_TAG_PATTERN = /#\u95ea\u5361\/\u4f18\u5148\u7ea7\/P[1-4]#/gu;

export function replacePriorityTag(markdown: string, priority: number): string {
  const replacement = `${PRIORITY_TAG_PREFIX}${priorityTag(priority)}#`;
  const withoutManagedTags = markdown.replace(PRIORITY_TAG_PATTERN, "");
  const trimmed = withoutManagedTags.replace(/\n+$/u, "");
  return trimmed ? `${trimmed}\n${replacement}` : replacement;
}
