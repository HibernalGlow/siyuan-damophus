import { beforeEach, describe, expect, it } from "vitest";
import {
  COVER_FAVORITES_STORAGE_NAME,
  clearCoverFavoritesCache,
  coverFavoriteKey,
  loadCoverFavorites,
  removeCoverFavorite,
  updateCoverFavorite,
  upsertCoverFavorite,
  type CoverFavoriteStorage,
} from "./cover-favorites";

function createStorage(initial: unknown = undefined): CoverFavoriteStorage & { value: unknown } {
  return {
    value: initial,
    async loadData() {
      return this.value;
    },
    async saveData(name, value) {
      expect(name).toBe(COVER_FAVORITES_STORAGE_NAME);
      this.value = value;
    },
  };
}

describe("cover favorites storage", () => {
  beforeEach(async () => {
    await clearCoverFavoritesCache();
  });

  it("stores a standalone favorite file with metadata and preserves it after reload", async () => {
    const storage = createStorage();
    const favorite = await upsertCoverFavorite({
      imageUrl: "https://cdn.example/cover.jpg",
      postUrl: "https://example/posts/42",
      site: "example",
      postId: 42,
      tags: ["scenery"],
      documentId: "20260101010101-a",
      documentTitle: "民法总则",
      documentPath: "法考/民法总则",
      cachePath: "/data/storage/petal/siyuan-damophus/more-background/covers/a.webp",
      rating: 4,
    }, storage);

    expect(favorite.rating).toBe(4);
    expect(coverFavoriteKey(favorite)).toBe("example:42");
    expect((storage.value as { items: unknown[] }).items).toHaveLength(1);

    await clearCoverFavoritesCache();
    const loaded = await loadCoverFavorites(storage);
    expect(loaded[0].documentPath).toBe("法考/民法总则");
    expect(loaded[0].cachePath).toContain("covers/a.webp");
  });

  it("updates rating and removes a favorite by id", async () => {
    const storage = createStorage();
    const favorite = await upsertCoverFavorite({ imageUrl: "https://cdn.example/a.jpg" }, storage);
    const updated = await updateCoverFavorite(favorite.id, { rating: 5 }, storage);
    expect(updated?.rating).toBe(5);
    const remaining = await removeCoverFavorite(favorite.id, storage);
    expect(remaining).toEqual([]);
  });

  it("deduplicates by post identity instead of creating duplicate rows", async () => {
    const storage = createStorage();
    await upsertCoverFavorite({ imageUrl: "https://cdn.example/a.jpg", site: "danbooru.donmai.us", postId: 8 }, storage);
    const second = await upsertCoverFavorite({ imageUrl: "https://cdn.example/b.jpg", site: "danbooru.donmai.us", postId: 8, rating: 3 }, storage);
    const loaded = await loadCoverFavorites(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].imageUrl).toBe("https://cdn.example/b.jpg");
    expect(second.rating).toBe(3);
  });
});

