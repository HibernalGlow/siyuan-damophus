import { describe, expect, it } from "vitest";
import { BroadcastPracticeSessionLeaseCoordinator } from "./session-host";

describe("practice session lease coordinator", () => {
  it("uses Web Locks without calling broadcast-channel applyOnce", async () => {
    expect(navigator.locks).toBeDefined();
    const sourceKey = `web-lock-${crypto.randomUUID()}`;
    const first = new BroadcastPracticeSessionLeaseCoordinator();
    const second = new BroadcastPracticeSessionLeaseCoordinator();

    try {
      expect(await first.acquire(sourceKey)).toBe(true);
      expect(await second.acquire(sourceKey)).toBe(false);

      await first.release(sourceKey);

      expect(await second.acquire(sourceKey)).toBe(true);
    } finally {
      await Promise.all([first.releaseAll(), second.releaseAll()]);
    }
  });
});
