import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashcardRuntime } from "./runtime";
import { DEFAULT_FLASHCARD_SETTINGS } from "./types";

function todayCard(id: string, extra: Record<string, unknown> = {}) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return { blockID: id, cardID: `${id}-card`, riffCardID: `${stamp}-riff`, ...extra };
}

describe("flashcard runtime SFP parity", () => {
  afterEach(() => vi.restoreAllMocks());

  it("postpones today's cards across the whole deck, not only enabled groups", async () => {
    const stored = {
      ...structuredClone(DEFAULT_FLASHCARD_SETTINGS),
      postponeEnabled: true,
      postponeDays: 2,
      groups: [],
    };
    const runtime = new FlashcardRuntime(
      (key) => key === "config" ? stored : undefined,
      vi.fn(),
    );
    const cards = [
      todayCard("20260823000000-aaaaaaa"),
      todayCard("20260823000001-bbbbbbb", { ial: { bookmark: "\u{1f6d1} Suspended Cards" } }),
    ];
    vi.spyOn(runtime.adapter, "getAllCardsByDeckId").mockResolvedValue(cards);
    const postpone = vi.spyOn(runtime.adapter, "postponeCards").mockResolvedValue();

    const result = await runtime.postponeTodayCards();

    expect(result).toEqual({ status: "completed", count: 1 });
    expect(postpone).toHaveBeenCalledWith([cards[0]], 2);
  });

  it("applies the configured first-round limit to all due cards", async () => {
    const stored = {
      ...structuredClone(DEFAULT_FLASHCARD_SETTINGS),
      maxReviewCards: 2,
    };
    const runtime = new FlashcardRuntime(
      (key) => key === "config" ? stored : undefined,
      vi.fn(),
    );
    const cards = [
      { blockID: "20260823000000-aaaaaaa", cardID: "card-a", state: 0 },
      { blockID: "20260823000001-bbbbbbb", cardID: "card-b", state: 1 },
      { blockID: "20260823000002-ccccccc", cardID: "card-c", state: 1 },
    ];
    vi.spyOn(runtime.adapter, "getDueCards").mockResolvedValue({
      cards,
      unreviewedCount: 3,
      unreviewedNewCardCount: 1,
      unreviewedOldCardCount: 2,
    });

    await expect(runtime.buildAllDueCards()).resolves.toEqual({
      cards: cards.slice(0, 2),
      unreviewedCount: 2,
      unreviewedNewCardCount: 1,
      unreviewedOldCardCount: 1,
    });
  });

  it("refreshes tag-group candidates when a review is opened", async () => {
    const stored = structuredClone(DEFAULT_FLASHCARD_SETTINGS);
    const runtime = new FlashcardRuntime(
      (key) => key === "config" ? stored : undefined,
      vi.fn(),
    );
    const group = stored.groups[0];
    const paginated = vi.spyOn(runtime.adapter, "paginatedSql")
      .mockResolvedValueOnce([{ id: "20260823000000-aaaaaaa" }])
      .mockResolvedValueOnce([{ id: "20260823000001-bbbbbbb" }]);
    vi.spyOn(runtime.adapter, "inspectRows").mockImplementation(async (rows) => rows.map((row) => ({
      blockId: row.id,
      renderer: "list",
      kind: "basic",
      attributes: {},
    })));
    vi.spyOn(runtime.adapter, "buildDueCardsData").mockResolvedValue({
      cards: [],
      unreviewedCount: 0,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 0,
    });

    await runtime.provideGroupBlockIds(group);
    await runtime.buildGroupDueCards(group, true);

    expect(paginated).toHaveBeenCalledTimes(2);
  });
});
