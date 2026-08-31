<script lang="ts">
  import { onMount } from "svelte";
  import { Globe, Info, RefreshCw, Star, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import {
    loadCoverFavorites,
    removeCoverFavorite,
    updateCoverFavorite,
    type CoverFavorite,
  } from "../cover-favorites";
  import { supportsCoverFavoriteSync, syncCoverFavoriteToSite } from "../cover-favorite-sync";
  import type { SiteCredential } from "../sources";

  export let label: (key: string, fallback: string) => string;
  export let siteCredentials: SiteCredential[] = [];

  let favorites: CoverFavorite[] = [];
  let favoritesLoading = false;
  let syncingFavoriteId: string | null = null;
  let infoOpen = false;

  async function reload() {
    favoritesLoading = true;
    try {
      favorites = await loadCoverFavorites();
    } finally {
      favoritesLoading = false;
    }
  }

  async function removeFavorite(id: string) {
    favorites = await removeCoverFavorite(id);
  }

  async function setRating(favorite: CoverFavorite, value: string) {
    const updated = await updateCoverFavorite(favorite.id, { rating: Number(value) || 0 });
    if (updated) favorites = favorites.map((item) => (item.id === favorite.id ? updated : item));
  }

  async function syncFavorite(favorite: CoverFavorite, desired: boolean) {
    if (syncingFavoriteId) return;
    syncingFavoriteId = favorite.id;
    try {
      const credential = siteCredentials.find(
        (item) => item.site.trim().toLowerCase() === (favorite.site || "").trim().toLowerCase(),
      );
      const result = await syncCoverFavoriteToSite(favorite, credential, desired);
      const updated = await updateCoverFavorite(favorite.id, {
        remoteSync: result.status,
        remoteSyncMessage: result.message,
      });
      if (updated) favorites = favorites.map((item) => (item.id === favorite.id ? updated : item));
    } finally {
      syncingFavoriteId = null;
    }
  }

  onMount(() => {
    const handleFavoritesChanged = () => void reload();
    window.addEventListener("damophus-cover-favorites-changed", handleFavoritesChanged);
    void reload();
    return () => window.removeEventListener("damophus-cover-favorites-changed", handleFavoritesChanged);
  });
</script>

<div class="mb-stack">
  <section class="mb-section">
    <div class="mb-section-copy">
      <span class="mb-icon-chip" aria-hidden="true"><Star class="size-4" /></span>
      <div class="min-w-0">
        <div class="mb-section-title">
          <span class="mb-truncate">{label("lets-more-background.favoritesTitle", "题头图收藏")}</span>
          <span class="mb-count-badge">{favorites.length}</span>
          <button
            type="button"
            class="mb-info-btn"
            class:open={infoOpen}
            aria-expanded={infoOpen}
            title={label("lets-more-background.toggleSectionInfo", "展开或收起说明")}
            aria-label={label("lets-more-background.toggleSectionInfo", "展开或收起说明")}
            onclick={() => (infoOpen = !infoOpen)}
          >
            <Info class="size-3" />
          </button>
        </div>
        {#if infoOpen}
          <p class="mb-section-desc">
            {label("lets-more-background.favoritesDescription", "收藏独立保存于工作区文件，不占用设置项；每条记录包含网址、原帖、文档和本地缓存信息。")}
          </p>
        {/if}
      </div>
    </div>
    <div class="mb-section-actions">
      <Button variant="outline" size="sm" class="gap-1.5" onclick={reload} disabled={favoritesLoading}>
        <RefreshCw class="size-3.5 {favoritesLoading ? 'animate-spin' : ''}" />
        <span>{label("lets-more-background.refreshFavorites", "刷新")}</span>
      </Button>
    </div>
  </section>

  {#if favoritesLoading && favorites.length === 0}
    <div class="mb-empty">{label("lets-more-background.loadingFavorites", "正在读取收藏...")}</div>
  {:else if favorites.length === 0}
    <div class="mb-empty">
      <Star class="size-7" />
      <p class="m-0">{label("lets-more-background.emptyFavorites", "还没有收藏题头图。在题头图工具条点击星标即可保存。")}</p>
    </div>
  {:else}
    <div class="entry-grid">
      {#each favorites as favorite (favorite.id)}
        <article class="mb-card entry-card">
          <div class="entry-thumb">
            <img src={favorite.imageUrl || favorite.cachePath} alt={favorite.documentTitle || label("lets-more-background.favoritesTitle", "题头图收藏")} loading="lazy" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="mb-card-name">{favorite.documentTitle || label("lets-more-background.untitledDocument", "未命名文档")}</div>
                {#if favorite.documentPath}
                  <div class="mb-card-sub">{favorite.documentPath}</div>
                {/if}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                class="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onclick={() => removeFavorite(favorite.id)}
                title={label("lets-more-background.unfavorite", "取消收藏")}
                aria-label={label("lets-more-background.unfavorite", "取消收藏")}
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
            <div class="mb-meta-row mt-1.5">
              {#if favorite.site}<span class="mb-site-pill">{favorite.site}</span>{/if}
              {#if favorite.postId}<span class="mb-mono">#{favorite.postId}</span>{/if}
              {#if favorite.cachePath}<span class="mb-truncate" title={favorite.cachePath}>{label("lets-more-background.cacheRecorded", "本地缓存已记录")}</span>{/if}
            </div>
            <div class="mb-meta-row mt-2">
              <label class="rating-label">
                <Star class="size-3.5 text-amber-500" aria-hidden="true" />
                <span>{label("lets-more-background.favoriteRating", "评分")}</span>
                <select
                  value={favorite.rating}
                  onchange={(e) => setRating(favorite, (e.currentTarget as HTMLSelectElement).value)}
                  class="rating-select"
                  aria-label={label("lets-more-background.favoriteRating", "评分")}
                >
                  <option value="0">{label("lets-more-background.unrated", "未评分")}</option>
                  {#each [1, 2, 3, 4, 5] as score}
                    <option value={score}>{score} / 5</option>
                  {/each}
                </select>
              </label>
              {#if favorite.postUrl}
                <a href={favorite.postUrl} target="_blank" rel="noopener noreferrer" class="post-link">{label("lets-more-background.openPost", "打开原帖")}</a>
              {/if}
              {#if favorite.site && favorite.postId && supportsCoverFavoriteSync(favorite.site)}
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-1 text-[11px]"
                  disabled={syncingFavoriteId === favorite.id}
                  onclick={() => syncFavorite(favorite, favorite.remoteSync !== "synced")}
                  title={label("lets-more-background.syncFavoriteHint", "对支持的站点同步收藏状态")}
                >
                  <Globe class="size-3" />
                  <span>{syncingFavoriteId === favorite.id
                    ? label("lets-more-background.syncing", "同步中...")
                    : favorite.remoteSync === "synced"
                      ? label("lets-more-background.unsyncSite", "取消站点收藏")
                      : label("lets-more-background.syncSite", "同步站点收藏")}</span>
                </Button>
              {/if}
              {#if favorite.site && !supportsCoverFavoriteSync(favorite.site)}
                <span class="text-[10px] text-muted-foreground">{label("lets-more-background.localOnlyFavorite", "仅本地收藏")}</span>
              {/if}
            </div>
            {#if favorite.remoteSyncMessage}
              <div class="mb-truncate mt-1.5 text-[10px] text-muted-foreground" title={favorite.remoteSyncMessage}>
                {label("lets-more-background.siteSyncPrefix", "站点同步")}：{favorite.remoteSyncMessage}
              </div>
            {/if}
            <div class="mb-truncate mt-1 text-[10px] text-muted-foreground/75" title={favorite.imageUrl}>{favorite.imageUrl}</div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .entry-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .entry-card {
    display: flex;
    gap: 12px;
    padding: 10px;
  }

  .entry-thumb {
    width: 128px;
    aspect-ratio: 1 / 1;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: color-mix(in srgb, var(--b3-theme-surface) 55%, var(--b3-theme-background));
  }

  .entry-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .rating-label {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .rating-select {
    min-height: 26px;
    padding: 1px 6px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-background);
    font-size: 11.5px;
  }

  .post-link {
    overflow: hidden;
    max-width: 240px;
    color: var(--b3-theme-primary);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .post-link:hover {
    text-decoration: underline;
  }

  @container mbframe (max-width: 560px) {
    .entry-card {
      flex-direction: column;
    }

    .entry-thumb {
      width: 100%;
      aspect-ratio: 16 / 9;
    }

    .entry-card :global(button) {
      min-height: 34px;
    }
  }

  @container mbframe (min-width: 900px) {
    .entry-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
