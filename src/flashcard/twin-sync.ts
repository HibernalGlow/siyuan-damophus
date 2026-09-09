/**
 * Twin-card due reconciliation.
 *
 * Cards that share the same business identity (`custom-dm-card-id` IAL) live in
 * several stage decks (精讲 / 背诵 / 考前聚焦). SiYuan Riff binds review state to
 * the block ID, so copies drift apart. This module re-aligns the due times of
 * registered twins: read every member's due, take the latest (the most recently
 * reviewed copy), write it back to the rest.
 *
 * Design contract (docs/flashcard-twin-sync-spec.md):
 * - Identity is `custom-dm-card-id`, never block placement (ADR 0011).
 * - Only `due` is aligned; FSRS internals are never rewritten.
 * - Unregistered / deleted / renamed copies are skipped, never reported as errors.
 * - The index is rebuilt on every run; no incremental state is kept.
 */

import { getLogger } from "@/libs/logger";
import type { FlashcardSiyuanAdapter, RiffCardRecord } from "./siyuan-adapter";

const log = getLogger("flashcard-twin-sync");

export interface TwinSyncResult {
  /** Groups (card IDs) that had at least two registered members. */
  twinGroups: number;
  /** Cards whose due was actually rewritten. */
  aligned: number;
  /** Copies that carry a `custom-dm-card-id` but are not registered in Riff. */
  unregistered: number;
  /** Copies skipped because their due could not be read. */
  unreadable: number;
  /** Already identical; nothing was written. */
  alreadyAligned: number;
}

interface TwinCardRow {
  block_id: string;
  card_id: string;
}

const SQL_PAGE_SIZE = 500;
const BLOCK_ID_BATCH = 200;

/**
 * Group every attributed block by its business card identity. Blocks without a
 * Riff card are kept in the map so callers can distinguish "unregistered twin"
 * from "unknown block".
 */
export async function buildTwinGroups(adapter: FlashcardSiyuanAdapter): Promise<Map<string, string[]>> {
  const statement = `SELECT block_id, value AS card_id FROM attributes WHERE name = 'custom-dm-card-id' AND value <> ''`;
  const rows = (await adapter.paginatedSql(statement, SQL_PAGE_SIZE)) as unknown as TwinCardRow[];
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const cardId = String(row.card_id ?? "").trim();
    const blockId = String(row.block_id ?? "").trim();
    if (!cardId || !blockId) continue;
    const members = groups.get(cardId);
    if (members) {
      if (!members.includes(blockId)) members.push(blockId);
    } else {
      groups.set(cardId, [blockId]);
    }
  }
  return groups;
}

function dueTime(card: RiffCardRecord | undefined): number | undefined {
  const raw = card?.due;
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : undefined;
}

/**
 * Re-align due times across every twin group.
 */
export async function reconcileTwinCards(
  adapter: FlashcardSiyuanAdapter,
): Promise<TwinSyncResult> {
  const result: TwinSyncResult = { twinGroups: 0, aligned: 0, unregistered: 0, unreadable: 0, alreadyAligned: 0 };
  const groups = await buildTwinGroups(adapter);

  // Resolve which attributed blocks are registered flashcards, in batches so a
  // large notebook cannot blow up a single request.
  const allBlockIds = [...new Set([...groups.values()].flat())];
  const registered = new Map<string, RiffCardRecord>();
  for (let start = 0; start < allBlockIds.length; start += BLOCK_ID_BATCH) {
    const batch = allBlockIds.slice(start, start + BLOCK_ID_BATCH);
    try {
      for (const card of await adapter.getCardsByBlockIds(batch)) registered.set(card.blockID, card);
    } catch (error) {
      log.warn("twin-sync-batch-lookup-failed", error);
    }
  }

  for (const [cardId, blockIds] of groups) {
    if (blockIds.length < 2) continue;
    const cards: RiffCardRecord[] = [];
    for (const blockId of blockIds) {
      const card = registered.get(blockId);
      if (!card) {
        // Not registered (or deleted): it is not in any review queue, so there
        // is nothing to align and nothing that could nag the user. Skip.
        result.unregistered += 1;
        continue;
      }
      cards.push(card);
    }
    if (cards.length < 2) continue;

    const times = cards.map((card) => ({ card, time: dueTime(card) }));
    const readable = times.filter((entry) => entry.time !== undefined) as { card: RiffCardRecord; time: number }[];
    result.unreadable += times.length - readable.length;
    if (readable.length < 2) continue;

    const latest = Math.max(...readable.map((entry) => entry.time));
    const stale = readable.filter((entry) => entry.time !== latest);
    if (stale.length === 0) {
      result.alreadyAligned += cards.length;
      continue;
    }
    try {
      await adapter.alignCardDues(stale.map((entry) => entry.card), new Date(latest));
      result.twinGroups += 1;
      result.aligned += stale.length;
    } catch (error) {
      log.warn("twin-sync-align-failed", { cardId, error });
    }
  }
  return result;
}
