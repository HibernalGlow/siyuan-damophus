import { requestStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import type {
  FlashcardBlockRow,
  FlashcardRoot,
  FlashcardSettings,
} from "./types";
import {
  dedupeIds,
  normalizeBlockRow,
  resolveCardRoots,
  toFlashcardRoot,
} from "./types";

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
  const blockID = String(record.blockID ?? record.block_id ?? record.id ?? "");
  const cardID = String(record.cardID ?? record.riffCardID ?? record.card_id ?? record.id ?? "");
  if (!blockID || !cardID) return undefined;
  return { ...record, blockID, cardID } as RiffCardRecord;
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

function todayStartTimestamp(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
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
    return this.sql<FlashcardBlockRow[]>(
      `SELECT id, parent_id, root_id, type, content, ial FROM blocks WHERE id IN (${idsClause(valid)})`,
    );
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

  async buildDueCardsData(deckId: string, blockIds: readonly string[], limit: number): Promise<DueCardsData> {
    const allowed = new Set(dedupeIds(blockIds));
    const due = await this.getDueCards(deckId);
    const cards = due.cards.filter((card) => allowed.has(card.blockID)).slice(0, Math.max(1, limit));
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
    };
  }

  async addAndVerify(deckId: string, blockIds: readonly string[]): Promise<CardRegistrationResult[]> {
    const ids = dedupeIds(blockIds);
    if (ids.length === 0) return [];
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

  async setPriority(cards: readonly RiffCardRecord[], priority: number): Promise<"native" | "tomato" | "pending"> {
    const tomato = (window as Window & { tomato_zZmqus5PtYRi?: any }).tomato_zZmqus5PtYRi;
    if (tomato?.cardPriorityBox?.updateDocPriorityBatchDialog) {
      await tomato.cardPriorityBox.updateDocPriorityBatchDialog(cards, priority, false);
      return "tomato";
    }
    try {
      await requestStrict<unknown>("/api/riff/setRiffCardsPriority", {
        cardIDs: cards.map((card) => card.cardID),
        priority,
      });
      return "native";
    } catch (error) {
      log.warn("riff.priority-unavailable", error);
      return "pending";
    }
  }

  static isTodayCard(card: RiffCardRecord): boolean {
    const today = new Date(todayStartTimestamp()).toISOString().slice(0, 10).replace(/-/g, "");
    return String(card.riffCardID ?? card.cardID).startsWith(today);
  }

  static isPostponable(card: RiffCardRecord): boolean {
    return card.ial?.bookmark !== "🛑 Suspended Cards" && card.ial?.["custom-card-priority-stop"] === undefined;
  }
}

export { nodeId };
