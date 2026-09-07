<script lang="ts">
  import { Check, Database, ListChecks, Pencil, Search, Trash2, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Checkbox } from "@/components/ui/checkbox";
  import * as Select from "@/components/ui/select";
  import { PracticePlaylistSchema, type PracticePlaylist } from "./playlist/playlist-schema";
  import type {
    PlaylistAttributeViewMeta,
    PlaylistAttributeViewResult,
    PlaylistResolution,
    PlaylistUnresolvedReason,
  } from "./playlist/playlist-resolve";

  export let open = false;
  export let label: (key: string, fallback: string) => string;
  export let playlists: PracticePlaylist[] = [];
  export let controller: any;
  export let onSave: (playlist: PracticePlaylist) => Promise<void>;
  export let onDelete: (playlistId: string) => Promise<void>;
  export let onClose: () => void;

  const ALL_ROWS = "__all__";
  const NEW_PLAYLIST = "__new__";

  const unresolvedFallbacks: Record<PlaylistUnresolvedReason, string> = {
    "unbound-row": "Row points at a database row without a bound block",
    "not-indexed": "Target document is not indexed in the question bank",
    "doc-unavailable": "Document could not be loaded",
    "unsupported-block": "Target block is not a question, topic heading, or document",
  };

  let editingId = "";
  let name = "";
  let pointAvId = "";
  let pointAvName = "";
  let searchKeyword = "";
  let searched = false;
  let searchResults: PlaylistAttributeViewResult[] = [];
  let searching = false;
  let meta: PlaylistAttributeViewMeta | undefined = undefined;
  let relationKeyIds: string[] = [];
  let viewSelection = ALL_ROWS;
  let includeSubdocuments = false;
  let preview: PlaylistResolution | undefined = undefined;
  let previewing = false;
  let message = "";

  // Reload the draft each time the dialog opens; reopening keeps editing the
  // last saved/edited playlist, the very first open starts a new draft.
  let wasOpen = false;
  $: if (open && !wasOpen) {
    wasOpen = true;
    loadDraft(playlists.find((item) => item.playlist_id === editingId));
  }
  $: if (!open) wasOpen = false;

  // Both relation columns and the primary/bind column are valid scan sources:
  // relation columns point at rows of another database, the primary column
  // points at the blocks bound to the rows of the point database itself.
  $: sourceKeys = meta?.keys.filter((key) => key.type === "relation" || key.type === "block") ?? [];
  $: canSave = Boolean(name.trim()) && Boolean(pointAvId) && relationKeyIds.length > 0;
  $: editingTriggerText = editingId
    ? playlists.find((item) => item.playlist_id === editingId)?.name ?? editingId
    : label("playlist.newPlaylist", "New playlist");
  $: viewTriggerText = viewSelection === ALL_ROWS
    ? label("playlist.allRows", "All rows")
    : meta?.views.find((view) => view.id === viewSelection)?.name || viewSelection;

  function loadDraft(playlist: PracticePlaylist | undefined): void {
    editingId = playlist?.playlist_id ?? "";
    name = playlist?.name ?? "";
    pointAvId = playlist?.point_av_id ?? "";
    pointAvName = "";
    searchKeyword = "";
    searched = false;
    searchResults = [];
    relationKeyIds = playlist?.relation_key_ids ? [...playlist.relation_key_ids] : [];
    viewSelection = playlist?.view_id ?? ALL_ROWS;
    includeSubdocuments = playlist?.include_subdocuments ?? false;
    preview = undefined;
    previewing = false;
    message = "";
    void refreshMeta();
  }

  function selectExisting(value: string): void {
    const playlist = value === NEW_PLAYLIST
      ? undefined
      : playlists.find((item) => item.playlist_id === value);
    loadDraft(playlist);
  }

  async function refreshMeta(): Promise<void> {
    meta = undefined;
    if (!pointAvId) return;
    try {
      const next = await controller?.loadPlaylistAttributeViewMeta?.(pointAvId);
      if (pointAvId && next) {
        meta = next;
        if (next.name) pointAvName = next.name;
      }
    } catch {
      meta = undefined;
    }
  }

  async function search(): Promise<void> {
    searching = true;
    message = "";
    // A pasted block id or database id bypasses the keyword search entirely.
    let directHit = false;
    try {
      const keyword = searchKeyword.trim();
      const direct = await controller?.resolvePlaylistDatabaseRef?.(keyword);
      if (direct) {
        directHit = true;
        chooseDatabase(direct);
        return;
      }
      searchResults = (await controller?.searchPlaylistAttributeViews?.(keyword)) ?? [];
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    } finally {
      searched = !directHit;
      searching = false;
    }
  }

  function chooseDatabase(result: PlaylistAttributeViewResult): void {
    pointAvId = result.avId;
    pointAvName = result.avName;
    viewSelection = ALL_ROWS;
    relationKeyIds = [];
    searchKeyword = "";
    searched = false;
    searchResults = [];
    meta = undefined;
    preview = undefined;
    // Default the playlist name to the database name until the user types one.
    if (!name.trim() && result.avName) name = result.avName;
    void refreshMeta();
  }

  function clearDatabase(): void {
    pointAvId = "";
    pointAvName = "";
    viewSelection = ALL_ROWS;
    relationKeyIds = [];
    meta = undefined;
    preview = undefined;
  }

  function toggleRelationKey(keyId: string): void {
    preview = undefined;
    relationKeyIds = relationKeyIds.includes(keyId)
      ? relationKeyIds.filter((item) => item !== keyId)
      : [...relationKeyIds, keyId];
  }

  function draftPlaylist(): PracticePlaylist {
    const nowIso = new Date().toISOString();
    const existing = playlists.find((item) => item.playlist_id === editingId);
    return PracticePlaylistSchema.parse({
      schema_version: 1,
      playlist_id: editingId || crypto.randomUUID(),
      revision: existing ? existing.revision + 1 : 1,
      name: name.trim(),
      point_av_id: pointAvId,
      ...(viewSelection === ALL_ROWS ? {} : { view_id: viewSelection }),
      relation_key_ids: [...relationKeyIds],
      include_subdocuments: includeSubdocuments,
      created_at: existing?.created_at ?? nowIso,
      updated_at: nowIso,
    });
  }

  async function runPreview(): Promise<void> {
    if (!canSave) return;
    previewing = true;
    message = "";
    try {
      // Preview skips question hydration; the practice session resolves fully.
      preview = controller?.previewPlaylist
        ? await controller.previewPlaylist(draftPlaylist())
        : await controller?.resolvePlaylist?.(draftPlaylist());
    } catch (cause) {
      preview = undefined;
      message = cause instanceof Error ? cause.message : String(cause);
    } finally {
      previewing = false;
    }
  }

  const PREVIEW_QUESTION_LIMIT = 8;
  const PREVIEW_UNRESOLVED_LIMIT = 30;

  function rowTitleOf(rowItemId: string | undefined): string {
    if (!rowItemId) return "";
    return preview?.rows.find((row) => row.rowItemId === rowItemId)?.title || rowItemId;
  }

  function keyNameOf(keyId: string | undefined): string {
    if (!keyId) return "";
    for (const row of preview?.rows ?? []) {
      const column = row.columns.find((entry) => entry.keyId === keyId);
      if (column) return column.keyName || keyId;
    }
    return keyId;
  }

  async function save(): Promise<void> {
    if (!canSave) return;
    message = "";
    try {
      const draft = draftPlaylist();
      await onSave(draft);
      editingId = draft.playlist_id;
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function remove(): Promise<void> {
    if (!editingId) return;
    if (!window.confirm(label("playlist.deleteConfirm", "Delete this playlist?"))) return;
    try {
      await onDelete(editingId);
      loadDraft(undefined);
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    }
  }
</script>

{#if open}
  <div class="playlist-modal-scrim" onclick={onClose} aria-hidden="true"></div>
  <div class="playlist-modal" role="dialog" aria-labelledby="playlist-modal-title" aria-modal="true" data-testid="playlist-modal">
    <header class="playlist-modal-header">
      <div class="playlist-modal-title" id="playlist-modal-title">
        <ListChecks size={17} aria-hidden="true" />
        <strong>{label("playlist.managerTitle", "Playlist manager")}</strong>
      </div>
      <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onClose} aria-label={label("close", "Close")}>
        <X size={15} aria-hidden="true" />
      </Button>
    </header>

    <div class="playlist-modal-body">
      {#if playlists.length > 0}
        <span class="playlist-field-label">{label("playlist.editExisting", "Edit existing")}</span>
        <Select.Root type="single" value={editingId || NEW_PLAYLIST} onValueChange={(value) => { if (value) selectExisting(value); }}>
          <Select.Trigger class="w-full">{editingTriggerText}</Select.Trigger>
          <Select.Content>
            <Select.Item value={NEW_PLAYLIST} label={label("playlist.newPlaylist", "New playlist")} />
            {#each playlists as playlist (playlist.playlist_id)}
              <Select.Item value={playlist.playlist_id} label={playlist.name} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}

      <label class="playlist-field-label" for="playlist-name-input">{label("playlist.name", "Name")}</label>
      <Input id="playlist-name-input" bind:value={name} placeholder={label("playlist.namePlaceholder", "Playlist name")} data-testid="playlist-name-input" />

      <div class="playlist-section">
        <span class="playlist-field-label"><Database size={12} aria-hidden="true" />{label("playlist.pointDatabase", "Point database")}</span>
        {#if pointAvId}
          <div class="playlist-selected-db" data-testid="playlist-selected-db">
            <span>{pointAvName || pointAvId}</span>
            <Button variant="ghost" size="sm" onclick={clearDatabase}>
              <Pencil size={12} aria-hidden="true" />
              <span>{label("playlist.changeDatabase", "Change")}</span>
            </Button>
          </div>
        {/if}
        <div class="playlist-db-search">
          <Input
            bind:value={searchKeyword}
            placeholder={label("playlist.searchPlaceholder", "Search databases by keyword, block ID, or database ID")}
            data-testid="playlist-db-search-input"
          />
          <Button variant="outline" size="sm" disabled={searching} onclick={search} data-testid="playlist-db-search">
            <Search size={13} aria-hidden="true" />
            <span>{label("playlist.search", "Search")}</span>
          </Button>
        </div>
        {#if searchResults.length > 0}
          <div class="playlist-db-results" data-testid="playlist-db-results">
            {#each searchResults as result (result.avId)}
              <button type="button" class="playlist-db-result" onclick={() => chooseDatabase(result)} data-testid="playlist-db-result">
                <span>{result.avName || result.avId}</span>
                <small>{result.hPath}</small>
              </button>
            {/each}
          </div>
        {:else if searched && !searching}
          <p class="playlist-hint">{label("playlist.noResults", "No databases found")}</p>
        {/if}
      </div>

      <div class="playlist-section">
        <span class="playlist-field-label">{label("playlist.sourceKeys", "Fields to follow")}</span>
        {#if !pointAvId}
          <p class="playlist-hint">{label("playlist.selectDatabaseFirst", "Choose a point database first")}</p>
        {:else if !meta}
          <p class="playlist-hint">{label("playlist.loadingMeta", "Loading database fields...")}</p>
        {:else if sourceKeys.length === 0}
          <p class="playlist-hint">{label("playlist.noSourceKeys", "This database has no relation or bind fields")}</p>
        {:else}
          <div class="playlist-relation-chips" data-testid="playlist-relation-chips">
            {#each sourceKeys as key (key.id)}
              <button
                type="button"
                class="relation-chip"
                class:active={relationKeyIds.includes(key.id)}
                data-testid="playlist-relation-chip"
                onclick={() => toggleRelationKey(key.id)}
              >
                {#if relationKeyIds.includes(key.id)}<Check size={12} aria-hidden="true" />{/if}
                <span>{key.name || key.id}</span>
                <small data-testid="playlist-key-kind">
                  {key.type === "block"
                    ? label("playlist.keyPrimary", "primary/bind")
                    : label("playlist.keyRelation", "relation")}
                </small>
              </button>
            {/each}
          </div>
          <p class="playlist-hint">{label("playlist.sourceKeysHint", "Only the selected fields are merged into the practice set")}</p>
        {/if}
      </div>

      {#if meta && meta.views.length > 0}
        <span class="playlist-field-label">{label("playlist.view", "View filter")}</span>
        <Select.Root type="single" value={viewSelection} onValueChange={(value) => { if (value) { viewSelection = value; preview = undefined; } }}>
          <Select.Trigger class="w-full">{viewTriggerText}</Select.Trigger>
          <Select.Content>
            <Select.Item value={ALL_ROWS} label={label("playlist.allRows", "All rows")} />
            {#each meta.views as view (view.id)}
              <Select.Item value={view.id} label={view.name || view.id} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}

      <label class="playlist-subdoc" for="playlist-subdoc-toggle">
        <Checkbox
          id="playlist-subdoc-toggle"
          checked={includeSubdocuments}
          onCheckedChange={(checked) => { includeSubdocuments = checked === true; preview = undefined; }}
        />
        <span>{label("playlist.includeSubdocuments", "Include child documents")}</span>
      </label>

      <div class="playlist-section">
        <div class="playlist-preview-heading">
          <Button variant="outline" size="sm" disabled={!canSave || previewing} onclick={runPreview} data-testid="playlist-preview">
            {previewing ? label("playlist.previewing", "Resolving...") : label("playlist.preview", "Resolve preview")}
          </Button>
          {#if preview}
            <span class="playlist-preview-total" data-testid="playlist-preview-total">
              {preview.questionIds.length} {label("questions", "questions")}
            </span>
          {/if}
        </div>
        {#if preview}
          <div class="playlist-preview-rows">
            {#each preview.rows as row (row.rowItemId)}
              <details class="playlist-preview-row" data-testid="playlist-preview-row">
                <summary>
                  <span>{row.title || row.rowItemId}</span>
                  <small>{row.totalQuestions}</small>
                </summary>
                <div class="playlist-preview-detail">
                  {#each row.columns as column (column.keyId)}
                    <div class="playlist-preview-column" data-testid="playlist-preview-column">
                      <div class="playlist-preview-column-name">
                        <span>{column.keyName || column.keyId}</span>
                        <small>
                          {column.kind === "primary"
                            ? label("playlist.keyPrimary", "primary/bind")
                            : label("playlist.keyRelation", "relation")}
                        </small>
                      </div>
                      {#each column.blocks as block (block.blockId)}
                        <div class="playlist-preview-block" class:unbound={block.unbound} data-testid="playlist-preview-block">
                          <div class="playlist-preview-block-line">
                            <code>{block.blockId}</code>
                            {#if block.unbound}
                              <small>{label(`playlist.unresolved.${block.unbound}`, unresolvedFallbacks[block.unbound])}</small>
                            {:else}
                              <small>{block.questionCount}</small>
                            {/if}
                          </div>
                          {#if block.questionIds.length > 0}
                            <div class="playlist-preview-questions">
                              {#each block.questionIds.slice(0, PREVIEW_QUESTION_LIMIT) as questionId (questionId)}
                                <code>{questionId}</code>
                              {/each}
                              {#if block.questionIds.length > PREVIEW_QUESTION_LIMIT}
                                <small>+{block.questionIds.length - PREVIEW_QUESTION_LIMIT}</small>
                              {/if}
                            </div>
                          {/if}
                        </div>
                      {/each}
                      {#if column.unboundCount > 0}
                        <div class="playlist-preview-unbound-line">
                          {label("playlist.unboundTargets", "{n} unbound relation targets")
                            .replace("{n}", String(column.unboundCount))}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </details>
            {/each}
          </div>
          {#if preview.unresolved.length > 0}
            <div class="playlist-preview-unresolved" data-testid="playlist-preview-unresolved">
              <strong>{label("playlist.unresolvedTitle", "Unresolved")} ({preview.unresolved.length})</strong>
              {#each preview.unresolved.slice(0, PREVIEW_UNRESOLVED_LIMIT) as item (item.reason + ":" + item.blockId + ":" + (item.rowItemId ?? "") + ":" + (item.keyId ?? ""))}
                <div class="playlist-preview-unresolved-row">
                  <span>{item.blockId}</span>
                  <small>
                    {rowTitleOf(item.rowItemId)}
                    {#if item.keyId}<span> · {keyNameOf(item.keyId)}</span>{/if}
                    <span> · {label(`playlist.unresolved.${item.reason}`, unresolvedFallbacks[item.reason])}</span>
                  </small>
                </div>
              {/each}
              {#if preview.unresolved.length > PREVIEW_UNRESOLVED_LIMIT}
                <div class="playlist-preview-unresolved-row">
                  <small>+{preview.unresolved.length - PREVIEW_UNRESOLVED_LIMIT}</small>
                </div>
              {/if}
            </div>
          {/if}
        {/if}
      </div>

      {#if message}
        <div class="playlist-message" role="alert" data-testid="playlist-message">{message}</div>
      {/if}
    </div>

    <footer class="playlist-modal-footer">
      <div>
        {#if editingId}
          <Button variant="destructive" size="sm" class="gap-1.5" onclick={remove} data-testid="playlist-delete">
            <Trash2 size={14} aria-hidden="true" />
            <span>{label("playlist.delete", "Delete")}</span>
          </Button>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={onClose}>{label("cancel", "Cancel")}</Button>
        <Button size="sm" disabled={!canSave} onclick={save} data-testid="playlist-save">{label("save", "Save")}</Button>
      </div>
    </footer>
  </div>
{/if}

<style>
  .playlist-modal-scrim {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }

  .playlist-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(94vw, 560px);
    max-height: 88vh;
    z-index: 9999;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .playlist-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .playlist-modal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--b3-theme-primary);
  }

  .playlist-modal-body {
    padding: 16px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .playlist-field-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--b3-theme-on-surface);
  }

  .playlist-field-label :global(svg) {
    color: var(--b3-theme-primary);
  }

  .playlist-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .playlist-db-search {
    display: flex;
    gap: 8px;
  }

  .playlist-db-search :global(input) {
    min-width: 0;
    flex: 1;
  }

  .playlist-db-results {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 180px;
    overflow-y: auto;
  }

  .playlist-db-result {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 7px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .playlist-db-result:hover {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, var(--b3-theme-surface));
  }

  .playlist-db-result small {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    opacity: 0.75;
  }

  .playlist-selected-db {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 34%, var(--b3-border-color));
    border-radius: 7px;
    background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-surface));
    font-size: 12px;
  }

  .playlist-selected-db span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .playlist-relation-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .relation-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .relation-chip small {
    padding-left: 2px;
    font-size: 10px;
    font-weight: 400;
    opacity: 0.7;
  }

  .relation-chip:hover {
    border-color: var(--b3-theme-primary);
  }

  .relation-chip.active {
    border-color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 18%, var(--b3-theme-surface));
    color: var(--b3-theme-primary);
    font-weight: 600;
  }

  .playlist-hint {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    opacity: 0.8;
  }

  .playlist-subdoc {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
  }

  .playlist-preview-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .playlist-preview-total {
    font-size: 12px;
    font-weight: 700;
    color: var(--b3-theme-primary);
    font-variant-numeric: tabular-nums;
  }

  .playlist-preview-rows {
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 190px;
    overflow-y: auto;
  }

  .playlist-preview-row {
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-surface);
    font-size: 12px;
  }

  .playlist-preview-row > summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 9px;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }

  .playlist-preview-row > summary::-webkit-details-marker {
    display: none;
  }

  .playlist-preview-row > summary::before {
    content: "▸";
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
  }

  .playlist-preview-row[open] > summary::before {
    content: "▾";
  }

  .playlist-preview-row > summary span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .playlist-preview-row > summary small {
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface);
    font-variant-numeric: tabular-nums;
  }

  .playlist-preview-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 9px 8px 20px;
  }

  .playlist-preview-column {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color) 70%, transparent);
    border-radius: 5px;
  }

  .playlist-preview-column-name {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-weight: 600;
  }

  .playlist-preview-column-name small {
    font-weight: 400;
    opacity: 0.7;
  }

  .playlist-preview-block {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .playlist-preview-block.unbound code {
    opacity: 0.6;
    text-decoration: line-through;
  }

  .playlist-preview-block-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .playlist-preview-block-line code {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    opacity: 0.85;
  }

  .playlist-preview-block-line small {
    flex: 0 0 auto;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }

  .playlist-preview-questions {
    display: flex;
    flex-wrap: wrap;
    gap: 3px 6px;
    padding-left: 10px;
  }

  .playlist-preview-questions code {
    font-size: 10.5px;
    opacity: 0.65;
  }

  .playlist-preview-questions small {
    opacity: 0.6;
  }

  .playlist-preview-unbound-line {
    font-size: 11px;
    opacity: 0.75;
  }

  .playlist-preview-unresolved {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-warning) 40%, var(--b3-border-color));
    border-radius: 7px;
    background: color-mix(in srgb, var(--b3-theme-warning) 8%, transparent);
    font-size: 12px;
  }

  .playlist-preview-unresolved strong {
    font-size: 11.5px;
  }

  .playlist-preview-unresolved-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .playlist-preview-unresolved-row span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .playlist-preview-unresolved-row small {
    flex: 0 0 auto;
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.85;
  }

  .playlist-message {
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-error) 42%, var(--b3-border-color));
    border-radius: 7px;
    background: color-mix(in srgb, var(--b3-theme-error) 9%, transparent);
    color: var(--b3-theme-error);
    font-size: 12px;
    word-break: break-all;
  }

  .playlist-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 60%, transparent);
  }
</style>


