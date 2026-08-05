import { describe, expect, it } from "vitest";
import {
  addQuickRiffCards,
  getDueRiffCards,
  mapDueRiffCardsToQuestions,
  QUICK_RIFF_DECK_ID,
  submitRiffRating,
  type RiffCard,
} from "./riff";
import type { SiyuanKernelClient } from "./types";

class MockClient implements SiyuanKernelClient {
  requests: Array<{ endpoint: string; payload: unknown }> = [];

  constructor(private readonly response: unknown = undefined) {}

  async request<T>(endpoint: string, payload: unknown): Promise<T> {
    this.requests.push({ endpoint, payload });
    return this.response as T;
  }
}

const blockId = "20260804120001-abcdefg";
const card: RiffCard = {
  deckID: QUICK_RIFF_DECK_ID,
  cardID: "card-1",
  blockID: blockId,
  lapses: 1,
  reps: 2,
  state: 2,
  lastReview: 1785825600000,
  nextDues: { "1": "1 minute", "2": "6 minutes", "3": "1 day", "4": "4 days" },
};

describe("SiYuan Riff adapter", () => {
  it("adds blocks only to the built-in quick deck", async () => {
    const client = new MockClient();
    await addQuickRiffCards(client, [blockId, blockId]);
    expect(client.requests).toEqual([{
      endpoint: "/api/riff/addRiffCards",
      payload: { deckID: QUICK_RIFF_DECK_ID, blockIDs: [blockId] },
    }]);
  });

  it("queries built-in due cards and validates their shape", async () => {
    const client = new MockClient({
      cards: [card],
      unreviewedCount: 1,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 1,
    });
    const result = await getDueRiffCards(client);
    expect(result.cards).toEqual([card]);
    expect(client.requests[0]).toEqual({
      endpoint: "/api/riff/getRiffDueCards",
      payload: { deckID: QUICK_RIFF_DECK_ID, reviewedCards: [] },
    });
  });

  it("does not query due cards from unrelated decks", async () => {
    const unrelatedCard = { ...card, deckID: "custom-deck", cardID: "other-card" };
    const client = new class extends MockClient {
      override async request<T>(endpoint: string, payload: unknown): Promise<T> {
        this.requests.push({ endpoint, payload });
        const deckID = (payload as { deckID: string }).deckID;
        return {
          cards: deckID === QUICK_RIFF_DECK_ID ? [card] : [card, unrelatedCard],
          unreviewedCount: deckID === QUICK_RIFF_DECK_ID ? 1 : 2,
          unreviewedNewCardCount: 0,
          unreviewedOldCardCount: deckID === QUICK_RIFF_DECK_ID ? 1 : 2,
        } as T;
      }
    }();

    const result = await getDueRiffCards(client);

    expect(result.cards).toEqual([card]);
    expect(client.requests[0]?.payload).toMatchObject({ deckID: QUICK_RIFF_DECK_ID });
  });

  it("submits the official numeric rating with reviewed card IDs", async () => {
    const client = new MockClient();
    await submitRiffRating(client, card, "easy", [card]);
    expect(client.requests).toEqual([{
      endpoint: "/api/riff/reviewRiffCard",
      payload: {
        deckID: QUICK_RIFF_DECK_ID,
        cardID: "card-1",
        rating: 4,
        reviewedCards: [{ cardID: "card-1" }],
      },
    }]);
  });

  it("maps due cards back to stable question IDs through title block IDs", () => {
    const result = mapDueRiffCardsToQuestions([card], new Map([
      ["question-1", blockId],
      ["question-2", "20260804120002-abcdefg"],
    ]));
    expect([...result]).toEqual([["question-1", card]]);
  });
});
