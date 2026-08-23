import type { FlashcardRoot } from "./types";
import type { RiffCardRecord } from "./siyuan-adapter";

const PRIORITY_RANK = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
} as const;

interface PriorityQueueOptions {
  randomInterleave: boolean;
  samePriorityShuffle?: boolean;
  random?: () => number;
  interleaveRate?: number;
}

function rootRank(root: FlashcardRoot | undefined): number {
  if (!root?.priority || root.priorityConflict) return 4;
  return PRIORITY_RANK[root.priority];
}

/** Orders priority bands, optionally shuffling each band and mixing lower-priority cards. */
export function orderCardsByPriority(
  cards: readonly RiffCardRecord[],
  roots: readonly FlashcardRoot[],
  options: PriorityQueueOptions,
): RiffCardRecord[] {
  const rootsById = new Map(roots.map((root) => [root.blockId, root]));
  const ranked = cards.map((card, index) => ({
    card,
    index,
    rank: rootRank(rootsById.get(card.blockID)),
  }));
  ranked.sort((left, right) => left.rank - right.rank || left.index - right.index);

  const random = options.random ?? Math.random;
  if (options.samePriorityShuffle && ranked.length > 1) {
    let start = 0;
    while (start < ranked.length) {
      let end = start + 1;
      while (end < ranked.length && ranked[end].rank === ranked[start].rank) end += 1;
      for (let index = end - 1; index > start; index -= 1) {
        const swapIndex = start + Math.floor(random() * (index - start + 1));
        [ranked[index], ranked[swapIndex]] = [ranked[swapIndex], ranked[index]];
      }
      start = end;
    }
  }

  if (!options.randomInterleave || ranked.length < 2) {
    return ranked.map(({ card }) => card);
  }

  const highestRank = ranked[0]?.rank ?? 4;
  const lower = ranked.filter((entry) => entry.rank > highestRank);
  const rate = Math.max(0, Math.min(1, options.interleaveRate ?? 0.05));
  const count = Math.min(lower.length, Math.floor(ranked.length * rate));
  if (count === 0) return ranked.map(({ card }) => card);

  // Tomato's dormant 5% experiment inserted low-ranked cards into the first
  // third. Sample across lower priorities without shuffling the whole Riff
  // queue or disturbing the cards that remain in their priority bands.
  const pool = [...lower];
  const selectedEntries = Array.from({ length: count }, () => {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    return pool.splice(index, 1)[0];
  });
  const selected = new Set(selectedEntries);
  const result = ranked.filter((entry) => !selected.has(entry));
  for (const entry of selectedEntries) {
    const highCount = result.findIndex((candidate) => candidate.rank > highestRank);
    const highBoundary = highCount < 0 ? result.length : highCount;
    const insertionWindow = Math.max(1, Math.floor(highBoundary / 3));
    const position = Math.min(result.length, 1 + Math.floor(random() * insertionWindow));
    result.splice(position, 0, entry);
  }
  return result.map(({ card }) => card);
}
