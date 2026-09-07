import { describe, expect, it } from "vitest";
import type { PracticePlaylist } from "./playlist-schema";
import { deletePracticePlaylist, listPracticePlaylists, savePracticePlaylist } from "./playlist-repository";

function fakeIo(initial: unknown = undefined) {
  const store = new Map<string, unknown>();
  if (initial !== undefined) store.set("practicePlaylists", initial);
  const writes: unknown[] = [];
  return {
    store,
    writes,
    io: {
      getSetting: (key: string) => store.get(key),
      setSetting: (key: string, value: unknown) => {
        store.set(key, value);
        writes.push(value);
      },
    },
  };
}

function playlist(id: string, overrides: Partial<PracticePlaylist> = {}): PracticePlaylist {
  return {
    schema_version: 1,
    playlist_id: id,
    revision: 1,
    name: `Playlist ${id}`,
    point_av_id: "20260820225815-7ng4uj8",
    relation_key_ids: ["20260820230000-relatio"],
    include_subdocuments: false,
    created_at: "2026-09-07T00:00:00.000Z",
    updated_at: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("practice playlist repository", () => {
  it("returns an empty list when the setting is absent", async () => {
    const { io } = fakeIo();
    expect(await listPracticePlaylists(io)).toEqual([]);
  });

  it("saves a new playlist and preserves it in the settings document", async () => {
    const { io, store } = fakeIo();
    await savePracticePlaylist(io, playlist("11111111111111aaaaaaa"));
    const stored = store.get("practicePlaylists") as PracticePlaylist[];
    expect(stored).toHaveLength(1);
    expect((await listPracticePlaylists(io))[0].playlist_id).toBe("11111111111111aaaaaaa");
  });

  it("upserts by playlist id without duplicating rows", async () => {
    const { io } = fakeIo();
    await savePracticePlaylist(io, playlist("11111111111111aaaaaaa"));
    await savePracticePlaylist(io, playlist("22222222222222aaaaaaa"));
    await savePracticePlaylist(io, playlist("11111111111111aaaaaaa", { revision: 2, name: "Renamed" }));
    const list = await listPracticePlaylists(io);
    expect(list).toHaveLength(2);
    expect(list.find((item) => item.playlist_id === "11111111111111aaaaaaa")?.name).toBe("Renamed");
  });

  it("drops stored entries that no longer validate instead of throwing", async () => {
    const { io } = fakeIo([
      playlist("11111111111111aaaaaaa"),
      { playlist_id: "broken" },
      "garbage",
    ]);
    const list = await listPracticePlaylists(io);
    expect(list).toHaveLength(1);
  });

  it("deletes only the requested playlist", async () => {
    const { io } = fakeIo();
    await savePracticePlaylist(io, playlist("11111111111111aaaaaaa"));
    await savePracticePlaylist(io, playlist("22222222222222aaaaaaa"));
    await deletePracticePlaylist(io, "11111111111111aaaaaaa");
    const list = await listPracticePlaylists(io);
    expect(list.map((item) => item.playlist_id)).toEqual(["22222222222222aaaaaaa"]);
  });
});
