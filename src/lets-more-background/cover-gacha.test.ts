import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCoverStashEntry,
  clearCoverStash,
  clearCoverStashCache,
  COVER_STASH_STORAGE_NAME,
  getCoverStashCountSync,
  loadCoverStash,
  peekRandomCoverStash,
  removeCoverStashEntry,
  type CoverStashEntry,
  type CoverStashStorage,
} from "./cover-gacha";
import { resolveBooruImageCandidates } from "./booru";

function memoryStorage(): CoverStashStorage & { dump: Map<string, unknown> } {
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

function sampleEntry(overrides: Partial<CoverStashEntry> = {}): Parameters<typeof addCoverStashEntry>[0] {
  return {
    imageUrl: "https://safebooru.org/images/1/sample.jpg",
    site: "safebooru.org",
    postId: 1,
    tags: ["scenery"],
    templateLabel: "safebooru",
    ...overrides,
  };
}

describe("cover stash storage", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(async () => {
    storage = memoryStorage();
    await clearCoverStashCache();
  });

  afterEach(() => vi.restoreAllMocks());

  it("adds entries, dedupes by post identity, and persists to storage", async () => {
    const first = await addCoverStashEntry(sampleEntry(), storage);
    expect(first.added).toBe(true);
    // Same site+postId → duplicate, even with a different URL.
    const duplicate = await addCoverStashEntry(sampleEntry({ imageUrl: "https://safebooru.org/images/9/other.jpg" }), storage);
    expect(duplicate.added).toBe(false);
    const distinct = await addCoverStashEntry(sampleEntry({ postId: 2, imageUrl: "https://safebooru.org/images/2/two.jpg" }), storage);
    expect(distinct.added).toBe(true);

    const stash = await loadCoverStash(storage);
    expect(stash).toHaveLength(2);
    expect(stash[0].postId).toBe(2);
    expect(storage.dump.has(COVER_STASH_STORAGE_NAME)).toBe(true);
  });

  it("removes and clears entries", async () => {
    await addCoverStashEntry(sampleEntry(), storage);
    const stash = await loadCoverStash(storage);
    const afterRemove = await removeCoverStashEntry(stash[0].id, storage);
    expect(afterRemove).toHaveLength(0);
    await addCoverStashEntry(sampleEntry(), storage);
    await clearCoverStash(storage);
    expect(await loadCoverStash(storage)).toHaveLength(0);
  });

  it("peek returns a random entry without removing it", async () => {
    await addCoverStashEntry(sampleEntry(), storage);
    const peeked = await peekRandomCoverStash(storage);
    expect(peeked).not.toBeNull();
    expect((await loadCoverStash(storage))).toHaveLength(1);
    expect(getCoverStashCountSync()).toBe(1);
  });

  it("drops malformed entries when parsing stored payloads", async () => {
    storage.dump.set(COVER_STASH_STORAGE_NAME, {
      schemaVersion: 1,
      items: [
        { id: "a", imageUrl: "https://safebooru.org/images/1/a.jpg", addedAt: "2026-01-01T00:00:00Z" },
        { id: "b", imageUrl: "" },
        "garbage",
      ],
    });
    await clearCoverStashCache();
    const stash = await loadCoverStash(storage);
    expect(stash).toHaveLength(1);
    expect(stash[0].id).toBe("a");
  });
});

describe("resolveBooruImageCandidates (gacha draw)", () => {
  afterEach(() => vi.restoreAllMocks());

  function mockFetchWithPosts(posts: unknown[]): void {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      json: async () => ({
        code: 0,
        data: {
          status: 200,
          body: JSON.stringify(posts),
        },
      }),
    } as Response);
  }

  it("returns up to `count` distinct candidates honoring dedup exclusions", async () => {
    mockFetchWithPosts([
      { id: 1, file_url: "https://safebooru.org/images/1/one.jpg", preview_url: "https://safebooru.org/previews/1/one.jpg", width: 1920, height: 1080, score: 50, tags: "scenery" },
      { id: 2, file_url: "https://safebooru.org/images/2/two.jpg", preview_url: "https://safebooru.org/previews/2/two.jpg", width: 1920, height: 1080, score: 60, tags: "scenery" },
      { id: 3, file_url: "https://safebooru.org/images/3/three.jpg", preview_url: "https://safebooru.org/previews/3/three.jpg", width: 1920, height: 1080, score: 70, tags: "scenery" },
    ]);

    const picks = await resolveBooruImageCandidates(
      "booru:sb?tags=scenery&ratio=wide&min_score=30",
      undefined,
      undefined,
      ["https://safebooru.org/images/1/one.jpg"],
      2,
    );
    expect(picks).toHaveLength(2);
    const urls = new Set(picks.map((pick) => pick.imageUrl));
    expect(urls.size).toBe(2);
    expect(urls.has("https://safebooru.org/images/1/one.jpg")).toBe(false);
    // Preview URLs are captured for the gacha grid thumbnails.
    expect(picks.every((pick) => typeof pick.previewUrl === "string" && pick.previewUrl.length > 0)).toBe(true);
  });

  it("returns fewer cards when the filtered pool is smaller than the request", async () => {
    mockFetchWithPosts([
      { id: 1, file_url: "https://safebooru.org/images/1/only.jpg", width: 1920, height: 1080, score: 50, tags: "scenery" },
    ]);

    const picks = await resolveBooruImageCandidates("booru:sb?tags=scenery&ratio=wide", undefined, undefined, undefined, 6);
    expect(picks).toHaveLength(1);
    expect(picks[0].imageUrl).toBe("https://safebooru.org/images/1/only.jpg");
  });

  it("returns no cards when every post is filtered out", async () => {
    mockFetchWithPosts([
      { id: 1, file_url: "https://safebooru.org/images/1/used.jpg", width: 1920, height: 1080, score: 50, tags: "scenery" },
    ]);

    const picks = await resolveBooruImageCandidates(
      "booru:sb?tags=scenery&ratio=wide",
      undefined,
      undefined,
      ["https://safebooru.org/images/1/used.jpg"],
      6,
    );
    expect(picks).toHaveLength(0);
  });
});
