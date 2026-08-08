import { describe, expect, it, vi } from "vitest";
import { StoreSyncCoordinator } from "./sync-coordinator";

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

  it("runs an immediate merge when the question bank opens", async () => {
    const run = vi.fn(async () => ({mergedAt: "2026-08-08T00:00:00.000Z"}));
    const success = vi.fn();
    const coordinator = new StoreSyncCoordinator({run}, {debounceMs: 100, onSuccess: success});

    await coordinator.request();

    expect(run).toHaveBeenCalledOnce();
    expect(success).toHaveBeenCalledOnce();
  });
});
