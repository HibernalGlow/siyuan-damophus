import { describe, expect, it, vi } from "vitest";
import { FlashcardSiyuanAdapter } from "./siyuan-adapter";

const { requestStrict, getBlockKramdownStrict, updateBlockStrict } = vi.hoisted(() => ({
  requestStrict: vi.fn(async () => []),
  getBlockKramdownStrict: vi.fn(async () => ({ kramdown: "" })),
  updateBlockStrict: vi.fn(async () => []),
}));

vi.mock("@/api", () => ({ requestStrict, getBlockKramdownStrict, updateBlockStrict }));

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

  it("syncs the portable priority tag after runtime priority succeeds", async () => {
    requestStrict.mockClear();
    getBlockKramdownStrict.mockResolvedValue({ kramdown: "- 问题\n#闪卡/优先级/P4#" });
    updateBlockStrict.mockClear();
    const adapter = new FlashcardSiyuanAdapter();
    const status = await adapter.setPriority([{ blockID: "20260823031431-rql6ii7", cardID: "card-1" }], 90);
    expect(status).toBe("native");
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
});
