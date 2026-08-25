import { describe, expect, it } from "vitest";
import {
  appendFsrsWeightHistory,
  loadFsrsWeightHistory,
  parseFsrsWeightHistory,
  type FsrsWeightHistoryStorage,
} from "./fsrs-weight-history";

const weights = (offset: number) => Array.from({ length: 19 }, (_, index) => index + offset);

function storage(initial: unknown = undefined): FsrsWeightHistoryStorage & { value: unknown } {
  return {
    value: initial,
    async loadData() { return this.value; },
    async saveData(_name, content) { this.value = content; },
  };
}

describe("FSRS weight history", () => {
  it("ignores malformed entries and normalizes valid vectors", () => {
    const parsed = parseFsrsWeightHistory([{ id: "ok", createdAt: 10, source: "optimizer", previous: weights(0), next: weights(1) }, { id: "bad" }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].next).toEqual(weights(1));
  });

  it("persists newest changes first and keeps undoable previous vectors", async () => {
    const data = storage();
    const first = await appendFsrsWeightHistory(data, { source: "optimizer", previous: weights(0), next: weights(1), createdAt: 10 });
    expect(first[0].previous).toEqual(weights(0));
    await appendFsrsWeightHistory(data, { source: "undo", previous: weights(1), next: weights(0), createdAt: 20 });
    const loaded = await loadFsrsWeightHistory(data);
    expect(loaded.map((entry) => entry.source)).toEqual(["undo", "optimizer"]);
  });
});
