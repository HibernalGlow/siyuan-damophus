<script lang="ts">
  import { onMount } from "svelte";
  import { Check, Copy, Download, History, Info, RefreshCw, Trash2, X, XCircle } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { clearCoverHistory, getCoverHistory, removeCoverHistoryEntry } from "../cover-history";
  import { buildCoverExportPayload } from "../cover-export";
  import type { CoverHistoryEntry } from "../sources";

  export let label: (key: string, fallback: string) => string;

  let coverHistory: CoverHistoryEntry[] = [];
  let exportOpen = false;
  let exportContent = "";
  let exportCopied = false;
  let exportBusy = false;
  let exportError = "";
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let infoOpen = false;

  function reload() {
    coverHistory = getCoverHistory();
  }

  function removeEntry(id: string) {
    coverHistory = removeCoverHistoryEntry(id);
  }

  function clearAll() {
    clearCoverHistory();
    coverHistory = [];
  }

  async function openExport() {
    exportBusy = true;
    exportError = "";
    try {
      exportContent = JSON.stringify(await buildCoverExportPayload(), null, 2);
      exportCopied = false;
      exportOpen = true;
    } catch (e: any) {
      exportError = e?.message || String(e);
      exportOpen = true;
    } finally {
      exportBusy = false;
    }
  }

  async function copyExport() {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportContent);
    }
    exportCopied = true;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => (exportCopied = false), 2000);
  }

  function downloadExport() {
    const blob = new Blob([exportContent], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `damophus-more-background-covers-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  onMount(reload);
</script>

<div class="mb-stack">
  <section class="mb-section">
    <div class="mb-section-copy">
      <span class="mb-icon-chip" aria-hidden="true"><History class="size-4" /></span>
      <div class="min-w-0">
        <div class="mb-section-title">
          <span class="mb-truncate">{label("lets-more-background.coverHistory", "题头图历史")}</span>
          <span class="mb-count-badge">{coverHistory.length}</span>
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
          <p class="mb-section-desc">{label("lets-more-background.coverHistoryDescription", "最近使用的题头图")}</p>
        {/if}
      </div>
    </div>
    <div class="mb-section-actions">
      <Button variant="outline" size="sm" class="gap-1.5" onclick={reload}>
        <RefreshCw class="size-3.5" />
        <span>{label("lets-more-background.refreshFavorites", "刷新")}</span>
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" onclick={openExport} disabled={exportBusy}>
        <Download class="size-3.5 {exportBusy ? 'animate-spin' : ''}" />
        <span>{label("lets-more-background.exportCoverJson", "导出 JSON")}</span>
      </Button>
      {#if coverHistory.length > 0}
        <Button variant="outline" size="sm" class="gap-1.5 text-destructive hover:text-destructive" onclick={clearAll}>
          <Trash2 class="size-3.5" />
          <span>{label("lets-more-background.clearCoverHistory", "清空历史")}</span>
        </Button>
      {/if}
    </div>
  </section>

  {#if coverHistory.length === 0}
    <div class="mb-empty">
      <History class="size-7" />
      <p class="m-0">{label("lets-more-background.emptyCoverHistory", "暂无题头图历史记录。")}</p>
    </div>
  {:else}
    <div class="entry-grid">
      {#each coverHistory as entry (entry.id)}
        <article class="mb-card entry-card">
          <div class="entry-thumb">
            <img src={entry.imageUrl} alt={entry.docTitle || label("lets-more-background.coverHistory", "题头图历史")} loading="lazy" referrerpolicy="no-referrer" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="mb-card-name">{entry.docTitle || label("lets-more-background.currentDocument", "当前文档")}</div>
              <Button
                variant="ghost"
                size="icon-sm"
                class="size-7 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onclick={() => removeEntry(entry.id)}
                title={label("lets-more-background.removeCoverHistory", "删除")}
                aria-label={label("lets-more-background.removeCoverHistory", "删除")}
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
            <div class="mb-meta-row mt-1.5">
              {#if entry.site}<span class="mb-site-pill">{entry.site}</span>{/if}
              {#if entry.postId}<span class="mb-mono">#{entry.postId}</span>{/if}
              <span>{new Date(entry.appliedAt).toLocaleString()}</span>
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

{#if exportOpen}
  <div class="mb-modal" role="dialog" aria-modal="true">
    <div class="mb-modal-panel">
      <header class="mb-modal-header">
        <span class="mb-modal-title">
          <span class="mb-icon-chip"><Download class="size-4" /></span>
          <span class="mb-truncate">{label("lets-more-background.exportCoverJsonTitle", "导出题头图历史与当前题头图")}</span>
        </span>
        <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" onclick={() => (exportOpen = false)} aria-label={label("lets-more-background.cancel", "取消")}>
          <X class="size-4" />
        </Button>
      </header>
      <div class="mb-modal-note">
        {label("lets-more-background.exportCoverJsonDescription", "导出内容包含题头图历史、去重记忆和所有文档当前正在使用的题头图，可用于备份或迁移。")}
      </div>
      <div class="mb-modal-body">
        {#if exportError}
          <div class="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
            <XCircle class="size-4 shrink-0" />
            <span>{label("lets-more-background.exportCoverJsonFailed", "导出题头图数据失败")}: {exportError}</span>
          </div>
        {:else}
          <textarea readonly value={exportContent} class="export-textarea" aria-label={label("lets-more-background.exportCoverJsonTitle", "导出题头图历史与当前题头图")}></textarea>
        {/if}
      </div>
      <footer class="mb-modal-footer">
        <Button variant="ghost" size="sm" onclick={() => (exportOpen = false)}>
          {label("lets-more-background.cancel", "取消")}
        </Button>
        <div class="mb-modal-footer-actions">
          {#if !exportError}
            <Button variant="outline" size="sm" class="gap-1.5" onclick={downloadExport}>
              <Download class="size-3.5" />
              <span>{label("lets-more-background.downloadJsonFile", "下载 JSON 文件")}</span>
            </Button>
            <Button variant="secondary" size="sm" class="gap-1.5 font-medium" onclick={copyExport}>
              {#if exportCopied}
                <Check class="size-3.5 text-emerald-500" />
                <span class="text-emerald-500">{label("lets-more-background.copiedToClipboard", "已复制")}</span>
              {:else}
                <Copy class="size-3.5" />
                <span>{label("lets-more-background.copyJson", "复制 JSON")}</span>
              {/if}
            </Button>
          {/if}
        </div>
      </footer>
    </div>
  </div>
{/if}

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

  .export-textarea {
    width: 100%;
    height: 288px;
    padding: 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-background);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.6;
    resize: vertical;
  }

  .export-textarea:focus-visible {
    outline: 2px solid var(--b3-theme-primary);
    outline-offset: 1px;
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
