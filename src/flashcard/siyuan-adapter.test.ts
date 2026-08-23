import { describe, expect, it, vi } from "vitest";
import { FlashcardSiyuanAdapter } from "./siyuan-adapter";

const { requestStrict, getBlockKramdownStrict, getChildBlocksStrict, updateBlockStrict } = vi.hoisted(() => ({
  requestStrict: vi.fn(async () => []),
  getBlockKramdownStrict: vi.fn(async () => ({ kramdown: "" })),
  getChildBlocksStrict: vi.fn(async () => []),
  updateBlockStrict: vi.fn(async () => []),
}));

vi.mock("@/api", () => ({ requestStrict, getBlockKramdownStrict, getChildBlocksStrict, updateBlockStrict }));

describe("flashcard SiYuan adapter", () => {
  it("batches large block loads for SFP dynamic groups", async () => {
    requestStrict.mockClear();
    const ids = Array.from({ length: 401 }, (_, index) =>
      `20260823${String(index).padStart(6, "0")}-aaaaaaa`,
    );

    await new FlashcardSiyuanAdapter().loadBlocks(ids);

    expect(requestStrict).toHaveBeenCalledTimes(3);
    let totalIds = 0;
    for (const [url, payload] of requestStrict.mock.calls as unknown as Array<[string, { stmt: string }]>) {
      expect(url).toBe("/api/query/sql");
      const statement = String((payload as { stmt: string }).stmt);
      const batchIds = statement.match(/'\d{14}-[a-z0-9]{7}'/gu) ?? [];
      expect(batchIds.length).toBeLessThanOrEqual(200);
      expect(statement).toMatch(/\bLIMIT\s+(?:200|1)\b/iu);
      totalIds += batchIds.length;
    }
    expect(totalIds).toBe(401);
  });

  it("reuses complete SQL rows when inspecting dynamic group roots", async () => {
    requestStrict.mockClear();
    const rows = [
      {
        id: "20260823031431-rql6ii7",
        type: "l",
        content: "当前原生界面会读取全局 window.siyuan.config.flashcard",
        ial: '{: custom-riff-decks="20230218211946-2kw8jgx"}',
      },
    ];

    const roots = await new FlashcardSiyuanAdapter().inspectRows(rows, { maxResolveDepth: 8 });

    expect(roots).toHaveLength(1);
    expect(roots[0].blockId).toBe(rows[0].id);
    expect(requestStrict).not.toHaveBeenCalled();
  });

  it("collapses nested tag matches to one explicit card root", async () => {
    requestStrict.mockClear();
    const rootId = "20260823031431-rql6ii7";
    const rows = [
      {
        id: rootId,
        type: "l",
        content: "问题 #闪卡/优先级/P1#",
        ial: '{: custom-dm-card-id="tag-card" custom-dm-card-renderer="list"}',
      },
      {
        id: "20260823031432-aaaaaaa",
        parent_id: rootId,
        type: "i",
        content: "答案一 #闪卡/优先级/P1#",
      },
      {
        id: "20260823031433-bbbbbbb",
        parent_id: rootId,
        type: "i",
        content: "答案二 #闪卡/优先级/P1#",
      },
    ];

    const roots = await new FlashcardSiyuanAdapter().inspectRows(rows, { maxResolveDepth: 8 });

    expect(roots.map((root) => root.blockId)).toEqual([rootId]);
  });

  it("uses the portable priority tag without calling a nonexistent Riff priority API", async () => {
    requestStrict.mockClear();
    getBlockKramdownStrict.mockResolvedValue({ kramdown: "- 问题\n#闪卡/优先级/P4#" });
    updateBlockStrict.mockClear();
    const adapter = new FlashcardSiyuanAdapter();
    const status = await adapter.setPriority([{ blockID: "20260823031431-rql6ii7", cardID: "card-1" }], 90);
    expect(status).toBe("native");
    expect(requestStrict).not.toHaveBeenCalled();
    expect(updateBlockStrict).toHaveBeenCalledWith("markdown", "- 问题\n#闪卡/优先级/P1#", "20260823031431-rql6ii7");
  });

  it("reports pending when Markdown tag synchronization fails", async () => {
    requestStrict.mockClear();
    getBlockKramdownStrict.mockResolvedValue({ kramdown: "- 问题" });
    updateBlockStrict.mockRejectedValueOnce(new Error("write failed"));
    const status = await new FlashcardSiyuanAdapter().setPriority(
      [{ blockID: "20260823031431-rql6ii7", cardID: "card-1" }],
      10,
    );
    expect(status).toBe("pending");
  });

  it("does not treat an unregistered block placeholder as a Riff card", async () => {
    requestStrict.mockResolvedValueOnce({
      blocks: [{ id: "20260823112001-stts5qv", riffCardID: "", content: "不存在符合条件的内容块" }],
    } as never);
    await expect(new FlashcardSiyuanAdapter().getCardsByBlockIds(["20260823112001-stts5qv"])).resolves.toEqual([]);
  });

  it("includes a newly registered state-zero card when Riff's global new-card limit omits it", async () => {
    const adapter = new FlashcardSiyuanAdapter();
    const card = { blockID: "20260823112001-stts5qv", cardID: "card-new", state: 0 };
    vi.spyOn(adapter, "getCardsByBlockIds").mockResolvedValue([card]);
    vi.spyOn(adapter, "getDueCards").mockResolvedValue({
      cards: [],
      unreviewedCount: 1,
      unreviewedNewCardCount: 1,
      unreviewedOldCardCount: 0,
    });

    const result = await adapter.buildDueCardsData(
      "20230218211946-2kw8jgx",
      [card.blockID],
      20,
    );

    expect(result.cards).toEqual([card]);
    expect(result.registeredCount).toBe(1);
  });

  it("uses SiYuan's native document and notebook due-card endpoints", async () => {
    requestStrict.mockClear();
    requestStrict.mockResolvedValue({
      cards: [{ blockID: "20260823112001-stts5qv", cardID: "card-1", state: 1 }],
      unreviewedCount: 1,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: 1,
    } as never);
    const adapter = new FlashcardSiyuanAdapter();

    await adapter.getTreeDueCards("20260823112000-docaaaa");
    await adapter.getNotebookDueCards("notebook-1");

    expect(requestStrict).toHaveBeenNthCalledWith(1, "/api/riff/getTreeRiffDueCards", { rootID: "20260823112000-docaaaa" });
    expect(requestStrict).toHaveBeenNthCalledWith(2, "/api/riff/getNotebookRiffDueCards", { notebook: "notebook-1" });
  });

  it("uses native tree and notebook card queries for bulk unregister previews", async () => {
    requestStrict.mockClear();
    requestStrict.mockResolvedValue({
      blocks: [{ id: "20260823112001-stts5qv", riffCardID: "card-1", state: 0 }],
      pageCount: 1,
    } as never);
    const adapter = new FlashcardSiyuanAdapter();

    await adapter.getTreeCards("20260823112000-docaaaa");
    await adapter.getNotebookCards("notebook-1");

    expect(requestStrict).toHaveBeenNthCalledWith(1, "/api/riff/getTreeRiffCards", {
      id: "20260823112000-docaaaa", page: 1, pageSize: 1000,
    });
    expect(requestStrict).toHaveBeenNthCalledWith(2, "/api/riff/getNotebookRiffCards", {
      id: "notebook-1", page: 1, pageSize: 1000,
    });
  });

  it("expands arbitrary containers through SiYuan's child-block API", async () => {
    getChildBlocksStrict.mockReset();
    getChildBlocksStrict
      .mockResolvedValueOnce([{ id: "20260823112002-aaaaaaa", type: "l" }])
      .mockResolvedValueOnce([{ id: "20260823112003-bbbbbbb", type: "p" }])
      .mockResolvedValueOnce([]);

    await expect(new FlashcardSiyuanAdapter().getContainerBlockIds(["20260823112001-stts5qv"])).resolves.toEqual([
      "20260823112001-stts5qv",
      "20260823112002-aaaaaaa",
      "20260823112003-bbbbbbb",
    ]);
  });

  it("removes a deduplicated batch through SiYuan's official Riff endpoint", async () => {
    requestStrict.mockClear();
    await new FlashcardSiyuanAdapter().removeCards("20230218211946-2kw8jgx", [
      "20260823112001-stts5qv",
      "20260823112001-stts5qv",
      "not-a-block-id",
    ]);

    expect(requestStrict).toHaveBeenCalledWith("/api/riff/removeRiffCards", {
      deckID: "20230218211946-2kw8jgx",
      blockIDs: ["20260823112001-stts5qv"],
    });
  });
});
