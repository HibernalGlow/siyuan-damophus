import { describe, expect, it } from "vitest";
import { MockKernelClient } from "../adapters/siyuan/siyuan-adapter.fixtures";
import type { SiyuanKernelClient } from "../adapters/siyuan/types";
import type { QuestionCatalogEntry } from "../assembly";
import { projectQuestionIndex, runQuestionIndexSync } from "./projection";

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
    expect(first).toEqual({ added: 1, updated: 0, deleted: 0, columns: 10 });

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
    expect(result).toEqual({ added: 1, updated: 0, deleted: 0, columns: 10 });

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
    expect(res).toEqual({ added: 1, updated: 0, deleted: 0, columns: 10 });

    const av = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    const questionValues = (av.av?.keyValues ?? av.keyValues).find((kv: any) => kv.key.name === "Question ID")?.values;
    expect(questionValues).toHaveLength(1);
    expect(questionValues[0].text?.content).toBe("q-answered");
  });

  it("writes all cells of a row through the batch endpoint", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });

    await projectQuestionIndex(kernel, { avId, blockId }, [question()], new Map());
    expect(kernel.requests.some((r) => r.endpoint === "/api/av/batchSetAttributeViewBlockAttrs")).toBe(true);
    expect(kernel.requests.filter((r) => r.endpoint === "/api/av/setAttributeViewBlockAttr")).toHaveLength(0);
  });

  it("reports rows without a primary-key value as orphans and rebuilds them", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });

    const q = question();
    await projectQuestionIndex(kernel, { avId, blockId }, [q], new Map());

    // Simulate kernel-side corruption: the row keeps its Question ID value but loses its primary-key value.
    const av = kernel.attributeViews.get(avId)!;
    const primary = av.keyValues.find((kv) => kv.key.type === "block")!;
    expect(primary.values).toHaveLength(1);
    primary.values = [];

    const second = await projectQuestionIndex(kernel, { avId, blockId }, [q], new Map());
    expect(second.added).toBe(1);
    expect(second.orphanRows).toBe(1);
    const avAfter = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    const primaryAfter = (avAfter.av?.keyValues ?? avAfter.keyValues).find((kv: any) => kv.key.type === "block");
    expect(primaryAfter.values).toHaveLength(1);
    const primaryRowId = primaryAfter.values[0].blockID;
    const questionValues = (avAfter.av?.keyValues ?? avAfter.keyValues).find((kv: any) => kv.key.name === "Question ID")?.values;
    const rebuilt = questionValues.find((value: any) => value.blockID === primaryRowId);
    expect(rebuilt?.text?.content).toBe(q.questionId);
  });

  it("prunes orphan rows when pruneStale is enabled", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });

    const q = question();
    await projectQuestionIndex(kernel, { avId, blockId }, [q], new Map());
    const av = kernel.attributeViews.get(avId)!;
    const primary = av.keyValues.find((kv) => kv.key.type === "block")!;
    const orphanRowId = primary.values[0].blockID;
    primary.values = [];

    const pruned = await projectQuestionIndex(kernel, { avId, blockId }, [q], new Map(), 2, { pruneStale: true });
    expect(pruned.deleted).toBe(1);
    expect(pruned.orphanRows).toBe(1);
    const avAfter = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    for (const keyValues of (avAfter.av?.keyValues ?? avAfter.keyValues)) {
      for (const value of keyValues.values ?? []) {
        expect(value.blockID).not.toBe(orphanRowId);
      }
    }
  });

  it("keeps syncing when one row fails to write and reports the failure", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });

    const q1: QuestionCatalogEntry = { ...question(), questionId: "q-broken", blockId: "20260820120002-broken1", questionTitle: "创建失败的题目" };
    const q2: QuestionCatalogEntry = { ...question(), questionId: "q-ok", blockId: "20260820120002-ok00001" };
    const client: SiyuanKernelClient = {
      async request<T>(endpoint: string, payload: any): Promise<T> {
        if (endpoint === "/api/av/addAttributeViewBlocks") {
          if (payload.srcs?.some((source: { content?: string }) => source.content === "创建失败的题目")) {
            throw new Error("kernel rejected the row");
          }
        }
        return kernel.request<T>(endpoint, payload);
      },
    };

    const result = await projectQuestionIndex(client, { avId, blockId }, [q1, q2], new Map());
    expect(result.added).toBe(1);
    expect(result.failedRows).toBe(1);

    const av = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    const questionValues = (av.av?.keyValues ?? av.keyValues).find((kv: any) => kv.key.name === "Question ID")?.values;
    expect(questionValues.map((value: any) => value.text?.content)).toContain("q-ok");
    expect(questionValues.map((value: any) => value.text?.content)).not.toContain("q-broken");
  });

  it("projects bookmark state into the 收藏 column and ignores archived bookmarks", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });

    const active: QuestionCatalogEntry = { ...question(), questionId: "q-bookmarked", blockId: "20260820120002-mark001" };
    const archived: QuestionCatalogEntry = { ...question(), questionId: "q-archived", blockId: "20260820120002-arch01" };
    const plain: QuestionCatalogEntry = { ...question(), questionId: "q-plain", blockId: "20260820120002-plain01" };
    const bookmarks = new Map([
      ["q-bookmarked", { questionId: "q-bookmarked", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", tags: ["classic"], note: "" }],
      ["q-archived", { questionId: "q-archived", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", tags: [], note: "", isArchived: true }],
    ] as const);

    const result = await projectQuestionIndex(kernel, { avId, blockId }, [active, archived, plain], new Map(), 2, {
      bookmarkedQuestionIds: new Set([...bookmarks.values()].filter((bookmark) => !bookmark.isArchived).map((bookmark) => bookmark.questionId)),
    });
    expect(result.columns).toBe(10);

    const av = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    const keyValues = av.av?.keyValues ?? av.keyValues;
    expect(keyValues.find((kv: any) => kv.key.name === "收藏")?.key.type).toBe("checkbox");
    const questionIdByRowId = new Map(
      (keyValues.find((kv: any) => kv.key.name === "Question ID")?.values ?? []).map((value: any) => [value.blockID, value.text?.content]),
    );
    const checkedByQuestionId = new Map(
      (keyValues.find((kv: any) => kv.key.name === "收藏")?.values ?? []).map((value: any) => [questionIdByRowId.get(value.blockID), value.checkbox?.checked === true]),
    );
    expect(checkedByQuestionId.get("q-bookmarked")).toBe(true);
    expect(checkedByQuestionId.get("q-archived")).toBe(false);
    expect(checkedByQuestionId.get("q-plain")).toBe(false);
  });

  it("loads bookmarks through the sync deps and merges them into projection options", async () => {
    const kernel = new MockKernelClient();
    await kernel.request("/api/av/renderAttributeView", {
      id: avId, blockID: blockId, viewID: "", page: 1, pageSize: 1,
      query: "", groupPaging: {}, createIfNotExist: true,
    });

    const q = question();
    const outcomes = await runQuestionIndexSync(
      {
        client: kernel,
        loadCatalog: async () => [q],
        loadAggregates: async () => new Map(),
        loadBookmarks: async () => new Map([
          [q.questionId, { questionId: q.questionId, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z", tags: [], note: "" }],
        ]),
      },
      [{ blockId, avId, options: { pruneStale: false, includeUnanswered: true } }],
    );
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0].ok).toBe(true);

    const av = await kernel.request<any>("/api/av/getAttributeView", { id: avId });
    const keyValues = av.av?.keyValues ?? av.keyValues;
    const checked = keyValues.find((kv: any) => kv.key.name === "收藏")?.values ?? [];
    expect(checked.map((value: any) => value.checkbox?.checked)).toEqual([true]);
  });
});
