import {
  parsePracticePlaylists,
  type PracticePlaylist,
} from "./playlist-schema";

/** Settings-document access, mirroring the question-set repository shape. */
export interface PracticePlaylistSettingsIo {
  getSetting(key: string): unknown;
  setSetting(key: string, value: unknown): void | Promise<void>;
}

const settingKey = "practicePlaylists";

export async function listPracticePlaylists(io: PracticePlaylistSettingsIo): Promise<PracticePlaylist[]> {
  return parsePracticePlaylists(io.getSetting(settingKey));
}

export async function savePracticePlaylist(
  io: PracticePlaylistSettingsIo,
  playlist: PracticePlaylist,
): Promise<void> {
  const next = (await listPracticePlaylists(io)).filter(
    (item) => item.playlist_id !== playlist.playlist_id,
  );
  next.push(playlist);
  await io.setSetting(settingKey, next);
}

export async function deletePracticePlaylist(
  io: PracticePlaylistSettingsIo,
  playlistId: string,
): Promise<void> {
  await io.setSetting(settingKey, (await listPracticePlaylists(io)).filter(
    (item) => item.playlist_id !== playlistId,
  ));
}
