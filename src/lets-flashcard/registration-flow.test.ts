import { describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn());

vi.mock("siyuan", async () => ({
  ...(await vi.importActual<typeof import("siyuan")>("siyuan")),
  confirm: confirmMock,
}));

import FlashcardPlugin from "./index";

describe("flashcard scope registration flow", () => {
  it("requires two confirmations before unregistering", async () => {
    confirmMock.mockImplementation((_title: string, _message: string, onConfirm: () => void) => onConfirm());

    const approved = await (FlashcardPlugin.prototype as any).confirmUnregister.call(
      {},
      "批量取消闪卡登记",
      "预览",
      "最终警告",
    );

    expect(approved).toBe(true);
    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(confirmMock.mock.calls.map(([title, message]) => [title, message])).toEqual([
      ["批量取消闪卡登记", "预览"],
      ["最终确认取消登记", "最终警告"],
    ]);
    confirmMock.mockReset();
  });

  it("stops after the first confirmation is declined", async () => {
    confirmMock.mockImplementationOnce((_title: string, _message: string, _onConfirm: () => void, onCancel: () => void) => onCancel());

    const approved = await (FlashcardPlugin.prototype as any).confirmUnregister.call({}, "标题", "预览", "最终警告");

    expect(approved).toBe(false);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    confirmMock.mockReset();
  });

  it("stops after the final confirmation is declined", async () => {
    confirmMock
      .mockImplementationOnce((_title: string, _message: string, onConfirm: () => void) => onConfirm())
      .mockImplementationOnce((_title: string, _message: string, _onConfirm: () => void, onCancel: () => void) => onCancel());

    const approved = await (FlashcardPlugin.prototype as any).confirmUnregister.call({}, "标题", "预览", "最终警告");

    expect(approved).toBe(false);
    expect(confirmMock).toHaveBeenCalledTimes(2);
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
        getSettings: vi.fn().mockReturnValue({ maxResolveDepth: 8 }),
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
    expect(reviewScopeCards).toHaveBeenCalledWith(scope);
  });
});
