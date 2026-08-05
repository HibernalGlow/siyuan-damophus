import { z } from "zod";
import type { MasteryRating } from "../../core/types";
import type { SiyuanKernelClient } from "./types";

export const QUICK_RIFF_DECK_ID = "20230218211946-2kw8jgx";

const nodeId = z.string().regex(/^\d{14}-[a-z0-9]{7}$/u);

export const RiffCardSchema = z.object({
  deckID: z.literal(QUICK_RIFF_DECK_ID),
  cardID: z.string().min(1),
  blockID: nodeId,
  lapses: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  state: z.number().int().nonnegative(),
  lastReview: z.number().int(),
  nextDues: z.record(z.string(), z.string()),
});

const dueResponseSchema = z.object({
  cards: z.array(RiffCardSchema),
  unreviewedCount: z.number().int().nonnegative(),
  unreviewedNewCardCount: z.number().int().nonnegative(),
  unreviewedOldCardCount: z.number().int().nonnegative(),
});

export type RiffCard = z.infer<typeof RiffCardSchema>;
export type RiffDueCards = z.infer<typeof dueResponseSchema>;

const ratingValue: Record<MasteryRating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

export async function addQuickRiffCards(
  client: SiyuanKernelClient,
  blockIds: readonly string[],
): Promise<void> {
  const parsed = z.array(nodeId).min(1).parse([...new Set(blockIds)]);
  await client.request("/api/riff/addRiffCards", {
    deckID: QUICK_RIFF_DECK_ID,
    blockIDs: parsed,
  });
}

export async function getDueRiffCards(
  client: SiyuanKernelClient,
  reviewedCards: readonly RiffCard[] = [],
): Promise<RiffDueCards> {
  const response = await client.request<unknown>("/api/riff/getRiffDueCards", {
    deckID: QUICK_RIFF_DECK_ID,
    reviewedCards: reviewedCards.map((card) => ({ cardID: card.cardID })),
  });
  return dueResponseSchema.parse(response);
}

export async function submitRiffRating(
  client: SiyuanKernelClient,
  card: RiffCard,
  rating: MasteryRating,
  reviewedCards: readonly RiffCard[] = [],
): Promise<void> {
  const parsed = RiffCardSchema.parse(card);
  await client.request("/api/riff/reviewRiffCard", {
    deckID: parsed.deckID,
    cardID: parsed.cardID,
    rating: ratingValue[rating],
    reviewedCards: reviewedCards.map((reviewed) => ({ cardID: reviewed.cardID })),
  });
}

export function mapDueRiffCardsToQuestions(
  cards: readonly RiffCard[],
  blockIdsByQuestionId: ReadonlyMap<string, string>,
): Map<string, RiffCard> {
  const questionIdsByBlockId = new Map(
    [...blockIdsByQuestionId].map(([questionId, blockId]) => [blockId, questionId]),
  );
  const result = new Map<string, RiffCard>();
  for (const card of cards) {
    const questionId = questionIdsByBlockId.get(card.blockID);
    if (questionId) result.set(questionId, card);
  }
  return result;
}
