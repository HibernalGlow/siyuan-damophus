import { describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("siyuan", async () => ({
  ...(await vi.importActual<typeof import("siyuan")>("siyuan")),
  confirm: confirmMock,
}));

import FlashcardPlugin from "./index";

describe("flashcard scope registration flow", () => {
  it("requires one confirmation before unregistering", async () => {
    confirmMock.mockImplementation((_title: string, _message: string, onConfirm: () => void) => onConfirm());

    const approved = await (FlashcardPlugin.prototype as any).confirmUnregister.call(
      {},
      "批量取消闪卡登记",
      "最终警告",
    );

    expect(approved).toBe(true);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock.mock.calls.map(([title, message]) => [title, message])).toEqual([
      ["批量取消闪卡登记", "最终警告"],
    ]);
    confirmMock.mockReset();
  });

  it("stops after the first confirmation is declined", async () => {
    confirmMock.mockImplementationOnce((_title: string, _message: string, _onConfirm: () => void, onCancel: () => void) => onCancel());

    const approved = await (FlashcardPlugin.prototype as any).confirmUnregister.call({}, "标题", "最终警告");

    expect(approved).toBe(false);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    confirmMock.mockReset();
  });

  it("opens the filtered registration results when a scope only contains unregistered roots", async () => {
    const scope = {
      id: "document:20260823130238-wwhc0sc:tagged-cards",
      type: "document",
      targetId: "20260823130238-wwhc0sc",
      targetName: "20260823130238-wwhc0sc",
      groupId: "tagged-cards",
      groupName: "P_（tag）",
    } as const;
    const due = {
      cards: [],
      unreviewedCount: 0,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 0,
      candidateCount: 40,
      registeredCount: 0,
    };
    const openScopeRegistration = vi.fn();
    const fakePlugin = {
      runtime: { buildScopeDueCards: vi.fn().mockResolvedValue(due) },
      openScopeRegistration,
      reportError: vi.fn(),
    };

    await (FlashcardPlugin.prototype as any).reviewScopeCards.call(fakePlugin, scope);

    expect(openScopeRegistration).toHaveBeenCalledWith(
      scope,
      "20260823130238-wwhc0sc · P_（tag）",
      due,
    );
  });

  it("re-queries the scope after registration so verified new cards open in native review", async () => {
    const scope = {
      id: "group:tagged-cards",
      type: "group",
      targetName: "P_（tag）",
      groupId: "tagged-cards",
      groupName: "P_（tag）",
    } as const;
    const roots = [{
      blockId: "20260823130238-card001",
      renderer: "list",
      kind: "basic",
      attributes: {},
      content: "测试闪卡",
    }];
    const recordScope = vi.fn().mockResolvedValue(undefined);
    const reviewScopeCards = vi.fn().mockResolvedValue(undefined);
    const openRegistrationResults = vi.fn(async (options: { onRegistered: () => Promise<void> }) => {
      await options.onRegistered();
    });
    const fakePlugin = {
      runtime: {
        provideScopeBlockIds: vi.fn().mockResolvedValue(roots.map((root) => root.blockId)),
        adapter: { inspectRoots: vi.fn().mockResolvedValue(roots) },
        getSettings: vi.fn().mockReturnValue({ maxResolveDepth: 8, confirmBeforeAutoRegister: true }),
        recordScope,
      },
      openRegistrationResults,
      reviewScopeCards,
    };

    await (FlashcardPlugin.prototype as any).openScopeRegistration.call(fakePlugin, scope, "P_（tag）", {
      cards: [],
      unreviewedCount: 0,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 0,
      candidateCount: 1,
      registeredCount: 0,
    });

    expect(openRegistrationResults).toHaveBeenCalledWith(expect.objectContaining({
      title: "P_（tag） · 待登记闪卡",
      roots,
    }));
    expect(recordScope).toHaveBeenCalledWith(scope);
    expect(reviewScopeCards).toHaveBeenCalledWith(scope, true);
  });

  it("always opens the registration preview even when extra confirmation is disabled", async () => {
    const scope = { id: "group:test", type: "group", targetName: "测试", groupId: "test", groupName: "测试" } as const;
    const roots = [{ blockId: "20260823130238-card001", renderer: "list", kind: "basic", attributes: {}, content: "测试闪卡" }];
    const openRegistrationResults = vi.fn().mockResolvedValue(undefined);
    const fakePlugin = {
      runtime: {
        provideScopeBlockIds: vi.fn().mockResolvedValue([roots[0].blockId]),
        adapter: { inspectRoots: vi.fn().mockResolvedValue(roots) },
        getSettings: vi.fn().mockReturnValue({ maxResolveDepth: 8, confirmBeforeAutoRegister: false }),
      },
      openRegistrationResults,
    };

    await (FlashcardPlugin.prototype as any).openScopeRegistration.call(fakePlugin, scope, "测试", {});

    expect(openRegistrationResults).toHaveBeenCalledWith(expect.objectContaining({
      title: "测试 · 待登记闪卡",
      roots,
      onRegistered: expect.any(Function),
    }));
  });

  it("opens native review after card-making registration succeeds", async () => {
    const scope = { id: "group:test", type: "group", targetName: "测试", groupId: "test", groupName: "测试" } as const;
    const roots = [{ blockId: "20260823130238-card001", renderer: "list", kind: "basic", attributes: {}, content: "测试闪卡" }];
    const recordScope = vi.fn().mockResolvedValue(undefined);
    const reviewScopeCards = vi.fn().mockResolvedValue(undefined);
    const buildDueCardsData = vi.fn();
    const openRegistrationResults = vi.fn(async (options: { onRegistered: () => Promise<void> }) => {
      await options.onRegistered();
    });
    const fakePlugin = {
      runtime: {
        getGroups: vi.fn().mockReturnValue([{ id: "test", name: "测试" }]),
        inspectGroupCandidates: vi.fn().mockResolvedValue({ rows: [{ id: roots[0].blockId }], roots }),
        adapter: { buildDueCardsData },
        getSettings: vi.fn().mockReturnValue({ deckId: "deck", maxReviewCards: 200 }),
        recordScope,
      },
      openRegistrationResults,
      reviewScopeCards,
      reportError: vi.fn(),
    };

    await (FlashcardPlugin.prototype as any).openMakeScope.call(fakePlugin, scope);

    expect(openRegistrationResults).toHaveBeenCalledWith(expect.objectContaining({
      title: "测试 · 制卡检测",
      roots,
    }));
    expect(buildDueCardsData).not.toHaveBeenCalled();
    expect(recordScope).toHaveBeenCalledWith(scope);
    expect(reviewScopeCards).toHaveBeenCalledWith(scope, true);
  });

  it("retries the scope query after registration before giving up on native review", async () => {
    const scope = { id: "group:test", type: "group", targetName: "Test", groupId: "test", groupName: "Test" } as const;
    const card = { blockID: "20260823130238-card001", cardID: "card-1", state: 0 };
    const due = { cards: [card], unreviewedCount: 1, unreviewedNewCardCount: 1, unreviewedOldCardCount: 0, candidateCount: 1, registeredCount: 1 };
    const buildScopeDueCards = vi.fn()
      .mockResolvedValueOnce({ ...due, cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0 })
      .mockResolvedValue(due);
    const openNativeReview = vi.fn().mockResolvedValue(undefined);
    const fakePlugin = {
      runtime: { buildScopeDueCards, recordScope: vi.fn().mockResolvedValue(undefined) },
      openNativeReview,
      reportError: vi.fn(),
    };

    await (FlashcardPlugin.prototype as any).reviewScopeCards.call(fakePlugin, scope, true);

    expect(buildScopeDueCards).toHaveBeenCalledTimes(2);
    expect(openNativeReview).toHaveBeenCalledWith("复习：Test", due, scope);
  });

  it("keeps native global review restricted to the selected group across rounds", async () => {
    const scope = { id: "group:test", type: "group", targetName: "Test", groupId: "test", groupName: "Test" } as const;
    const initial = { blockID: "20260823130238-card001", cardID: "card-1", state: 1 };
    const nextRound = { blockID: "20260823130238-card002", cardID: "card-2", state: 0 };
    const unrelated = { blockID: "20260823130238-global1", cardID: "global-1", state: 1 };
    const fakePlugin = {
      reviewCards: new Map(),
      reviewScope: { scope, ids: new Set([initial.blockID]) },
      runtime: { provideScopeBlockIds: vi.fn().mockResolvedValue([initial.blockID, nextRound.blockID]) },
      orderCards: vi.fn(async (cards: unknown[]) => cards),
      orderCardsData: vi.fn(),
    };

    const result = await (FlashcardPlugin.prototype as any).updateCards.call(fakePlugin, {
      cards: [nextRound, unrelated],
      unreviewedCount: 2,
      unreviewedNewCardCount: 1,
      unreviewedOldCardCount: 1,
    });

    expect(result.cards).toEqual([nextRound]);
    expect(result).toMatchObject({ unreviewedCount: 1, unreviewedNewCardCount: 1, unreviewedOldCardCount: 0 });
    expect(fakePlugin.reviewScope).toBeDefined();
  });

  it("clears a pending scope when the native review entry cannot be opened", async () => {
    const due = {
      cards: [{ blockID: "20260823130238-card001", cardID: "card-1", state: 1 }],
      unreviewedCount: 1,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 1,
    };
    const fakePlugin = {
      orderCardsData: vi.fn().mockResolvedValue(due),
      reviewCards: new Map(),
      priorityControls: { refresh: vi.fn() },
      runtime: {
        adapter: { inspectRoots: vi.fn().mockResolvedValue([]) },
        getSettings: vi.fn().mockReturnValue({}),
      },
      compat: { preloadMany: vi.fn(), refresh: vi.fn() },
      mobileSurface: { openReview: vi.fn().mockReturnValue(false) },
      reviewScope: undefined,
    };

    await (FlashcardPlugin.prototype as any).openNativeReview.call(
      fakePlugin,
      "Test",
      due,
      { id: "group:test", type: "group", targetName: "Test", groupId: "test" },
    );

    expect(fakePlugin.mobileSurface.openReview).toHaveBeenCalled();
    expect(fakePlugin.reviewScope).toBeUndefined();
  });
});
