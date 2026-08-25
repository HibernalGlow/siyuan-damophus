import { getLogger } from "@/libs/logger";
import {
  cacheIsFresh,
  DEFAULT_FLASHCARD_SETTINGS,
  FLASHCARD_REVIEW_STAT_KEYS,
  type FlashcardGroup,
  type FlashcardGroupCache,
  type FlashcardReviewStatKey,
  type FlashcardReviewHistoryItem,
  type FlashcardReviewScope,
  type FlashcardDiagnosticRow,
  type FlashcardSettings,
} from "./types";
import { FlashcardSiyuanAdapter, type DueCardsData } from "./siyuan-adapter";
import { getHPathByID } from "@/api";

const log = getLogger("flashcard-runtime");

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mergeSettings(value: unknown): FlashcardSettings {
  const input = value && typeof value === "object" ? value as Partial<FlashcardSettings> : {};
  const groups = Array.isArray(input.groups) ? input.groups : DEFAULT_FLASHCARD_SETTINGS.groups;
  const categories = Array.isArray(input.categories) ? input.categories : DEFAULT_FLASHCARD_SETTINGS.categories;
  const rawReviewStats = input.reviewStats && typeof input.reviewStats === "object"
    ? input.reviewStats as Partial<FlashcardSettings["reviewStats"]>
    : {} as Partial<FlashcardSettings["reviewStats"]>;
  const rawOrder = Array.isArray(rawReviewStats.order) ? rawReviewStats.order : [];
  const order: FlashcardReviewStatKey[] = [];
  for (const value of rawOrder) {
    if ((FLASHCARD_REVIEW_STAT_KEYS as readonly string[]).includes(String(value))) {
      const key = value as FlashcardReviewStatKey;
      if (!order.includes(key)) order.push(key);
    }
  }
  for (const key of FLASHCARD_REVIEW_STAT_KEYS) {
    if (!order.includes(key)) order.push(key);
  }
  const visible = rawReviewStats.visible && typeof rawReviewStats.visible === "object"
    ? rawReviewStats.visible as Record<string, boolean>
    : {};
  const normalizedVisible = Object.fromEntries(FLASHCARD_REVIEW_STAT_KEYS.map((key) => [
    key,
    typeof visible[key] === "boolean" ? visible[key] : DEFAULT_FLASHCARD_SETTINGS.reviewStats.visible[key],
  ])) as FlashcardSettings["reviewStats"]["visible"];
  return {
    deckId: String(input.deckId ?? DEFAULT_FLASHCARD_SETTINGS.deckId),
    maxReviewCards: Math.max(1, Number(input.maxReviewCards ?? DEFAULT_FLASHCARD_SETTINGS.maxReviewCards)),
    maxResolveDepth: Math.max(1, Number(input.maxResolveDepth ?? DEFAULT_FLASHCARD_SETTINGS.maxResolveDepth)),
    cacheUpdateInterval: Math.max(1, Number(input.cacheUpdateInterval ?? DEFAULT_FLASHCARD_SETTINGS.cacheUpdateInterval)),
    scanInterval: Math.max(1, Number(input.scanInterval ?? DEFAULT_FLASHCARD_SETTINGS.scanInterval)),
    postponeEnabled: input.postponeEnabled === true,
    postponeDays: Math.max(0, Number(input.postponeDays ?? DEFAULT_FLASHCARD_SETTINGS.postponeDays)),
    confirmBeforeAutoRegister: input.confirmBeforeAutoRegister === true,
    rendererInterceptionEnabled: input.rendererInterceptionEnabled !== false,
    rendererVisibility: {
      ...DEFAULT_FLASHCARD_SETTINGS.rendererVisibility,
      ...(input.rendererVisibility && typeof input.rendererVisibility === "object" ? input.rendererVisibility : {}),
    },
    randomInterleaveEnabled: input.randomInterleaveEnabled === true,
    samePriorityShuffleEnabled: input.samePriorityShuffleEnabled === true,
    reviewStats: {
      enabled: rawReviewStats.enabled !== false,
      order,
      visible: normalizedVisible,
    },
    reviewTimerEnabled: input.reviewTimerEnabled !== false,
    reviewTimerContinueAfterAnswer: input.reviewTimerContinueAfterAnswer === true,
    reviewToolbarEnabled: input.reviewToolbarEnabled !== false,
    reviewToolbarLocate: input.reviewToolbarLocate !== false,
    reviewToolbarUnregister: input.reviewToolbarUnregister !== false,
    reviewToolbarPriority: input.reviewToolbarPriority !== false,
    reviewToolbarWorkbench: input.reviewToolbarWorkbench !== false,
    reviewToolbarRenderer: input.reviewToolbarRenderer !== false,
    reviewToolbarSkipBetween: input.reviewToolbarSkipBetween !== false,
    reviewToolbarShowExitFocus: input.reviewToolbarShowExitFocus === true,
    reviewToolbarShowBrand: input.reviewToolbarShowBrand !== false,
    reviewToolbarShowFilter: input.reviewToolbarShowFilter !== false,
    reviewToolbarShowFullscreen: input.reviewToolbarShowFullscreen !== false,
    showBreadcrumbReviewButton: input.showBreadcrumbReviewButton !== false,
    fsrsOptimizerMode: input.fsrsOptimizerMode === "browser" ? "browser" : "internal",
    groups: groups.map((group) => ({
      ...DEFAULT_FLASHCARD_SETTINGS.groups[0],
      ...group,
      id: String(group.id ?? crypto.randomUUID()),
      name: String(group.name ?? "新分组"),
      sqlQuery: String(group.sqlQuery ?? "SELECT id FROM blocks LIMIT 1"),
      categoryId: String(group.categoryId ?? "default"),
      cacheMinutes: Number(group.cacheMinutes ?? input.cacheUpdateInterval ?? 30),
      enabled: group.enabled !== false,
      queryFirst: group.queryFirst === true,
    })),
    categories: categories.map((category) => ({
      id: String(category.id ?? crypto.randomUUID()),
      name: String(category.name ?? "新分类"),
    })),
  };
}

export class FlashcardRuntime {
  readonly adapter = new FlashcardSiyuanAdapter();
  private settings: FlashcardSettings = clone(DEFAULT_FLASHCARD_SETTINGS);
  private cache = new Map<string, FlashcardGroupCache>();
  private timer?: number;
  private loaded = false;
  private historyLoaded = false;
  private history: FlashcardReviewHistoryItem[] = [];
  private readablePathCache = new Map<string, string>();

  constructor(
    private readonly readSetting: (key: string) => unknown,
    private readonly writeSetting: (key: string, value: unknown) => void | Promise<void>,
  ) {}

  load(): FlashcardSettings {
    if (this.loaded) return clone(this.settings);
    this.loaded = true;
    this.settings = mergeSettings(this.readSetting("config"));
    const storedCache = this.readSetting("cache");
    if (storedCache && typeof storedCache === "object") {
      for (const [key, value] of Object.entries(storedCache as Record<string, FlashcardGroupCache>)) {
        if (value && Array.isArray(value.blockIds)) this.cache.set(key, value);
      }
    }
    return clone(this.settings);
  }

  getSettings(): FlashcardSettings {
    return clone(this.load());
  }

  async getReadablePath(blockId: string): Promise<string> {
    const cached = this.readablePathCache.get(blockId);
    if (cached) return cached;
    const path = await getHPathByID(blockId);
    this.readablePathCache.set(blockId, path);
    return path;
  }

  async saveSettings(settings: FlashcardSettings): Promise<void> {
    this.settings = mergeSettings(settings);
    this.loaded = true;
    await this.writeSetting("config", clone(this.settings));
  }

  async importSfpSettings(settings: FlashcardSettings): Promise<void> {
    await this.saveSettings(settings);
    await this.clearCache();
  }

  getGroups(): FlashcardGroup[] {
    return clone(this.load().groups);
  }

  getEnabledGroups(): FlashcardGroup[] {
    return this.getGroups().filter((group) => group.enabled);
  }

  getHistory(): FlashcardReviewHistoryItem[] {
    if (!this.historyLoaded) {
      const stored = this.readSetting("history");
      this.history = Array.isArray(stored)
        ? stored.filter((item): item is FlashcardReviewHistoryItem => Boolean(
          item && typeof item === "object" && typeof (item as FlashcardReviewHistoryItem).id === "string",
        ))
        : [];
      this.historyLoaded = true;
    }
    return clone(this.history).sort((left, right) =>
      Number(right.pinned) - Number(left.pinned)
        || right.useCount - left.useCount
        || right.lastUsedAt - left.lastUsedAt,
    );
  }

  async recordScope(scope: FlashcardReviewScope): Promise<void> {
    this.getHistory();
    const current = this.history.find((item) => item.id === scope.id);
    if (current) {
      Object.assign(current, scope, { useCount: current.useCount + 1, lastUsedAt: Date.now() });
    } else {
      this.history.push({ ...scope, useCount: 1, lastUsedAt: Date.now(), pinned: false });
    }
    this.history = this.getHistory().slice(0, 50);
    await this.writeSetting("history", clone(this.history));
  }

  async setScopePinned(scopeId: string, pinned: boolean): Promise<void> {
    this.getHistory();
    const current = this.history.find((item) => item.id === scopeId);
    if (!current) return;
    current.pinned = pinned;
    await this.writeSetting("history", clone(this.history));
  }

  async removeScopeHistory(scopeId: string): Promise<void> {
    this.getHistory();
    this.history = this.history.filter((item) => item.id !== scopeId);
    await this.writeSetting("history", clone(this.history));
  }

  async saveGroup(group: FlashcardGroup): Promise<void> {
    const settings = this.load();
    const index = settings.groups.findIndex((candidate) => candidate.id === group.id);
    if (index >= 0) settings.groups[index] = clone(group);
    else settings.groups.push(clone(group));
    await this.saveSettings(settings);
  }

  async deleteGroup(groupId: string): Promise<void> {
    const settings = this.load();
    settings.groups = settings.groups.filter((group) => group.id !== groupId);
    this.cache.delete(groupId);
    await this.saveSettings(settings);
    await this.saveCache();
  }

  async saveCategory(category: { id: string; name: string }): Promise<void> {
    const settings = this.load();
    const index = settings.categories.findIndex((candidate) => candidate.id === category.id);
    if (index >= 0) settings.categories[index] = clone(category);
    else settings.categories.push(clone(category));
    await this.saveSettings(settings);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const settings = this.load();
    settings.categories = settings.categories.filter((category) => category.id !== categoryId);
    settings.groups = settings.groups.filter((group) => group.categoryId !== categoryId);
    await this.saveSettings(settings);
  }

  async reorderGroups(categoryId: string, groupId: string, direction: "up" | "down"): Promise<void> {
    const settings = this.load();
    const indexes = settings.groups
      .map((group, position) => ({ group, position }))
      .filter(({ group }) => group.categoryId === categoryId)
      .map(({ position }) => position);
    const globalIndex = settings.groups.findIndex((group) => group.id === groupId);
    const localIndex = indexes.indexOf(globalIndex);
    const targetLocalIndex = direction === "up" ? localIndex - 1 : localIndex + 1;
    if (localIndex < 0 || targetLocalIndex < 0 || targetLocalIndex >= indexes.length) return;
    const target = indexes[targetLocalIndex];
    [settings.groups[globalIndex], settings.groups[target]] = [settings.groups[target], settings.groups[globalIndex]];
    await this.saveSettings(settings);
  }

  async moveGroup(groupId: string, categoryId: string): Promise<void> {
    const settings = this.load();
    const group = settings.groups.find((candidate) => candidate.id === groupId);
    if (!group || !settings.categories.some((category) => category.id === categoryId)) return;
    group.categoryId = categoryId;
    await this.saveSettings(settings);
  }

  getCache(groupId: string): FlashcardGroupCache | undefined {
    const value = this.cache.get(groupId);
    return value ? clone(value) : undefined;
  }

  async saveCache(): Promise<void> {
    await this.writeSetting("cache", Object.fromEntries([...this.cache.entries()].map(([key, value]) => [key, clone(value)])));
  }

  async clearCache(groupId?: string): Promise<void> {
    if (groupId) this.cache.delete(groupId);
    else this.cache.clear();
    await this.saveCache();
  }

  async refreshEnabledGroups(forceUpdate = true): Promise<void> {
    await Promise.all(this.getEnabledGroups().map((group) =>
      this.provideGroupBlockIds(group, forceUpdate).catch((error) => {
        log.warn("group-refresh-failed", { groupId: group.id, error });
        throw error;
      }),
    ));
  }

  async provideGroupBlockIds(group: FlashcardGroup, forceUpdate = false): Promise<string[]> {
    this.load();
    const current = this.getCache(group.id);
    if (!forceUpdate && !group.queryFirst && cacheIsFresh(current, Date.now(), group.cacheMinutes)) {
      return current?.blockIds ?? [];
    }
    const rawRows = await this.adapter.paginatedSql(group.sqlQuery);
    const rawBlockIds = rawRows.map((row) => row.id).filter(Boolean);
    const roots = (await this.adapter.inspectRows(rawRows, {
      maxResolveDepth: this.settings.maxResolveDepth,
    })).filter((root) => root.status !== "unregistered").map((root) => root.blockId);
    const next = { blockIds: roots, rawBlockIds, updatedAt: Date.now(), query: group.sqlQuery };
    this.cache.set(group.id, next);
    await this.saveCache();
    return roots;
  }

  async buildGroupDueCards(group: FlashcardGroup, forceUpdate = false): Promise<DueCardsData> {
    const roots = await this.provideGroupBlockIds(group, forceUpdate);
    return this.adapter.buildDueCardsData(this.load().deckId, roots, this.load().maxReviewCards);
  }

  async provideScopeBlockIds(scope: FlashcardReviewScope, forceUpdate = false): Promise<string[]> {
    const group = scope.groupId ? this.getGroups().find((candidate) => candidate.id === scope.groupId) : undefined;
    if (scope.type === "group") {
      if (!group) throw new Error(`Unknown flashcard group: ${scope.groupId ?? scope.id}`);
      return this.provideGroupBlockIds(group, forceUpdate);
    }
    if (!scope.targetId) return [];
    const candidates = group
      ? await this.provideGroupBlockIds(group, forceUpdate)
      : (await this.getAllDeckCards()).map((card) => card.blockID);
    const rows = await this.adapter.loadBlocks(candidates);
    return rows.filter((row) => scope.type === "document"
      ? row.id === scope.targetId || row.root_id === scope.targetId
      : (row as { box?: string }).box === scope.targetId,
    ).map((row) => row.id);
  }

  async buildScopeDueCards(scope: FlashcardReviewScope, forceUpdate = false): Promise<DueCardsData> {
    const settings = this.load();
    if (!scope.groupId && scope.type === "document" && scope.targetId) {
      return this.adapter.getTreeDueCards(scope.targetId);
    }
    if (!scope.groupId && scope.type === "notebook" && scope.targetId) {
      return this.adapter.getNotebookDueCards(scope.targetId);
    }
    const roots = await this.provideScopeBlockIds(scope, forceUpdate);
    return this.adapter.buildDueCardsData(settings.deckId, roots, settings.maxReviewCards);
  }

  async buildDiagnostics(): Promise<FlashcardDiagnosticRow[]> {
    const settings = this.load();
    const cards = await this.getAllDeckCards();
    const roots = await this.adapter.inspectRoots(cards.map((card) => card.blockID), settings);
    const rootsById = new Map(roots.map((root) => [root.blockId, root]));
    const dueIds = new Set((await this.adapter.getDueCards(settings.deckId)).cards.map((card) => card.blockID));
    const groupIds = new Map<string, string[]>();
    for (const group of this.getEnabledGroups()) {
      for (const blockId of await this.provideGroupBlockIds(group)) {
        const names = groupIds.get(blockId) ?? [];
        names.push(group.name);
        groupIds.set(blockId, names);
      }
    }
    return cards.map((card) => {
      const root = rootsById.get(card.blockID) ?? {
        blockId: card.blockID,
        renderer: "unknown" as const,
        kind: "unknown" as const,
        attributes: {},
      };
      return { ...root, card, due: dueIds.has(card.blockID), groupNames: groupIds.get(card.blockID) ?? [] };
    });
  }

  async buildAllDueCards(): Promise<DueCardsData> {
    const settings = this.load();
    const due = await this.adapter.getDueCards(settings.deckId);
    const cards = due.cards.slice(0, Math.max(1, settings.maxReviewCards));
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
    };
  }

  async registerCards(blockIds: readonly string[]) {
    return this.adapter.addAndVerify(this.load().deckId, blockIds);
  }

  async getAllDeckCards() {
    return this.adapter.getAllCardsByDeckId(this.load().deckId);
  }

  async resetDeck(blockIds: readonly string[] = []): Promise<void> {
    await this.adapter.resetDeck(this.load().deckId, blockIds);
  }

  async previewBatchPriority(group: FlashcardGroup, priority: number): Promise<{ cards: Awaited<ReturnType<FlashcardSiyuanAdapter["getCardsByBlockIds"]>>; priority: number }> {
    const roots = await this.provideGroupBlockIds(group);
    const cards = await this.adapter.getCardsByBlockIds(roots);
    return { cards, priority };
  }

  async applyBatchPriority(group: FlashcardGroup, priority: number): Promise<{ status: "native" | "pending"; count: number }> {
    const preview = await this.previewBatchPriority(group, priority);
    if (preview.cards.length === 0) return { status: "pending", count: 0 };
    const status = await this.adapter.setPriority(preview.cards, preview.priority);
    return { status, count: preview.cards.length };
  }

  async postponeTodayCards(): Promise<{status: "disabled" | "empty" | "completed" | "pending"; count: number}> {
    const settings = this.load();
    if (!settings.postponeEnabled || settings.postponeDays <= 0) return { status: "disabled", count: 0 };
    // SFP's automation operates on the whole configured deck. Group membership
    // is intentionally ignored here so a newly-created card cannot bypass the
    // global postpone policy merely because it is not in an enabled SQL group.
    const cards = (await this.getAllDeckCards())
      .filter((card) => FlashcardSiyuanAdapter.isTodayCard(card) && FlashcardSiyuanAdapter.isPostponable(card));
    if (cards.length === 0) return { status: "empty", count: 0 };
    try {
      await this.adapter.postponeCards(cards, settings.postponeDays);
      return { status: "completed", count: cards.length };
    } catch (error) {
      log.warn("postpone-today-cards-failed", error);
      return { status: "pending", count: cards.length };
    }
  }

  startAutomation(): void {
    this.stopAutomation();
    const settings = this.load();
    const interval = Math.max(1, settings.cacheUpdateInterval) * 60_000;
    this.timer = window.setInterval(() => {
      for (const group of this.getEnabledGroups()) void this.provideGroupBlockIds(group, true).catch((error) => log.warn("cache-refresh-failed", error));
    }, interval);
    void this.refreshEnabledGroups(true).catch((error) => log.warn("initial-group-refresh-failed", error));
    if (settings.postponeEnabled) void this.postponeTodayCards().catch((error) => log.warn("initial-postpone-failed", error));
  }

  stopAutomation(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }
}
