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

  it("disables the extra registration confirmation by default and preserves an explicit opt-in", () => {
    const defaults = new FlashcardRuntime(() => ({}), vi.fn());
    expect(defaults.getSettings().confirmBeforeAutoRegister).toBe(false);
    expect(defaults.getSettings().autoReviewAfterRegistration).toBe(true);

    const confirmed = new FlashcardRuntime(
      (key) => key === "config" ? { confirmBeforeAutoRegister: true } : undefined,
      vi.fn(),
    );
    expect(confirmed.getSettings().confirmBeforeAutoRegister).toBe(true);

    const noAutoReview = new FlashcardRuntime(
      (key) => key === "config" ? { autoReviewAfterRegistration: false } : undefined,
      vi.fn(),
    );
    expect(noAutoReview.getSettings().autoReviewAfterRegistration).toBe(false);
  });

  it("defaults legacy settings to exact scoped review and preserves native filtering", () => {
    const legacy = new FlashcardRuntime(() => ({}), vi.fn());
    expect(legacy.getSettings().scopedReviewMode).toBe("exact");

    const native = new FlashcardRuntime(
      (key) => key === "config" ? { scopedReviewMode: "native" } : undefined,
      vi.fn(),
    );
    expect(native.getSettings().scopedReviewMode).toBe("native");
  });

  it("defaults the document breadcrumb review button to enabled and preserves an explicit off state", () => {
    const disabled = new FlashcardRuntime(
      (key) => key === "config" ? { showBreadcrumbReviewButton: false } : undefined,
      vi.fn(),
    );
    expect(disabled.getSettings().showBreadcrumbReviewButton).toBe(false);
    const enabled = new FlashcardRuntime(() => ({}), vi.fn());
    expect(enabled.getSettings().showBreadcrumbReviewButton).toBe(true);
  });

  it("defaults review timing to question-only and preserves both timing switches", () => {
    const defaults = new FlashcardRuntime(() => ({}), vi.fn());
    expect(defaults.getSettings()).toMatchObject({
      reviewTimerEnabled: true,
      reviewTimerContinueAfterAnswer: false,
      reviewTimerPauseOnBlur: true,
    });
    const configured = new FlashcardRuntime((key) => key === "config" ? {
      reviewTimerEnabled: false,
      reviewTimerContinueAfterAnswer: true,
      reviewTimerPauseOnBlur: false,
    } : undefined, vi.fn());
    expect(configured.getSettings()).toMatchObject({
      reviewTimerEnabled: false,
      reviewTimerContinueAfterAnswer: true,
      reviewTimerPauseOnBlur: false,
    });
  });

  it("keeps native filter and fullscreen visible for legacy settings unless explicitly hidden", () => {
    const legacy = new FlashcardRuntime(() => ({}), vi.fn());
    expect(legacy.getSettings().reviewToolbarShowFilter).toBe(true);
    expect(legacy.getSettings().reviewToolbarShowFullscreen).toBe(true);

    const hidden = new FlashcardRuntime((key) => key === "config" ? {
      reviewToolbarShowFilter: false,
      reviewToolbarShowFullscreen: false,
    } : undefined, vi.fn());
    expect(hidden.getSettings().reviewToolbarShowFilter).toBe(false);
    expect(hidden.getSettings().reviewToolbarShowFullscreen).toBe(false);
  });

  it("normalizes configurable review statistics for legacy settings", () => {
    const runtime = new FlashcardRuntime((key) => key === "config" ? {
      reviewStats: {
        order: ["interval", "unknown", "interval"],
        visible: { lapseRate: false },
      },
    } : undefined, vi.fn());

    expect(runtime.getSettings().reviewStats).toEqual({
      enabled: true,
      order: ["interval", "reviews", "lastReview", "lapses", "lapseRate"],
      visible: { reviews: true, lastReview: true, lapses: true, lapseRate: false, interval: true },
    });
  });

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
    expect(runtime.adapter.buildDueCardsData).toHaveBeenCalledWith(
      stored.deckId,
      ["20260823000001-bbbbbbb"],
      stored.maxReviewCards,
      "exact",
    );
  });

  it("reuses inspected group candidates within the configured cache window", async () => {
    const stored = structuredClone(DEFAULT_FLASHCARD_SETTINGS);
    const runtime = new FlashcardRuntime(
      (key) => key === "config" ? stored : undefined,
      vi.fn(),
    );
    const group = stored.groups[0];
    const rows = [{ id: "20260823000000-aaaaaaa" }];
    const roots = [{
      blockId: rows[0].id,
      renderer: "list" as const,
      kind: "basic" as const,
      attributes: {},
    }];
    const paginated = vi.spyOn(runtime.adapter, "paginatedSql").mockResolvedValue(rows);
    const inspectRows = vi.spyOn(runtime.adapter, "inspectRows").mockResolvedValue(roots);

    await runtime.inspectGroupCandidates(group);
    await runtime.inspectGroupCandidates(group);

    expect(paginated).toHaveBeenCalledTimes(1);
    expect(inspectRows).toHaveBeenCalledTimes(1);
  });

  it("keeps the review path on persisted root IDs when the group cache is fresh", async () => {
    const stored = structuredClone(DEFAULT_FLASHCARD_SETTINGS);
    const group = stored.groups[0];
    const cachedId = "20260823000000-aaaaaaa";
    const runtime = new FlashcardRuntime(
      (key) => key === "config"
        ? stored
        : key === "cache"
          ? { [group.id]: { blockIds: [cachedId], rawBlockIds: [cachedId], updatedAt: Date.now(), query: group.sqlQuery } }
          : undefined,
      vi.fn(),
    );
    const paginated = vi.spyOn(runtime.adapter, "paginatedSql");
    const inspectRows = vi.spyOn(runtime.adapter, "inspectRows");

    await expect(runtime.provideGroupBlockIds(group)).resolves.toEqual([cachedId]);
    expect(paginated).not.toHaveBeenCalled();
    expect(inspectRows).not.toHaveBeenCalled();
  });

  it("persists and orders pinned recent review scopes", async () => {
    const writes = vi.fn();
    const runtime = new FlashcardRuntime(() => undefined, writes);
    const older = vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200);

    await runtime.recordScope({ id: "group:a", type: "group", targetName: "A", groupId: "a", groupName: "A" });
    await runtime.recordScope({ id: "group:b", type: "group", targetName: "B", groupId: "b", groupName: "B" });
    await runtime.setScopePinned("group:a", true);

    expect(runtime.getHistory().map((item) => [item.id, item.pinned, item.useCount])).toEqual([
      ["group:a", true, 1],
      ["group:b", false, 1],
    ]);
    expect(writes).toHaveBeenCalledWith("history", expect.any(Array));
    older.mockRestore();
  });

  it("intersects a document scope with an SQL group", async () => {
    const stored = structuredClone(DEFAULT_FLASHCARD_SETTINGS);
    const runtime = new FlashcardRuntime((key) => key === "config" ? stored : undefined, vi.fn());
    vi.spyOn(runtime, "provideGroupBlockIds").mockResolvedValue([
      "20260823000000-aaaaaaa",
      "20260823000001-bbbbbbb",
    ]);
    vi.spyOn(runtime.adapter, "loadBlocks").mockResolvedValue([
      { id: "20260823000000-aaaaaaa", root_id: "20260823000009-docaaaa" },
      { id: "20260823000001-bbbbbbb", root_id: "20260823000008-docbbbb" },
    ]);

    await expect(runtime.provideScopeBlockIds({
      id: "document:doc:group",
      type: "document",
      targetId: "20260823000009-docaaaa",
      targetName: "Current document",
      groupId: stored.groups[0].id,
    }, true)).resolves.toEqual(["20260823000000-aaaaaaa"]);
  });
});
