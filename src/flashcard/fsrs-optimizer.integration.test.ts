import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import { chromium, type Browser } from "playwright";
import { describe, expect, it } from "vitest";
import {
  FSRS_OPTIMIZER_ASSET_PATHS,
  FsrsOptimizerLocalService,
  type OptimizerAssets,
} from "./fsrs-optimizer-local-service";
import { buildFsrsTrainingDataset } from "./fsrs-optimizer-protocol";
import type { RiffReviewLogEntry } from "./review-log-export";

const integrationIt = process.env.RUN_FSRS_BROWSER_INTEGRATION === "1" ? it : it.skip;

function syntheticReviewLog(): RiffReviewLogEntry[] {
  const entries: RiffReviewLogEntry[] = [];
  for (let card = 0; card < 80; card += 1) {
    for (let review = 0; review < 8; review += 1) {
      entries.push({
        id: `${card}-${review}`,
        cardId: `card-${card}`,
        rating: ((card + review) % 4) + 1,
        scheduledDays: review === 0 ? 0 : review,
        elapsedDays: review === 0 ? 0 : review,
        reviewed: 1_700_000_000 + review * 86_400 + card,
        state: review === 0 ? 0 : 2,
      });
    }
  }
  return entries;
}

async function builtAssets(): Promise<OptimizerAssets> {
  const root = path.resolve("dist/fsrs-optimizer");
  const assets = new Map();
  for (const assetPath of FSRS_OPTIMIZER_ASSET_PATHS) {
    const extension = path.extname(assetPath);
    const contentType = extension === ".wasm" ? "application/wasm"
      : extension === ".js" ? "text/javascript; charset=utf-8"
        : extension === ".css" ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8";
    assets.set(assetPath, { body: new Uint8Array(await fs.readFile(path.join(root, assetPath))), contentType });
  }
  return assets;
}

describe("FSRS browser optimizer integration", () => {
  integrationIt("initializes multithreaded WASM and returns nineteen parameters", { timeout: 180_000 }, async () => {
    let browser: Browser | undefined;
    const consoleErrors: string[] = [];
    const service = new FsrsOptimizerLocalService({
      port: 0,
      runtime: {
        createServer: (handler: Parameters<typeof http.createServer>[0]) => http.createServer(handler),
        randomBytes: crypto.randomBytes,
        openExternal: async (url: string) => {
          browser = await chromium.launch({ headless: true });
          const page = await browser.newPage();
          page.on("console", (message) => {
            if (message.type() === "error") consoleErrors.push(message.text());
          });
          await page.goto(url);
          expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
          await page.locator("#start").click();
        },
      } as never,
    });
    try {
      const result = await service.optimize(buildFsrsTrainingDataset(syntheticReviewLog()), await builtAssets());
      expect(result.weights).toHaveLength(19);
      expect(result.weights.every(Number.isFinite)).toBe(true);
      expect(consoleErrors).toEqual([]);
    } finally {
      await browser?.close();
      await service.stop();
    }
  });
});
