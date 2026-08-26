import { readPriorityTags } from "./priority-tags";

export const FLASHCARD_RENDERERS = [
  "mark",
  "list",
  "heading",
  "superBlock",
  "blockquote",
  "callout",
] as const;

export type FlashcardRenderer = (typeof FLASHCARD_RENDERERS)[number];
export type FlashcardKind = "basic" | "cloze";
export type FlashcardCardStatus = "unregistered";

export interface FlashcardAttributes {
  "custom-dm-source-key"?: string;
  "custom-dm-card-id"?: string;
  "custom-dm-card-schema"?: string;
  "custom-dm-card-kind"?: string;
  "custom-dm-card-renderer"?: string;
  "custom-qb-note-topic-id"?: string;
  "custom-qb-question-topic-ids"?: string;
  "custom-riff-decks"?: string;
  "custom-dm-card-status"?: string;
  "custom-dm-card-last-unregistered-at"?: string;
  "custom-dm-card-last-unregistered-deck-id"?: string;
  "custom-dm-card-last-unregister-scope"?: string;
  bookmark?: string;
  "custom-card-priority-stop"?: string;
  [key: string]: string | undefined;
}

export interface FlashcardBlockRow {
  id: string;
  box?: string;
  hpath?: string;
  parent_id?: string | null;
  root_id?: string | null;
  type?: string;
  content?: string;
  ial?: string;
  attributes?: FlashcardAttributes;
}

export interface FlashcardRoot {
  blockId: string;
  renderer: FlashcardRenderer | "unknown";
  kind: FlashcardKind | "unknown";
  cardId?: string;
  content?: string;
  attributes: FlashcardAttributes;
  priority?: "P1" | "P2" | "P3" | "P4";
  priorityConflict?: boolean;
  status?: FlashcardCardStatus;
}

export interface FlashcardGroup {
  id: string;
  name: string;
  sqlQuery: string;
  categoryId: string;
  enabled: boolean;
  queryFirst: boolean;
  cacheMinutes: number;
}

export interface FlashcardCategory {
  id: string;
  name: string;
}

export interface FlashcardGroupCache {
  blockIds: string[];
  rawBlockIds: string[];
  updatedAt: number;
  query: string;
}

export type FlashcardReviewScopeType = "group" | "document" | "notebook";
export type FsrsOptimizerMode = "internal" | "browser";

export const FLASHCARD_REVIEW_STAT_KEYS = [
  "reviews",
  "lastReview",
  "lapses",
  "lapseRate",
  "interval",
] as const;

export type FlashcardReviewStatKey = (typeof FLASHCARD_REVIEW_STAT_KEYS)[number];

export interface FlashcardReviewStatsSettings {
  enabled: boolean;
  order: FlashcardReviewStatKey[];
  visible: Record<FlashcardReviewStatKey, boolean>;
}

export interface FlashcardReviewScope {
  id: string;
  type: FlashcardReviewScopeType;
  targetId?: string;
  targetName: string;
  groupId?: string;
  groupName?: string;
}

export interface FlashcardReviewHistoryItem extends FlashcardReviewScope {
  useCount: number;
  lastUsedAt: number;
  pinned: boolean;
}

export interface FlashcardDiagnosticRow extends FlashcardRoot {
  card: import("./siyuan-adapter").RiffCardRecord;
  due: boolean;
  groupNames: string[];
}

export type FlashcardScopedReviewMode = "exact" | "native";

export interface FlashcardSettings {
  deckId: string;
  maxReviewCards: number;
  scopedReviewMode: FlashcardScopedReviewMode;
  maxResolveDepth: number;
  cacheUpdateInterval: number;
  /** SFP compatibility field; retained for migrated settings. */
  scanInterval: number;
  postponeEnabled: boolean;
  postponeDays: number;
  confirmBeforeAutoRegister: boolean;
  autoReviewAfterRegistration: boolean;
  groups: FlashcardGroup[];
  categories: FlashcardCategory[];
  rendererInterceptionEnabled: boolean;
  rendererVisibility: {
    mark: boolean;
    list: boolean;
    heading: boolean;
    superBlock: boolean;
    blockquote: boolean;
    callout: boolean;
    tag: boolean;
    topicRelations: boolean;
  };
  randomInterleaveEnabled: boolean;
  samePriorityShuffleEnabled: boolean;
  reviewStats: FlashcardReviewStatsSettings;
  reviewTimerEnabled: boolean;
  reviewTimerContinueAfterAnswer: boolean;
  reviewTimerPauseOnBlur: boolean;
  reviewToolbarEnabled: boolean;
  reviewToolbarLocate: boolean;
  reviewToolbarUnregister: boolean;
  reviewToolbarPriority: boolean;
  reviewToolbarWorkbench: boolean;
  reviewToolbarRenderer: boolean;
  reviewToolbarSkipBetween: boolean;
  reviewToolbarShowExitFocus: boolean;
  reviewToolbarShowBrand: boolean;
  reviewToolbarShowFilter: boolean;
  reviewToolbarShowFullscreen: boolean;
  showBreadcrumbReviewButton: boolean;
  fsrsOptimizerMode: FsrsOptimizerMode;
}

export const DEFAULT_FLASHCARD_SETTINGS: FlashcardSettings = {
  deckId: "20230218211946-2kw8jgx",
  maxReviewCards: 200,
  scopedReviewMode: "exact",
  maxResolveDepth: 8,
  cacheUpdateInterval: 30,
  scanInterval: 15,
  postponeEnabled: false,
  postponeDays: 2,
  confirmBeforeAutoRegister: false,
  autoReviewAfterRegistration: true,
  rendererInterceptionEnabled: true,
  rendererVisibility: { mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false, topicRelations: false },
  randomInterleaveEnabled: false,
  samePriorityShuffleEnabled: false,
  reviewStats: {
    enabled: true,
    order: [...FLASHCARD_REVIEW_STAT_KEYS],
    visible: {
      reviews: true,
      lastReview: true,
      lapses: true,
      lapseRate: true,
      interval: true,
    },
  },
  reviewTimerEnabled: true,
  reviewTimerContinueAfterAnswer: false,
  reviewTimerPauseOnBlur: true,
  reviewToolbarEnabled: true,
  reviewToolbarLocate: true,
  reviewToolbarUnregister: true,
  reviewToolbarPriority: true,
  reviewToolbarWorkbench: true,
  reviewToolbarRenderer: true,
  reviewToolbarSkipBetween: true,
  reviewToolbarShowExitFocus: false,
  reviewToolbarShowBrand: true,
  reviewToolbarShowFilter: true,
  reviewToolbarShowFullscreen: true,
  showBreadcrumbReviewButton: true,
  fsrsOptimizerMode: "internal",
  categories: [{ id: "default", name: "默认分组" }],
  groups: [
    {
      id: "all-cards",
      name: "所有闪卡",
      sqlQuery: "SELECT id FROM blocks WHERE id IN (SELECT block_id FROM attributes WHERE name = 'custom-riff-decks')",
      categoryId: "default",
      enabled: true,
      queryFirst: false,
      cacheMinutes: 30,
    },
    {
      id: "tagged-cards",
      name: "含指定标签",
      sqlQuery: "SELECT id FROM blocks WHERE tag LIKE '%#指定标签#%'",
      categoryId: "default",
      enabled: false,
      queryFirst: false,
      cacheMinutes: 30,
    },
  ],
};

export function parseIALAttributes(ial: string | undefined): FlashcardAttributes {
  if (!ial) return {};
  const result: FlashcardAttributes = {};
  const expression = /([A-Za-z][A-Za-z0-9-]*)=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/gu;
  for (const match of ial.matchAll(expression)) {
    result[match[1]] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

export function normalizeBlockRow(row: FlashcardBlockRow): FlashcardBlockRow {
  return {
    ...row,
    attributes: row.attributes ?? parseIALAttributes(row.ial),
  };
}

export function cardRenderer(attributes: FlashcardAttributes): FlashcardRoot["renderer"] {
  return cardRendererForRow(attributes);
}

function cardRendererForRow(attributes: FlashcardAttributes, type?: string): FlashcardRoot["renderer"] {
  const value = attributes["custom-dm-card-renderer"];
  if (value && (FLASHCARD_RENDERERS as readonly string[]).includes(value)) {
    return value as FlashcardRenderer;
  }
  if (attributes["custom-riff-decks"] || attributes["custom-dm-card-id"]) return "unknown";
  if (type === "l") return "list";
  if (type === "h") return "heading";
  if (type === "s") return "superBlock";
  if (type === "b") return "blockquote";
  if (type === "callout") return "callout";
  return "unknown";
}

export function cardKind(attributes: FlashcardAttributes): FlashcardRoot["kind"] {
  const value = attributes["custom-dm-card-kind"];
  return value === "basic" || value === "cloze" ? value : "unknown";
}

export function isExplicitCardRoot(row: FlashcardBlockRow): boolean {
  const normalized = normalizeBlockRow(row);
  const attributes = normalized.attributes ?? {};
  return Boolean(
    attributes["custom-dm-card-id"]
      || attributes["custom-dm-card-renderer"]
      || attributes["custom-riff-decks"],
  ) || ["l", "h", "s", "b", "callout"].includes(normalized.type ?? "");
}

export function toFlashcardRoot(row: FlashcardBlockRow): FlashcardRoot | undefined {
  const normalized = normalizeBlockRow(row);
  if (!isExplicitCardRoot(normalized)) return undefined;
  const renderer = cardRendererForRow(normalized.attributes ?? {}, normalized.type);
  const declaredKind = cardKind(normalized.attributes ?? {});
  const kind = declaredKind !== "unknown"
    ? declaredKind
    : renderer === "mark" ? "cloze" : renderer === "unknown" ? "unknown" : "basic";
  const priorityInfo = readPriorityTags(normalized.content ?? "");
  const status = normalized.attributes?.["custom-dm-card-status"] === "unregistered"
    ? "unregistered"
    : undefined;
  return {
    blockId: normalized.id,
    renderer,
    kind,
    cardId: normalized.attributes?.["custom-dm-card-id"],
    content: normalized.content,
    attributes: normalized.attributes ?? {},
    priority: priorityInfo.tags[0],
    priorityConflict: priorityInfo.conflict,
    status,
  };
}

export function resolveCardRoots(
  startingRows: readonly FlashcardBlockRow[],
  parentRows: ReadonlyMap<string, FlashcardBlockRow>,
  maxDepth = 8,
): string[] {
  const roots = new Set<string>();
  for (const starting of startingRows) {
    let current = normalizeBlockRow(starting);
    const visited = new Set<string>();
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      if (visited.has(current.id)) break;
      visited.add(current.id);
      if (isExplicitCardRoot(current)) {
        roots.add(current.id);
        break;
      }
      const parentId = current.parent_id ?? undefined;
      if (!parentId) break;
      const parent = parentRows.get(parentId);
      if (!parent) break;
      current = normalizeBlockRow(parent);
    }
  }
  return [...roots];
}

export function cacheIsFresh(cache: FlashcardGroupCache | undefined, now: number, minutes: number): boolean {
  return Boolean(cache && now - cache.updatedAt < Math.max(0, minutes) * 60_000);
}

export function dedupeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => /^\d{14}-[a-z0-9]{7}$/u.test(id)))];
}
