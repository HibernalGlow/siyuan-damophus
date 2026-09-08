import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceEmbedBlockIds, type SourceEmbedBlockRow } from "./source-embed-query";

const rows = JSON.parse(readFileSync("D:/1Dev/Python/temp/qoder-fakao/t08-live-rows.json", "utf8")) as SourceEmbedBlockRow[];
const q = "20260908202837-3j6kztu";

describe("live t08 rows", () => {
  it("stem/solution split", () => {
    for (const section of ["stem", "solution"] as const) {
      const ids = sourceEmbedBlockIds(rows, q, section);
      console.log(`### ${section}: ${ids.length} blocks`);
      for (const id of ids.slice(0, 6)) {
        const r = rows.find((row) => row.id === id)!;
        console.log('   ', r.type, (r.markdown ?? r.content ?? "").replace(/\n/g, " | ").slice(0, 80));
      }
    }
    expect(true).toBe(true);
  });
});
