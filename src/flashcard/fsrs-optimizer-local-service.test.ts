import * as crypto from "node:crypto";
import * as http from "node:http";
import { describe, expect, it } from "vitest";
import { FsrsOptimizerLocalService, type OptimizerAssets } from "./fsrs-optimizer-local-service";
import { buildFsrsTrainingDataset } from "./fsrs-optimizer-protocol";
import type { RiffReviewLogEntry } from "./review-log-export";

function dataset() {
  const entries: RiffReviewLogEntry[] = [
    { id: "1", cardId: "card-a", rating: 3, scheduledDays: 0, elapsedDays: 0, reviewed: 10, state: 0 },
    { id: "2", cardId: "card-a", rating: 3, scheduledDays: 1, elapsedDays: 1, reviewed: 20, state: 2 },
  ];
  return buildFsrsTrainingDataset(entries);
}

function assets(): OptimizerAssets {
  return new Map([
    ["/index.html", { body: new TextEncoder().encode("<!doctype html><title>FSRS</title>"), contentType: "text/html" }],
  ]);
}

function runtime(openExternal: (url: string) => Promise<void>) {
  return {
    createServer: (handler: Parameters<typeof http.createServer>[0]) => http.createServer(handler),
    randomBytes: crypto.randomBytes,
    openExternal,
  } as never;
}

describe("FSRS optimizer local service", () => {
  it("serves an isolated token-protected session and accepts a matching 19-weight result", async () => {
    let checkedHeaders = false;
    const service = new FsrsOptimizerLocalService({
      port: 0,
      runtime: runtime(async (url) => {
        const sessionUrl = new URL(url);
        const page = await fetch(url);
        expect(page.status).toBe(200);
        expect(page.headers.get("cross-origin-opener-policy")).toBe("same-origin");
        expect(page.headers.get("cross-origin-embedder-policy")).toBe("require-corp");
        checkedHeaders = true;
        const token = sessionUrl.searchParams.get("token");
        const session = await fetch(`${sessionUrl.origin}/api/session?token=${token}`).then((response) => response.json());
        await fetch(`${sessionUrl.origin}/api/result?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: 1,
            optimizerVersion: "2.0.4",
            parameterCount: 19,
            weights: Array.from({ length: 19 }, (_, index) => index + 0.5),
            durationMs: 120,
            sourceRecordCount: session.sourceRecordCount,
            cardCount: session.cardCount,
          }),
        });
      }),
    });
    const result = await service.optimize(dataset(), assets());
    expect(checkedHeaders).toBe(true);
    expect(result.weights).toHaveLength(19);
    expect(service.running).toBe(false);
  });

  it("rejects a result that claims a different dataset", async () => {
    const service = new FsrsOptimizerLocalService({
      port: 0,
      runtime: runtime(async (url) => {
        const sessionUrl = new URL(url);
        const token = sessionUrl.searchParams.get("token");
        await fetch(`${sessionUrl.origin}/api/result?token=${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            schema: 1,
            optimizerVersion: "2.0.4",
            parameterCount: 19,
            weights: Array(19).fill(1),
            durationMs: 1,
            sourceRecordCount: 999,
            cardCount: 1,
          }),
        });
      }),
    });
    await expect(service.optimize(dataset(), assets())).rejects.toThrow("does not match the active dataset");
  });
});
