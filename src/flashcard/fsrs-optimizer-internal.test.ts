import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildFsrsTrainingDataset } from "./fsrs-optimizer-protocol";
import { optimizeFsrsInPlugin } from "./fsrs-optimizer-internal";

describe("internal FSRS optimizer", () => {
  it("trains in a non-isolated plugin page with the bundled WASM", async () => {
    const bytes = await readFile("node_modules/fsrs-browser/fsrs_browser_bg.wasm");
    vi.stubGlobal("window", { setInterval, clearInterval });
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("self", { crypto: webcrypto, addEventListener: () => undefined, postMessage: () => undefined });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })));
    const entries = Array.from({ length: 40 }, (_, index) => ({
      id: `review-${index}`,
      cardId: `card-${index % 8}`,
      rating: (index % 4) + 1,
      scheduledDays: index,
      elapsedDays: index,
      reviewed: 1_700_000_000 + index * 86_400,
      state: index === 0 ? 0 : 2,
    }));
    const progress: Array<[number, number]> = [];
    const result = await optimizeFsrsInPlugin(buildFsrsTrainingDataset(entries), {
      pluginName: "siyuan-damophus",
      onProgress: (processed, total) => progress.push([processed, total]),
    });
    expect(result.optimizerVersion).toBe("2.0.4");
    expect(result.weights).toHaveLength(19);
    expect(result.weights.every(Number.isFinite)).toBe(true);
    expect(progress.at(-1)).toEqual([40, 40]);
    vi.unstubAllGlobals();
  }, 120_000);
});
