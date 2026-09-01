import { getLogger } from "@/libs/logger";
import { orderCardsByPriority } from "@/flashcard/priority-queue";
import { readReviewCardStats } from "@/flashcard/review-stats";
import type { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import { type ReviewPriorityBucket, } from "@/flashcard/native-review-counter";
import type { NativeReviewCounter } from "@/flashcard/native-review-counter";
import type { NativeReviewTimer } from "@/flashcard/native-review-timer";
import type { DueCardsData, RiffCardRecord } from "@/flashcard/siyuan-adapter";
import type { FlashcardReviewStage } from "@/flashcard/contribution-registry";
import { getFlashcardContributions } from "@/flashcard/contribution-registry";
import type { FlashcardReviewScope } from "@/flashcard/types";

/**
 * Mutable queue state shared between the plugin and these helpers. The
 * native review callback (updateCards) mutates it across review rounds.
 */
export interface FlashcardReviewQueueHost {
  readonly runtime: FlashcardRuntime;
  readonly compat: FlashcardRendererCompat;
  readonly reviewCards: Map<string, RiffCardRecord>;
  readonly reviewTimer: NativeReviewTimer;
  readonly reviewCounter: NativeReviewCounter;
  reviewScope: { scope: FlashcardReviewScope; ids: Set<string> } | undefined;
  pendingExactReview: DueCardsData | undefined;
  orderCards(cards: readonly RiffCardRecord[], limit?: number): Promise<RiffCardRecord[]>;
  orderCardsData(cardsData: DueCardsData, limit?: number): Promise<DueCardsData>;
}

function nativeReviewMode(): 0 | 1 | 2 {
  const config = (window as Window & {
    siyuan?: { config?: { flashcard?: { reviewMode?: unknown } } };
  }).siyuan?.config?.flashcard?.reviewMode;
  const mode = Number(config);
  return mode === 1 || mode === 2 ? mode : 0;
}

export async function orderCardsQueue(
  host: FlashcardReviewQueueHost,
  cards: readonly RiffCardRecord[],
  limit?: number,
): Promise<RiffCardRecord[]> {
  const roots = await host.runtime.adapter.inspectRoots(cards.map((card) => card.blockID), host.runtime.getSettings());
  host.compat.preloadMany(roots);
  const stages = getFlashcardContributions("review-stage")
    .map((item) => item.value as FlashcardReviewStage);
  const categoryRanks = stages.length
    ? new Map(roots.map((root) => [root.blockId, Math.min(...stages.map((stage) => stage.getRank(root.blockId, root)))]))
    : undefined;
  const ordered = orderCardsByPriority(cards, roots, {
    randomInterleave: host.runtime.getSettings().randomInterleaveEnabled,
    samePriorityShuffle: host.runtime.getSettings().samePriorityShuffleEnabled,
    reviewMode: nativeReviewMode(),
    categoryRanksByBlockId: categoryRanks,
  });
  const limited = limit === undefined ? ordered : ordered.slice(0, Math.max(1, limit));
  const rootsById = new Map(roots.map((root) => [root.blockId, root]));
  host.reviewCounter.setQueue(limited.map((card) => {
    const root = rootsById.get(card.blockID);
    const priority: ReviewPriorityBucket = root?.priority && !root.priorityConflict ? root.priority : "other";
    return { cardID: card.cardID, priority, isNew: card.state === 0, stats: readReviewCardStats(card) };
  }));
  host.reviewTimer?.setQueue(limited.map((card) => card.cardID));
  return limited;
}

export async function orderCardsDataQueue(
  host: FlashcardReviewQueueHost,
  cardsData: DueCardsData,
  limit?: number,
): Promise<DueCardsData> {
  const cards = await host.orderCards(cardsData.cards, limit);
  return {
    ...cardsData,
    cards,
    unreviewedCount: cards.length,
    unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
    unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
  };
}

export async function updateCardsQueue(
  host: FlashcardReviewQueueHost,
  cardsData: {
    cards: RiffCardRecord[];
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
  },
): Promise<typeof cardsData> {
  const pendingExactReview = host.pendingExactReview;
  if (pendingExactReview) {
    host.pendingExactReview = undefined;
    for (const card of pendingExactReview.cards) host.reviewCards.set(card.blockID, card);
    host.reviewTimer?.ensureSession(pendingExactReview.cards[0]?.cardID);
    return pendingExactReview;
  }
  for (const card of cardsData.cards ?? []) {
    if (card?.blockID) host.reviewCards.set(card.blockID, card);
  }
  if (!Array.isArray(cardsData?.cards)) return cardsData;
  const scope = host.reviewScope;
  // Native Siyuan invokes updateCards again after a review round. The next
  // round may contain only newly-due cards, so none of their IDs need to be
  // present in the initial snapshot. Refresh the SQL boundary before
  // deciding whether this is a continuation; an unrelated native review
  // with no matching candidate releases the scope instead of showing blank.
  try {
    let cards = cardsData.cards;
    if (scope) {
      const rootIds = await host.runtime.provideScopeBlockIds(scope.scope, true);
      const allowed = new Set(rootIds);
      cards = cards.filter((card) => allowed.has(card.blockID));
      const overlapsInitial = cardsData.cards.some((card) => scope.ids.has(card.blockID));
      if (!overlapsInitial && cards.length === 0) {
        host.reviewScope = undefined;
        return host.orderCardsData(cardsData);
      }
    }
    const ordered = await host.orderCards(cards);
    // Native review can be opened from SiYuan's own menu, bypassing
    // openNativeReview(). Start the timer from that callback as well, while
    // keeping subsequent round refreshes on the same session.
    host.reviewTimer?.ensureSession(ordered[0]?.cardID);
    return {
      cards: ordered,
      unreviewedCount: ordered.length,
      unreviewedNewCardCount: ordered.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: ordered.filter((card) => card.state !== 0).length,
    };
  } catch (error) {
    if (!scope) {
      getLogger().warn("priority-ordering-failed", error);
      return cardsData;
    }
    // A failed dynamic query must fail closed. Returning the native input
    // here would silently widen a scoped review to the whole deck.
    getLogger().error("dynamic-review-query-failed", error);
    return { cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 };
  }
}
