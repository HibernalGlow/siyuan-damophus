import { describe, expect, it } from "vitest";
import { parsePracticePlaylists, PracticePlaylistSchema, serializePracticePlaylists } from "./playlist-schema";

const validPlaylist = {
  schema_version: 1,
  playlist_id: "11111111111111aaaaaaa",
  revision: 1,
  name: "Civil mini topics",
  point_av_id: "20260820225815-7ng4uj8",
  relation_key_ids: ["20260820230000-relatio"],
  include_subdocuments: false,
  created_at: "2026-09-07T00:00:00.000Z",
  updated_at: "2026-09-07T00:00:00.000Z",
};

describe("practice playlist schema", () => {
  it("accepts a well-formed playlist and keeps optional view omitted", () => {
    const parsed = PracticePlaylistSchema.parse(validPlaylist);
    expect(parsed.view_id).toBeUndefined();
    expect(parsed.name).toBe("Civil mini topics");
  });

  it("accepts an explicit view id and node-shaped relation keys", () => {
    const parsed = PracticePlaylistSchema.parse({
      ...validPlaylist,
      view_id: "20260820230000-view001",
      relation_key_ids: ["20260820230000-relatio", "20260820230001-relatio"],
    });
    expect(parsed.view_id).toBe("20260820230000-view001");
    expect(parsed.relation_key_ids).toHaveLength(2);
  });

  it("rejects ids that are not SiYuan node ids", () => {
    expect(PracticePlaylistSchema.safeParse({
      ...validPlaylist,
      point_av_id: "not-a-node-id",
    }).success).toBe(false);
    expect(PracticePlaylistSchema.safeParse({
      ...validPlaylist,
      relation_key_ids: [""],
    }).success).toBe(false);
  });

  it("rejects playlists without a name, revision, or timestamps", () => {
    expect(PracticePlaylistSchema.safeParse({ ...validPlaylist, name: "" }).success).toBe(false);
    expect(PracticePlaylistSchema.safeParse({ ...validPlaylist, revision: 0 }).success).toBe(false);
    expect(PracticePlaylistSchema.safeParse({ ...validPlaylist, updated_at: "yesterday" }).success).toBe(false);
  });

  it("drops invalid entries and dedupes by playlist id when parsing stored lists", () => {
    const stored = [
      validPlaylist,
      { ...validPlaylist, name: "" },
      { ...validPlaylist, playlist_id: "11111111111111aaaaaaa", revision: 3 },
      { ...validPlaylist, playlist_id: "22222222222222aaaaaaa", view_id: "20260820230000-view001" },
      "garbage",
    ];
    const parsed = parsePracticePlaylists(stored);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].playlist_id).toBe("11111111111111aaaaaaa");
    expect(parsed[1].playlist_id).toBe("22222222222222aaaaaaa");
  });

  it("returns an empty list for non-array input and round-trips serialization", () => {
    expect(parsePracticePlaylists(undefined)).toEqual([]);
    expect(parsePracticePlaylists({})).toEqual([]);
    const parsed = parsePracticePlaylists([validPlaylist]);
    expect(parsePracticePlaylists(JSON.parse(serializePracticePlaylists(parsed)))).toEqual(parsed);
  });
});
