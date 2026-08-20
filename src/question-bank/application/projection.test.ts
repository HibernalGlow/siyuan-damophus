import { describe, expect, it } from "vitest";
import { MockKernelClient } from "../adapters/siyuan/siyuan-adapter.fixtures";
import type { SiyuanKernelClient } from "../adapters/siyuan/types";
import type { QuestionCatalogEntry } from "../assembly";
import { projectQuestionIndex } from "./projection";

const avId = "20260820120000-target1";
const blockId = "20260820120001-target1";

function question(): QuestionCatalogEntry {
  return {
    questionId: "criminal-2026-single-1",
    blockId: "20260820120002-stale01",
    documentId: "20260820120003-source1",
    notebookId: "20260820120004-book001",
    questionTitle: "测试题目",
    questionType: "single",
  };
}

describe("projectQuestionIndex", () => {
  it("creates detached rows and updates them by stable Question ID", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });
    const client: SiyuanKernelClient = {
      async request<T>(endpoint: string, payload: any): Promise<T> {
        if (endpoint === "/api/av/addAttributeViewBlocks") {
          expect(payload.srcs).toEqual([expect.objectContaining({ isDetached: true })]);
          if (payload.srcs.some((source: { isDetached: boolean }) => !source.isDetached)) {
            throw new Error("item not found");
          }
        }
        return kernel.request<T>(endpoint, payload);
      },
    };

    const first = await projectQuestionIndex(client, { avId, blockId }, [question()], new Map());
    expect(first).toEqual({ added: 1, updated: 0, columns: 9 });

    const second = await projectQuestionIndex(client, { avId, blockId }, [question()], new Map());
    expect(second).toEqual({ added: 0, updated: 1, columns: 0 });
    expect(kernel.requests.filter((request) => request.endpoint === "/api/av/addAttributeViewBlocks")).toHaveLength(1);
  });
});
