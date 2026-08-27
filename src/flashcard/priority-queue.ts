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
  /** SiYuan flashcard.reviewMode: 0 mixed, 1 new first, 2 review first. */
  reviewMode?: 0 | 1 | 2;
  /** Optional category stage, applied between review mode and P1-P4. */
  categoryRanksByBlockId?: ReadonlyMap<string, number>;
}

function rootRank(root: FlashcardRoot | undefined): number {
  if (!root?.priority || root.priorityConflict) return 4;
  return PRIORITY_RANK[root.priority];
}

function reviewRank(card: RiffCardRecord, reviewMode: 0 | 1 | 2): number {
  if (reviewMode === 0) return 0;
  const isNew = card.state === 0;
  return reviewMode === 1 ? (isNew ? 0 : 1) : (isNew ? 1 : 0);
}

type RankedCard = {
  card: RiffCardRecord;
  index: number;
  rank: number;
  reviewRank: number;
  categoryRank: number;
};

function orderPriorityGroup(
  input: RankedCard[],
  options: PriorityQueueOptions,
  random: () => number,
): RiffCardRecord[] {
  const ranked = [...input];
  ranked.sort((left, right) => left.rank - right.rank || left.index - right.index);

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

  if (!options.randomInterleave || ranked.length < 2) return ranked.map(({ card }) => card);

  const highestRank = ranked[0]?.rank ?? 4;
  const lower = ranked.filter((entry) => entry.rank > highestRank);
  const rate = Math.max(0, Math.min(1, options.interleaveRate ?? 0.05));
  const count = Math.min(lower.length, Math.floor(ranked.length * rate));
  if (count === 0) return ranked.map(({ card }) => card);

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

function orderCategoryGroups(
  input: RankedCard[],
  options: PriorityQueueOptions,
  random: () => number,
): RiffCardRecord[] {
  if (!options.categoryRanksByBlockId) return orderPriorityGroup(input, options, random);
  const groups = new Map<number, RankedCard[]>();
  for (const entry of input) {
    const group = groups.get(entry.categoryRank) ?? [];
    group.push(entry);
    groups.set(entry.categoryRank, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([, group]) => orderPriorityGroup(group, options, random));
}

/** Orders priority bands, optionally shuffling each band and mixing lower-priority cards. */
export function orderCardsByPriority(
  cards: readonly RiffCardRecord[],
  roots: readonly FlashcardRoot[],
  options: PriorityQueueOptions,
): RiffCardRecord[] {
  const rootsById = new Map(roots.map((root) => [root.blockId, root]));
  const mode = options.reviewMode ?? 0;
  const ranked = cards.map((card, index): RankedCard => ({
    card,
    index,
    rank: rootRank(rootsById.get(card.blockID)),
    reviewRank: reviewRank(card, mode),
    categoryRank: options.categoryRanksByBlockId?.get(card.blockID) ?? Number.MAX_SAFE_INTEGER,
  }));

  const random = options.random ?? Math.random;
  if (mode === 0) return orderCategoryGroups(ranked, options, random);
  const first = ranked.filter((entry) => entry.reviewRank === 0);
  const second = ranked.filter((entry) => entry.reviewRank === 1);
  return [
    ...orderCategoryGroups(first, options, random),
    ...orderCategoryGroups(second, options, random),
  ];
}
