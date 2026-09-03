import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCoverBlacklistEntry,
  clearCoverBlacklistCache,
  COVER_BLACKLIST_STORAGE_NAME,
  loadCoverBlacklist,
  loadCoverBlacklistKeys,
  removeCoverBlacklistEntry,
  type CoverBlacklistStorage,
} from "./cover-blacklist";

function memoryStorage(): CoverBlacklistStorage & { dump: Map<string, unknown> } {
  const dump = new Map<string, unknown>();
  return {
    dump,
    async loadData(name: string) {
      return dump.get(name);
    },
    async saveData(name: string, value: unknown) {
      dump.set(name, value);
    },
  };
}

function sample(overrides: Partial<Parameters<typeof addCoverBlacklistEntry>[0]> = {}): Parameters<typeof addCoverBlacklistEntry>[0] {
  return {
    imageUrl: "https://safebooru.org/images/1/one.jpg",
    site: "safebooru.org",
    postId: 1,
    templateLabel: "safebooru",
    ...overrides,
  };
}

describe("cover blacklist storage", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(async () => {
    storage = memoryStorage();
    await clearCoverBlacklistCache();
  });

  afterEach(() => vi.restoreAllMocks());

  it("adds entries, dedupes by post identity and URL, and persists", async () => {
    expect(await addCoverBlacklistEntry(sample(), storage)).toBe(true);
    // Same site+postId via a different URL variant → still the same post.
    const duplicate = await addCoverBlacklistEntry(
      sample({ imageUrl: "https://safebooru.org/images/9/other.jpg" }),
      storage,
    );
    expect(duplicate).toBe(false);
    expect(await loadCoverBlacklist(storage)).toHaveLength(1);
    // A genuinely different post gets in.
    await addCoverBlacklistEntry(sample({ postId: 2, imageUrl: "https://safebooru.org/images/2/two.jpg" }), storage);
    expect(await loadCoverBlacklist(storage)).toHaveLength(2);
    expect(storage.dump.has(COVER_BLACKLIST_STORAGE_NAME)).toBe(true);
  });

  it("exposes dedup-ready keys (normalized URL + site:postId)", async () => {
    await addCoverBlacklistEntry(sample(), storage);
    const keys = await loadCoverBlacklistKeys(storage);
    expect([...keys].some((key) => key.includes("one.jpg"))).toBe(true);
    expect([...keys].some((key) => key.startsWith("booru-post:safebooru.org:1"))).toBe(true);
  });

  it("removes entries", async () => {
    await addCoverBlacklistEntry(sample(), storage);
    const [entry] = await loadCoverBlacklist(storage);
    const after = await removeCoverBlacklistEntry(entry.id, storage);
    expect(after).toHaveLength(0);
  });
});
