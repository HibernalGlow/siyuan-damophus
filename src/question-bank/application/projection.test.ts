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
    expect(first).toEqual({ added: 1, updated: 0, deleted: 0, columns: 9 });

    const second = await projectQuestionIndex(client, { avId, blockId }, [question()], new Map());
    expect(second).toEqual({ added: 0, updated: 1, deleted: 0, columns: 0 });
    expect(kernel.requests.filter((request) => request.endpoint === "/api/av/addAttributeViewBlocks")).toHaveLength(1);
  });

  it("prunes stale rows when pruneStale is true", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });
    const client: SiyuanKernelClient = {
      async request<T>(endpoint: string, payload: any): Promise<T> {
        return kernel.request<T>(endpoint, payload);
      },
    };

    const q1: QuestionCatalogEntry = { ...question(), questionId: "q-1", blockId: "20260820120002-stale01" };
    const q2: QuestionCatalogEntry = { ...question(), questionId: "q-2", blockId: "20260820120002-stale02" };

    // Initial projection with q1 and q2
    await projectQuestionIndex(client, { avId, blockId }, [q1, q2], new Map());

    // Second projection with only q1, pruneStale: false
    const retained = await projectQuestionIndex(client, { avId, blockId }, [q1], new Map(), 2, { pruneStale: false });
    expect(retained).toEqual({ added: 0, updated: 1, deleted: 0, columns: 0 });

    // Third projection with only q1, pruneStale: true -> should delete q2
    const pruned = await projectQuestionIndex(client, { avId, blockId }, [q1], new Map(), 2, { pruneStale: true });
    expect(pruned).toEqual({ added: 0, updated: 1, deleted: 1, columns: 0 });
    expect(kernel.requests.some((request) => request.endpoint === "/api/av/removeAttributeViewBlocks")).toBe(true);
  });

  it("binds primary key to real question block and updates binding", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });
    const client: SiyuanKernelClient = {
      async request<T>(endpoint: string, payload: any): Promise<T> {
        return kernel.request<T>(endpoint, payload);
      },
    };

    const q = question();
    const result = await projectQuestionIndex(client, { avId, blockId }, [q], new Map());
    expect(result).toEqual({ added: 1, updated: 0, deleted: 0, columns: 9 });

    const addCalls = kernel.requests.filter((r) => r.endpoint === "/api/av/addAttributeViewBlocks");
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0].payload.srcs[0]).toEqual(expect.objectContaining({
      id: q.blockId,
      isDetached: false,
    }));
  });

  it("filters out unanswered questions when includeUnanswered is false", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });
    const client: SiyuanKernelClient = {
      async request<T>(endpoint: string, payload: any): Promise<T> {
        return kernel.request<T>(endpoint, payload);
      },
    };

    const answeredQ: QuestionCatalogEntry = { ...question(), questionId: "q-answered", blockId: "20260820120002-ans001" };
    const unansweredQ: QuestionCatalogEntry = { ...question(), questionId: "q-unanswered", blockId: "20260820120002-unans01" };
    const aggregates = new Map([
      ["q-answered", { attempts: 2, objectiveAttempts: 2, objectiveCorrect: 2 } as any],
    ]);

    // When includeUnanswered is false, only answeredQ is projected
    const res = await projectQuestionIndex(
      client,
      { avId, blockId },
      [answeredQ, unansweredQ],
      aggregates,
      2,
      { includeUnanswered: false },
    );
    expect(res).toEqual({ added: 1, updated: 0, deleted: 0, columns: 9 });

    const av = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    const questionValues = (av.av?.keyValues ?? av.keyValues).find((kv: any) => kv.key.name === "Question ID")?.values;
    expect(questionValues).toHaveLength(1);
    expect(questionValues[0].text?.content).toBe("q-answered");
  });
});
