import { describe, expect, it, vi } from "vitest";
import { FlashcardSiyuanAdapter } from "./siyuan-adapter";

const { requestStrict } = vi.hoisted(() => ({ requestStrict: vi.fn(async () => []) }));

vi.mock("@/api", () => ({ requestStrict }));

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
});
