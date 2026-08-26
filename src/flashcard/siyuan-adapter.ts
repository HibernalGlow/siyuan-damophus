import { getBlockKramdownStrict, getChildBlocksStrict, requestStrict, updateBlockStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import type {
  FlashcardBlockRow,
  FlashcardRoot,
  FlashcardScopedReviewMode,
  FlashcardSettings,
} from "./types";
import {
  dedupeIds,
  normalizeBlockRow,
  resolveCardRoots,
  toFlashcardRoot,
} from "./types";
import { deactivatePriorityTags, reactivatePriorityTags, replacePriorityTag } from "./priority-tags";

const log = getLogger("flashcard-adapter");
const nodeId = /^\d{14}-[a-z0-9]{7}$/u;

export interface RiffCardRecord {
  blockID: string;
  cardID: string;
  riffCardID?: string;
  id?: string;
  deckID?: string;
  state?: number;
  created?: string;
  ial?: Record<string, string>;
  priority?: number;
  [key: string]: unknown;
}

export interface DueCardsData {
  cards: RiffCardRecord[];
  unreviewedCount: number;
  unreviewedNewCardCount: number;
  unreviewedOldCardCount: number;
  candidateCount?: number;
  registeredCount?: number;
}

export interface CardRegistrationResult {
  blockId: string;
  status: "registered" | "already-registered" | "pending";
  reason?: string;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function idsClause(ids: readonly string[]): string {
  return dedupeIds(ids).map(sqlQuote).join(", ");
}

function normalizeRiffCard(value: unknown): RiffCardRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  // The block endpoint returns a placeholder when the block is not registered.
  if ("riffCardID" in record && !String(record.riffCardID ?? "")) return undefined;
  const blockID = String(record.blockID ?? record.block_id ?? record.id ?? "");
  const cardID = String(record.cardID ?? record.riffCardID ?? record.card_id ?? "");
  if (!blockID || !cardID) return undefined;
  const riffCard = record.riffCard && typeof record.riffCard === "object"
    ? record.riffCard as Record<string, unknown>
    : undefined;
  return {
    ...record,
    blockID,
    cardID,
    state: Number(record.state ?? riffCard?.state),
    due: record.due ?? riffCard?.due,
  } as RiffCardRecord;
}

function responseCards(value: unknown): RiffCardRecord[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const list = Array.isArray(record.cards)
    ? record.cards
    : Array.isArray(record.blocks)
      ? record.blocks
      : Array.isArray(value)
        ? value
        : [];
  return list.map(normalizeRiffCard).filter((card): card is RiffCardRecord => Boolean(card));
}

function todayString(): string {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("");
}

export class FlashcardSiyuanAdapter {
  async sql<T = FlashcardBlockRow[]>(statement: string): Promise<T> {
    return requestStrict<T>("/api/query/sql", { stmt: statement });
  }

  async paginatedSql(statement: string, pageSize = 500, maxPages = 100): Promise<FlashcardBlockRow[]> {
    const results: FlashcardBlockRow[] = [];
    const hasLimit = /\blimit\b/iu.test(statement);
    for (let page = 0; page < maxPages; page += 1) {
      const normalizedStatement = statement.trim().replace(/;\s*$/u, "");
      const paged = hasLimit
        ? normalizedStatement.replace(/\blimit\s+\d+(?:\s+offset\s+\d+)?/iu, `LIMIT ${pageSize} OFFSET ${page * pageSize}`)
        : `${normalizedStatement} LIMIT ${pageSize} OFFSET ${page * pageSize}`;
      const rows = await this.sql<FlashcardBlockRow[]>(paged);
      if (!Array.isArray(rows) || rows.length === 0) break;
      results.push(...rows);
      if (rows.length < pageSize) break;
    }
    return results;
  }

  async loadBlocks(ids: readonly string[]): Promise<FlashcardBlockRow[]> {
    const valid = dedupeIds(ids);
    if (valid.length === 0) return [];
    // Keep each IN clause below SiYuan/SQLite request limits. SFP's "all
    // flashcards" query can return several thousand rows; sending them as one
    // statement silently produced an empty result on the live workspace.
    const rows: FlashcardBlockRow[] = [];
    for (let offset = 0; offset < valid.length; offset += 200) {
      const chunk = valid.slice(offset, offset + 200);
      const batch = await this.sql<FlashcardBlockRow[]>(
        // SiYuan's SQL endpoint applies a small implicit row cap when LIMIT
        // is omitted. The explicit bound is required even for a chunked IN
        // query, otherwise large dynamic groups silently lose most blocks.
        `SELECT id, parent_id, root_id, box, hpath, type, content, ial FROM blocks WHERE id IN (${idsClause(chunk)}) LIMIT ${chunk.length}`,
      );
      if (Array.isArray(batch)) rows.push(...batch);
    }
    return rows;
  }

  async resolveCardRoots(blockIds: readonly string[], settings: Pick<FlashcardSettings, "maxResolveDepth">): Promise<{ rawBlockIds: string[]; roots: string[] }> {
    const rawBlockIds = dedupeIds(blockIds);
    if (rawBlockIds.length === 0) return { rawBlockIds, roots: [] };
    const initial = (await this.loadBlocks(rawBlockIds)).map(normalizeBlockRow);
    const allRows = new Map(initial.map((row) => [row.id, row]));
    let frontier = initial.map((row) => row.parent_id).filter((id): id is string => Boolean(id));
    for (let depth = 0; depth < settings.maxResolveDepth && frontier.length > 0; depth += 1) {
      const missing = dedupeIds(frontier.filter((id) => !allRows.has(id)));
      if (missing.length === 0) break;
      const parents = (await this.loadBlocks(missing)).map(normalizeBlockRow);
      if (parents.length === 0) break;
      for (const parent of parents) allRows.set(parent.id, parent);
      frontier = parents.map((row) => row.parent_id).filter((id): id is string => Boolean(id));
    }
    return { rawBlockIds, roots: resolveCardRoots(initial, allRows, settings.maxResolveDepth) };
  }

  async inspectRoots(blockIds: readonly string[], settings: Pick<FlashcardSettings, "maxResolveDepth">): Promise<FlashcardRoot[]> {
    const { roots } = await this.resolveCardRoots(blockIds, settings);
    const rows = await this.loadBlocks(roots);
    return rows.map(toFlashcardRoot).filter((root): root is FlashcardRoot => Boolean(root));
  }

  async inspectRows(rows: readonly FlashcardBlockRow[], settings: Pick<FlashcardSettings, "maxResolveDepth">): Promise<FlashcardRoot[]> {
    const initial = rows.map(normalizeBlockRow);
    if (initial.length === 0) return [];
    const allRows = new Map(initial.map((row) => [row.id, row]));
    let frontier = initial.map((row) => row.parent_id).filter((id): id is string => Boolean(id));
    for (let depth = 0; depth < settings.maxResolveDepth && frontier.length > 0; depth += 1) {
      const missing = dedupeIds(frontier.filter((id) => !allRows.has(id)));
      if (missing.length === 0) break;
      const parents = (await this.loadBlocks(missing)).map(normalizeBlockRow);
      if (parents.length === 0) break;
      for (const parent of parents) allRows.set(parent.id, parent);
      frontier = parents.map((row) => row.parent_id).filter((id): id is string => Boolean(id));
    }
    const roots = resolveCardRoots(initial, allRows, settings.maxResolveDepth);
    return roots
      .map((id) => allRows.get(id))
      .filter((row): row is FlashcardBlockRow => Boolean(row))
      .map(toFlashcardRoot)
      .filter((root): root is FlashcardRoot => Boolean(root));
  }

  async getDueCards(deckId: string, reviewedCards: readonly RiffCardRecord[] = []): Promise<DueCardsData> {
    const value = await requestStrict<unknown>("/api/riff/getRiffDueCards", {
      deckID: deckId,
      reviewedCards: reviewedCards.map((card) => ({ cardID: card.cardID })),
    });
    const cards = responseCards(value);
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      cards,
      unreviewedCount: Number(record.unreviewedCount ?? cards.length),
      unreviewedNewCardCount: Number(record.unreviewedNewCardCount ?? cards.filter((card) => card.state === 0).length),
      unreviewedOldCardCount: Number(record.unreviewedOldCardCount ?? cards.filter((card) => card.state !== 0).length),
    };
  }

  async getTreeDueCards(rootId: string): Promise<DueCardsData> {
    return this.normalizeDueCards(await requestStrict<unknown>("/api/riff/getTreeRiffDueCards", { rootID: rootId }));
  }

  async getNotebookDueCards(notebookId: string): Promise<DueCardsData> {
    return this.normalizeDueCards(await requestStrict<unknown>("/api/riff/getNotebookRiffDueCards", { notebook: notebookId }));
  }

  async getTreeCards(rootId: string, pageSize = 1000): Promise<RiffCardRecord[]> {
    return this.getScopedCards("/api/riff/getTreeRiffCards", rootId, pageSize);
  }

  async getNotebookCards(notebookId: string, pageSize = 1000): Promise<RiffCardRecord[]> {
    return this.getScopedCards("/api/riff/getNotebookRiffCards", notebookId, pageSize);
  }

  private async getScopedCards(url: string, id: string, pageSize: number): Promise<RiffCardRecord[]> {
    const cards: RiffCardRecord[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const value = await requestStrict<unknown>(url, { id, page, pageSize });
      const batch = responseCards(value);
      if (batch.length === 0) break;
      cards.push(...batch);
      const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const pageCount = Number(record.pageCount ?? page);
      if (page >= pageCount || batch.length < pageSize) break;
    }
    return cards;
  }

  /** Returns a selected container and all registered-card candidates below it. */
  async getContainerBlockIds(rootIds: readonly string[], maxDepth = 32): Promise<string[]> {
    const roots = dedupeIds(rootIds);
    const result = new Set(roots);
    const queue = roots.map((id) => ({ id, depth: 0 }));
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visited.has(current.id) || current.depth >= maxDepth) continue;
      visited.add(current.id);
      const children = await getChildBlocksStrict(current.id);
      for (const child of children) {
        if (!nodeId.test(child.id)) continue;
        result.add(child.id);
        // SiYuan's official child-block API already expands a heading to all
        // blocks under that heading. Other containers expose one level, so
        // continue walking those children recursively.
        if (child.type !== "h") queue.push({ id: child.id, depth: current.depth + 1 });
      }
    }
    return [...result];
  }

  private normalizeDueCards(value: unknown): DueCardsData {
    const cards = responseCards(value);
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      cards,
      unreviewedCount: Number(record.unreviewedCount ?? cards.length),
      unreviewedNewCardCount: Number(record.unreviewedNewCardCount ?? cards.filter((card) => card.state === 0).length),
      unreviewedOldCardCount: Number(record.unreviewedOldCardCount ?? cards.filter((card) => card.state !== 0).length),
    };
  }

  async getCardsByBlockIds(blockIds: readonly string[]): Promise<RiffCardRecord[]> {
    const ids = dedupeIds(blockIds);
    if (ids.length === 0) return [];
    const value = await requestStrict<unknown>("/api/riff/getRiffCardsByBlockIDs", { blockIDs: ids });
    return responseCards(value);
  }

  async getAllCardsByDeckId(deckId: string, pageSize = 1000): Promise<RiffCardRecord[]> {
    const cards: RiffCardRecord[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const value = await requestStrict<unknown>("/api/riff/getRiffCards", { id: deckId, page, pageSize });
      const batch = responseCards(value);
      if (batch.length === 0) break;
      cards.push(...batch);
      const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const pageCount = Number(record.pageCount ?? page);
      if (page >= pageCount || batch.length < pageSize) break;
    }
    return cards;
  }

  async buildDueCardsData(
    deckId: string,
    blockIds: readonly string[],
    _limit: number,
    mode: FlashcardScopedReviewMode = "native",
  ): Promise<DueCardsData> {
    const allowed = new Set(dedupeIds(blockIds));
    let registered: RiffCardRecord[] = [];
    let registeredCount: number | undefined;
    try {
      registered = await this.getCardsByBlockIds([...allowed]);
      registeredCount = registered.length;
    } catch (error) {
      // Registration diagnostics must not make the native due-card path fail.
      log.warn("riff.registration-diagnostic-unavailable", error);
    }
    if (mode === "exact" && registeredCount !== undefined) {
      return this.buildExactDueCardsData(deckId, allowed, registered);
    }
    return this.buildNativeDueCardsData(deckId, allowed, registered, registeredCount);
  }

  private async buildNativeDueCardsData(
    deckId: string,
    allowed: ReadonlySet<string>,
    registered: readonly RiffCardRecord[],
    registeredCount: number | undefined,
  ): Promise<DueCardsData> {
    const due = await this.getDueCards(deckId);
    const dueCards = due.cards.filter((card) => allowed.has(card.blockID));
    const dueIds = new Set(dueCards.map((card) => card.blockID));
    // Riff applies global new-card limits before returning due cards. A scoped
    // DAMO group must still be able to review a newly registered state-0 card;
    // append those missing new cards without changing their native state.
    const missingNewCards = registered.filter((card) =>
      allowed.has(card.blockID) && card.state === 0 && !dueIds.has(card.blockID),
    );
    const cards = [...dueCards, ...missingNewCards];
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
      candidateCount: allowed.size,
      registeredCount,
    };
  }

  private async buildExactDueCardsData(
    deckId: string,
    allowed: ReadonlySet<string>,
    registered: readonly RiffCardRecord[],
  ): Promise<DueCardsData> {
    const rootsByBlockId = new Map<string, string>();
    const missingRootIds: string[] = [];
    for (const card of registered) {
      const rootId = String(card.rootID ?? card.root_id ?? "");
      if (rootId) rootsByBlockId.set(card.blockID, rootId);
      else missingRootIds.push(card.blockID);
    }
    if (missingRootIds.length > 0) {
      for (const row of await this.loadBlocks(missingRootIds)) {
        const rootId = String(row.root_id ?? row.id ?? "");
        if (rootId) rootsByBlockId.set(row.id, rootId);
      }
    }

    const rootIds = dedupeIds([...rootsByBlockId.values()]);
    if (registered.length > 0 && rootIds.length === 0) {
      log.warn("riff.exact-scope-root-unavailable");
      return this.buildNativeDueCardsData(deckId, allowed, registered, registered.length);
    }

    const results = await Promise.allSettled(rootIds.map((rootId) => this.getTreeDueCards(rootId)));
    const cardsByBlockId = new Map<string, RiffCardRecord>();
    let failed = false;
    for (const result of results) {
      if (result.status === "rejected") {
        failed = true;
        log.warn("riff.exact-scope-document-unavailable", result.reason);
        continue;
      }
      for (const card of result.value.cards) {
        if (allowed.has(card.blockID)) cardsByBlockId.set(card.blockID, card);
      }
    }
    if (failed) {
      const fallback = await this.getDueCards(deckId);
      for (const card of fallback.cards) {
        if (allowed.has(card.blockID) && !cardsByBlockId.has(card.blockID)) {
          cardsByBlockId.set(card.blockID, card);
        }
      }
    }
    const cards = [...cardsByBlockId.values()];
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
      candidateCount: allowed.size,
      registeredCount: registered.length,
    };
  }

  async addAndVerify(deckId: string, blockIds: readonly string[]): Promise<CardRegistrationResult[]> {
    const ids = dedupeIds(blockIds);
    if (ids.length === 0) return [];
    await this.reactivateCards(ids);
    const existing = new Set((await this.getCardsByBlockIds(ids)).map((card) => card.blockID));
    const pending = ids.filter((id) => !existing.has(id));
    if (pending.length > 0) {
      await requestStrict<unknown>("/api/riff/addRiffCards", { deckID: deckId, blockIDs: pending });
    }
    const verified = new Set((await this.getCardsByBlockIds(ids)).map((card) => card.blockID));
    return ids.map((blockId) => verified.has(blockId)
      ? { blockId, status: existing.has(blockId) ? "already-registered" : "registered" }
      : { blockId, status: "pending", reason: "Riff registration could not be verified" });
  }

  async removeCards(deckId: string, blockIds: readonly string[]): Promise<void> {
    const ids = dedupeIds(blockIds);
    if (ids.length === 0) return;
    await requestStrict<unknown>("/api/riff/removeRiffCards", { deckID: deckId, blockIDs: ids });
  }

  async markCardsUnregistered(blockIds: readonly string[]): Promise<void> {
    const ids = dedupeIds(blockIds);
    for (const id of ids) {
      const current = await getBlockKramdownStrict(id);
      const markdown = typeof current?.kramdown === "string" ? current.kramdown : "";
      const next = deactivatePriorityTags(markdown);
      if (next !== markdown) await updateBlockStrict("markdown", next, id);
      await requestStrict<unknown>("/api/attr/setBlockAttrs", {
        id,
        attrs: { "custom-dm-card-status": "unregistered" },
      });
    }
  }

  private async reactivateCards(blockIds: readonly string[]): Promise<void> {
    const ids = dedupeIds(blockIds);
    for (const id of ids) {
      const current = await getBlockKramdownStrict(id);
      const markdown = typeof current?.kramdown === "string" ? current.kramdown : "";
      const next = reactivatePriorityTags(markdown);
      if (next !== markdown) await updateBlockStrict("markdown", next, id);
      await requestStrict<unknown>("/api/attr/setBlockAttrs", {
        id,
        attrs: { "custom-dm-card-status": "" },
      });
    }
  }

  async resetDeck(deckId: string, blockIds: readonly string[] = []): Promise<void> {
    await requestStrict<unknown>("/api/riff/resetRiffCards", {
      type: "deck",
      id: deckId,
      deckID: deckId,
      blockIDs: dedupeIds(blockIds),
    });
  }

  async reviewCard(deckId: string, card: RiffCardRecord, rating: number, reviewedCards: readonly RiffCardRecord[] = []): Promise<void> {
    await requestStrict<unknown>("/api/riff/reviewRiffCard", {
      deckID: deckId,
      cardID: card.cardID,
      rating,
      reviewedCards: reviewedCards.map((reviewed) => ({ cardID: reviewed.cardID })),
    });
  }

  async postponeCards(cards: readonly RiffCardRecord[], days: number): Promise<void> {
    if (cards.length === 0) return;
    const due = new Date(Date.now() + Math.max(0, days) * 86_400_000).toISOString();
    await requestStrict<unknown>("/api/riff/batchSetRiffCardsDueTime", {
      cardDues: cards.map((card) => ({ id: card.cardID, due })),
    });
  }

  private async syncPriorityTags(cards: readonly RiffCardRecord[], priority: number): Promise<boolean> {
    const ids = dedupeIds(cards.map((card) => card.blockID));
    let failed = false;
    for (const id of ids) {
      try {
        const current = await getBlockKramdownStrict(id);
        const markdown = typeof current?.kramdown === "string" ? current.kramdown : "";
        if (!markdown) {
          failed = true;
          continue;
        }
        const next = replacePriorityTag(markdown, priority);
        if (next !== markdown) await updateBlockStrict("markdown", next, id);
      } catch (error) {
        failed = true;
        log.warn("priority-tag-sync-failed", { blockId: id, error });
      }
    }
    return !failed;
  }

  async setPriority(cards: readonly RiffCardRecord[], priority: number): Promise<"native" | "pending"> {
    if (cards.length === 0) return "pending";
    if (!(await this.syncPriorityTags(cards, priority))) return "pending";
    return "native";
  }

  static isTodayCard(card: RiffCardRecord): boolean {
    return String(card.riffCardID ?? card.cardID).startsWith(todayString());
  }

  static isPostponable(card: RiffCardRecord): boolean {
    return card.ial?.bookmark !== "🛑 Suspended Cards" && card.ial?.["custom-card-priority-stop"] === undefined;
  }
}

export { nodeId };
