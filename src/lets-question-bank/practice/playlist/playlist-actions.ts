import type { QuestionBankUiController } from "../../controller";
import type { PlaylistResolution } from "./playlist-resolve";
import type { PracticePlaylist } from "./playlist-schema";

/** Live view of the component state the playlist flows drive. */
export interface PlaylistActionsState {
  playlists: PracticePlaylist[];
  playlistManagerOpen: boolean;
  activePlaylistId: string | undefined;
  playlistResolution: PlaylistResolution | undefined;
  /** `revision` of the playlist the cached resolution was computed from. */
  playlistResolvedRevision: number | undefined;
  playlistResolving: boolean;
}

export function createPlaylistActions(deps: {
  state: PlaylistActionsState;
  controller: QuestionBankUiController;
  run: (operation: () => Promise<void>) => Promise<void>;
}) {
  const { state, controller, run } = deps;

  function requireController(): NonNullable<
    Pick<QuestionBankUiController, "listPracticePlaylists" | "savePracticePlaylist" | "deletePracticePlaylist" | "resolvePlaylist">
  > {
    if (!controller.listPracticePlaylists || !controller.savePracticePlaylist
      || !controller.deletePracticePlaylist || !controller.resolvePlaylist) {
      throw new Error("Playlist services are unavailable");
    }
    return controller as NonNullable<
      Pick<QuestionBankUiController, "listPracticePlaylists" | "savePracticePlaylist" | "deletePracticePlaylist" | "resolvePlaylist">
    >;
  }

  async function loadPlaylists(): Promise<void> {
    state.playlists = await requireController().listPracticePlaylists();
  }

  function openPlaylistManager(): void {
    state.playlistManagerOpen = true;
    void run(loadPlaylists);
  }

  function closePlaylistManager(): void {
    state.playlistManagerOpen = false;
  }

  function selectPlaylist(playlistId: string | undefined): void {
    state.activePlaylistId = playlistId;
    state.playlistResolution = undefined;
    state.playlistResolvedRevision = undefined;
    if (playlistId) void run(() => ensureActivePlaylistResolution());
  }

  /** Resolves the active playlist unless a matching cached resolution exists. */
  async function ensureActivePlaylistResolution(): Promise<PlaylistResolution | undefined> {
    const playlist = state.playlists.find((item) => item.playlist_id === state.activePlaylistId);
    if (!playlist) return undefined;
    if (state.playlistResolution
      && state.playlistResolution.playlistId === playlist.playlist_id
      && state.playlistResolvedRevision === playlist.revision) {
      return state.playlistResolution;
    }
    state.playlistResolving = true;
    try {
      const resolution = await requireController().resolvePlaylist(playlist);
      state.playlistResolution = resolution;
      state.playlistResolvedRevision = playlist.revision;
      return resolution;
    } finally {
      state.playlistResolving = false;
    }
  }

  async function savePlaylist(playlist: PracticePlaylist): Promise<void> {
    await requireController().savePracticePlaylist(playlist);
    await loadPlaylists();
    if (state.activePlaylistId === playlist.playlist_id) {
      state.playlistResolution = undefined;
      state.playlistResolvedRevision = undefined;
      state.activePlaylistId = playlist.playlist_id;
      await ensureActivePlaylistResolution();
    }
  }

  async function deletePlaylist(playlistId: string): Promise<void> {
    await requireController().deletePracticePlaylist(playlistId);
    await loadPlaylists();
    if (state.activePlaylistId === playlistId) {
      state.activePlaylistId = undefined;
      state.playlistResolution = undefined;
      state.playlistResolvedRevision = undefined;
    }
  }

  return {
    loadPlaylists,
    openPlaylistManager,
    closePlaylistManager,
    selectPlaylist,
    ensureActivePlaylistResolution,
    savePlaylist,
    deletePlaylist,
  };
}
