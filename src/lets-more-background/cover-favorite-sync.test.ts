import { afterEach, describe, expect, it, vi } from "vitest";
import { supportsCoverFavoriteSync, syncCoverFavoriteToSite } from "./cover-favorite-sync";
import type { CoverFavorite } from "./cover-favorites";

const favorite: CoverFavorite = {
  id: "fav-1",
  imageUrl: "https://cdn.example/1.jpg",
  site: "danbooru.donmai.us",
  postId: 42,
  rating: 5,
  addedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("cover favorite site sync", () => {
  afterEach(() => vi.restoreAllMocks());

  it("syncs Danbooru favorites through SiYuan's proxy", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { status: 201 } })));
    const result = await syncCoverFavoriteToSite(favorite, {
      id: "cred",
      site: "danbooru.donmai.us",
      login: "alice",
      apiKey: "secret",
    });
    expect(result.status).toBe("synced");
    expect(fetchMock).toHaveBeenCalledWith("/api/network/forwardProxy", expect.objectContaining({ method: "POST" }));
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("post_id=42");
  });

  it("reports unsupported sites and missing credentials without making a request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const unsupported = await syncCoverFavoriteToSite({ ...favorite, site: "gelbooru.com" }, undefined);
    const missing = await syncCoverFavoriteToSite(favorite, undefined);
    expect(unsupported.status).toBe("unsupported");
    expect(missing.status).toBe("not-configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supportsCoverFavoriteSync("safebooru.org")).toBe(false);
    expect(supportsCoverFavoriteSync("danbooru.donmai.us")).toBe(true);
  });
});
