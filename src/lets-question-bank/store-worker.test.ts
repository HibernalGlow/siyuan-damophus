import { describe, expect, it, vi } from "vitest";
import { createDamophusStore, TABLE } from "../question-bank/adapters/tinybase/tables";
import { mergeStoreContents, installStoreWorker, type StoreWorkerMergeRequest } from "./store-worker";
import { StoreSyncCoordinator } from "./sync-coordinator";

describe("post-sync TinyBase worker", () => {
  it("merges independent store contents without a main-thread table algorithm", () => {
    const first = createDamophusStore("first").setCell(TABLE.questions, "q1", "title", "First");
    const second = createDamophusStore("second").setCell(TABLE.questions, "q2", "title", "Second");
    const result = mergeStoreContents([
      {store_id: "first", mergeable_content: first.getMergeableContent()},
      {store_id: "second", mergeable_content: second.getMergeableContent()},
    ]);
    const merged = createDamophusStore("assert").setMergeableContent(result);
    expect(merged.getCell(TABLE.questions, "q1", "title")).toBe("First");
    expect(merged.getCell(TABLE.questions, "q2", "title")).toBe("Second");
  });

  it("handles worker requests and reports malformed payloads", () => {
    const scope = {postMessage: vi.fn(), onmessage: null} as unknown as Parameters<typeof installStoreWorker>[0];
    installStoreWorker(scope);
    const request: StoreWorkerMergeRequest = {type: "merge", request_id: "1", stores: []};
    scope.onmessage?.({data: request} as MessageEvent<StoreWorkerMergeRequest>);
    expect(scope.postMessage).toHaveBeenCalledWith(expect.objectContaining({type: "merged", request_id: "1"}));
  });
});

describe("sync-end coordination", () => {
  it("debounces repeated sync-end events and ignores sync-fail", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => ({mergedAt: "2026-08-08T00:00:00.000Z"}));
    const success = vi.fn();
    const failure = vi.fn();
    const coordinator = new StoreSyncCoordinator({run}, {debounceMs: 100, onSuccess: success, onFailure: failure});
    coordinator.handle({cmd: "sync-fail"});
    await vi.advanceTimersByTimeAsync(200);
    expect(run).not.toHaveBeenCalled();
    coordinator.handle({cmd: "sync-end"});
    coordinator.handle({cmd: "sync-end"});
    await vi.advanceTimersByTimeAsync(99);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await coordinator.flush();
    expect(run).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled();
    coordinator.close();
    vi.useRealTimers();
  });

  it("retains the last validated result after a failed merge", async () => {
    const runner = {run: vi.fn()
      .mockResolvedValueOnce({mergedAt: "2026-08-08T00:00:00.000Z"})
      .mockRejectedValueOnce(new Error("corrupt shard"))};
    const failure = vi.fn();
    const coordinator = new StoreSyncCoordinator(runner, {debounceMs: 0, onFailure: failure});
    coordinator.handle({cmd: "sync-end"});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await coordinator.flush();
    expect(coordinator.getLastValidated()?.mergedAt).toBe("2026-08-08T00:00:00.000Z");
    coordinator.handle({cmd: "sync-end"});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await coordinator.flush();
    expect(failure).toHaveBeenCalledOnce();
    expect(coordinator.getLastValidated()?.mergedAt).toBe("2026-08-08T00:00:00.000Z");
  });
});
