<script lang="ts">
  import { onMount } from "svelte";
  import { Info, RefreshCw, Sparkles, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { clearCoverStash, loadCoverStash, removeCoverStashEntry, type CoverStashEntry } from "../cover-gacha";

  export let label: (key: string, fallback: string) => string;

  let stash: CoverStashEntry[] = [];
  let infoOpen = false;

  async function reload() {
    stash = await loadCoverStash();
  }

  async function removeEntry(id: string) {
    stash = await removeCoverStashEntry(id);
  }

  async function clearAll() {
    await clearCoverStash();
    stash = [];
  }

  onMount(reload);
</script>

<div class="mb-stack">
  <section class="mb-section">
    <div class="mb-section-copy">
      <span class="mb-icon-chip" aria-hidden="true"><Sparkles class="size-4" /></span>
      <div class="min-w-0">
        <div class="mb-section-title">
          <span class="mb-truncate">{label("lets-more-background.stashTab", "抽卡暂存区")}</span>
          <span class="mb-count-badge">{stash.length}</span>
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
          <p class="mb-section-desc">{label("lets-more-background.stashDescription", "抽卡时点「暂存」（⚑）、但没被选为题头图的候选卡会进入暂存区；在文档题头图菜单点「从暂存区抽一张题头图」抽卡使用（弹窗二次确认）。")}</p>
        {/if}
      </div>
    </div>
    <div class="mb-section-actions">
      <Button variant="outline" size="sm" class="gap-1.5" onclick={reload}>
        <RefreshCw class="size-3.5" />
        <span>{label("lets-more-background.refreshFavorites", "刷新")}</span>
      </Button>
      {#if stash.length > 0}
        <Button variant="outline" size="sm" class="gap-1.5 text-destructive hover:text-destructive" onclick={clearAll}>
          <Trash2 class="size-3.5" />
          <span>{label("lets-more-background.clearStash", "清空暂存区")}</span>
        </Button>
      {/if}
    </div>
  </section>

  {#if stash.length === 0}
    <div class="mb-empty">
      <Sparkles class="size-7" />
      <p class="m-0">{label("lets-more-background.emptyStash", "暂存区还是空的。开启抽卡模式后使用模板抽卡，点击卡片上的「暂存」（⚑）按钮即可加到这里。")}</p>
    </div>
  {:else}
    <div class="entry-grid">
      {#each stash as entry (entry.id)}
        <article class="mb-card entry-card">
          <div class="entry-thumb">
            <img src={entry.previewUrl || entry.imageUrl} alt={entry.site ? `${entry.site} #${entry.postId ?? ""}` : label("lets-more-background.stashTab", "抽卡暂存区")} loading="lazy" referrerpolicy="no-referrer" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="mb-card-name">{entry.templateLabel || label("lets-more-background.poolFallbackName", "模板")}</div>
              <Button
                variant="ghost"
                size="icon-sm"
                class="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onclick={() => removeEntry(entry.id)}
                title={label("lets-more-background.removeStashEntry", "从暂存区移除")}
                aria-label={label("lets-more-background.removeStashEntry", "从暂存区移除")}
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
            <div class="mb-meta-row mt-1.5">
              {#if entry.site}<span class="mb-site-pill">{entry.site}</span>{/if}
              {#if entry.postId}<span class="mb-mono">#{entry.postId}</span>{/if}
              {#if entry.score !== undefined && entry.score !== ""}<span>★ {entry.score}</span>{/if}
              <span>{new Date(entry.addedAt).toLocaleString()}</span>
            </div>
            {#if entry.tags?.length}
              <div class="mb-truncate mt-1.5 text-[10px] text-muted-foreground" title={entry.tags.join(" ")}>{entry.tags.slice(0, 8).join(" ")}</div>
            {/if}
            <div class="mb-truncate mt-1 text-[10px] text-muted-foreground/75" title={entry.imageUrl}>{entry.imageUrl}</div>
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
    width: 112px;
    aspect-ratio: 16 / 9;
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

  @container mbframe (max-width: 560px) {
    .entry-card {
      flex-direction: column;
    }

    .entry-thumb {
      width: 100%;
    }
  }

  @container mbframe (min-width: 900px) {
    .entry-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
