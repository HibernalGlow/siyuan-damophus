<script lang="ts">
  import { FileText, Layers3, Pin, PinOff, Play, RefreshCw, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import * as TreeView from "@/components/ui/tree-view";
  import DocumentPathHighlightEditor from "@/components/DocumentPathHighlightEditor.svelte";
  import { documentPathMatchesHighlight } from "@/libs/document-path-highlights";
  import type { FlashcardGroup, FlashcardReviewHistoryItem, FlashcardReviewScope, FlashcardSettings } from "@/flashcard/types";
  import type { OpenFlashcardDocument } from "@/flashcard/open-documents";

  export let workbenchMode: "make" | "review";
  export let config: FlashcardSettings;
  export let history: FlashcardReviewHistoryItem[];
  export let readablePaths: Record<string, string>;
  export let openDocuments: OpenFlashcardDocument[];
  export let openDocumentsLoading: boolean;
  export let highlightPatterns: string[];
  export let documentHistory: FlashcardReviewHistoryItem[];
  export let applicationScopeGroups: Array<{ name: string; scopes: FlashcardReviewHistoryItem[] }>;
  export let documentTreeOpen: boolean;
  export let applicationTreeOpen: boolean;
  export let onDocumentTreeOpenChange: (open: boolean) => void;
  export let onApplicationTreeOpenChange: (open: boolean) => void;
  export let onLoadOpenDocuments: () => Promise<void>;
  export let onUpdateDocumentPathHighlights: (next: string[]) => void;
  export let onReviewOpenDocument: (document: OpenFlashcardDocument, group?: FlashcardGroup) => void;
  export let onOpenHistoryScope: (scope: FlashcardReviewScope) => void;
  export let onTogglePinned: (scope: FlashcardReviewScope & { pinned?: boolean }) => Promise<void>;
  export let onRemoveHistory: (scopeId: string) => Promise<void>;

  let localDocumentTreeOpen = documentTreeOpen;
  let localApplicationTreeOpen = applicationTreeOpen;
  $: localDocumentTreeOpen = documentTreeOpen;
  $: localApplicationTreeOpen = applicationTreeOpen;
  $: if (localDocumentTreeOpen !== documentTreeOpen) onDocumentTreeOpenChange(localDocumentTreeOpen);
  $: if (localApplicationTreeOpen !== applicationTreeOpen) onApplicationTreeOpenChange(localApplicationTreeOpen);

  function scopeBlockId(scope: FlashcardReviewScope): string {
    const candidate = `${scope.targetId ?? ""} ${scope.targetName} ${scope.id}`;
    return candidate.match(/\d{14}-[a-z0-9]{7}/u)?.[0] ?? "";
  }

  function displayScopeName(scope: FlashcardReviewScope, paths: Record<string, string>): string {
    const blockId = scopeBlockId(scope);
    return blockId ? paths[blockId] ?? "当前文档" : scope.targetName;
  }

  function fullLastUsed(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
      ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(timestamp))
      : "时间未知";
  }

  function formatLastUsed(timestamp: number, now = Date.now()): string {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "时间未知";
    const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    if (elapsedMinutes < 1) return "刚刚";
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours} 小时前`;
    const date = new Date(timestamp);
    const today = new Date(now);
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const time = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
    if (date >= yesterday && date < new Date(today.getFullYear(), today.getMonth(), today.getDate())) return `昨天 ${time}`;
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
</script>

<section class="open-documents-panel" data-testid="open-documents-panel">
  <div class="section-heading open-documents-heading">
    <div><h3>当前打开文档</h3><p>{workbenchMode === "make" ? "选择文档和分组检测闪卡并开始制卡" : "直接选择文档和分组开始专项复习"}</p></div>
    <Button variant="outline" size="sm" disabled={openDocumentsLoading} onclick={onLoadOpenDocuments} title="刷新当前打开文档" aria-label="刷新当前打开文档"><RefreshCw class={openDocumentsLoading ? "loading-icon" : ""} /><span>刷新</span></Button>
  </div>
  <DocumentPathHighlightEditor
    highlights={highlightPatterns}
    title="文档路径高亮"
    description="匹配文档可读路径的项目会高亮显示"
    placeholder="输入关键词后按回车"
    onChange={onUpdateDocumentPathHighlights}
  />
  {#if openDocuments.length}
    <div class="open-documents-list">
      {#each openDocuments as document (document.documentId)}
        <article class:open-document-active={document.active} class:open-document-highlighted={documentPathMatchesHighlight(document.path, highlightPatterns)} class="open-document-row">
          <div class="open-document-copy">
            <div class="open-document-title"><FileText /><strong>{document.title}</strong>{#if document.active}<Badge variant="secondary">当前</Badge>{/if}</div>
            <span class="open-document-path" title={document.documentId}>{document.path}</span>
          </div>
          <div class="open-document-actions">
            <Button variant="outline" size="sm" onclick={() => onReviewOpenDocument(document)} title={workbenchMode === "make" ? `检测 ${document.title} 的全部闪卡` : `复习 ${document.title} 的全部到期卡`} aria-label={workbenchMode === "make" ? `检测 ${document.title} 的全部闪卡` : `复习 ${document.title} 的全部到期卡`}><Play /><span>{workbenchMode === "make" ? "检测" : "全部"}</span></Button>
            {#each config.groups.filter((group) => group.enabled) as group (group.id)}
              <Button variant="ghost" size="sm" onclick={() => onReviewOpenDocument(document, group)} title={workbenchMode === "make" ? `检测 ${document.title} 的 ${group.name}` : `按 ${group.name} 复习 ${document.title}`} aria-label={workbenchMode === "make" ? `检测 ${document.title} 的 ${group.name}` : `按 ${group.name} 复习 ${document.title}`}><Layers3 /><span>{workbenchMode === "make" ? `检测 · ${group.name}` : group.name}</span></Button>
            {/each}
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <p class="empty">当前没有可识别的打开文档。</p>
  {/if}
</section>
<section class="recent-history-panel" data-testid="recent-history-panel">
  <div class="section-heading recent-history-heading">
    <div><h3>最近使用与置顶范围</h3><p>按置顶、使用次数和最近使用排序</p></div>
  </div>
  {#if history.length}
    <TreeView.Root class="scope-tree" aria-label="最近复习范围">
      {#if documentHistory.length}
        <TreeView.Folder name={`文档范围 (${documentHistory.length})`} bind:open={localDocumentTreeOpen} class="tree-branch">
          {#each documentHistory as scope (scope.id)}
            <article class="tree-leaf-row">
              <Button variant="ghost" size="icon-sm" title={scope.pinned ? "取消置顶" : "置顶"} aria-label={scope.pinned ? "取消置顶" : "置顶"} onclick={() => onTogglePinned(scope)}>{#if scope.pinned}<PinOff />{:else}<Pin />{/if}</Button>
              <TreeView.File class="tree-leaf" name={displayScopeName(scope, readablePaths)} title={`${displayScopeName(scope, readablePaths)}\n${fullLastUsed(scope.lastUsedAt)}`} onclick={() => onOpenHistoryScope(scope)} />
              <Badge variant="secondary" title={fullLastUsed(scope.lastUsedAt)}>{formatLastUsed(scope.lastUsedAt)} · {scope.useCount} 次</Badge>
              <Button variant="ghost" size="icon-sm" title="移除最近记录" aria-label="移除最近记录" onclick={() => onRemoveHistory(scope.id)}><Trash2 /></Button>
            </article>
          {/each}
        </TreeView.Folder>
      {/if}
      {#if applicationScopeGroups.length}
        <TreeView.Folder name={`应用分组 (${applicationScopeGroups.length})`} bind:open={localApplicationTreeOpen} class="tree-branch">
          {#each applicationScopeGroups as group (group.name)}
            <TreeView.Folder name={`${group.name} (${group.scopes.length})`} class="tree-subbranch">
              {#each group.scopes as scope (scope.id)}
                <article class="tree-leaf-row">
                  <Button variant="ghost" size="icon-sm" title={scope.pinned ? "取消置顶" : "置顶"} aria-label={scope.pinned ? "取消置顶" : "置顶"} onclick={() => onTogglePinned(scope)}>{#if scope.pinned}<PinOff />{:else}<Pin />{/if}</Button>
                  <TreeView.File class="tree-leaf" name={displayScopeName(scope, readablePaths)} title={`${displayScopeName(scope, readablePaths)}\n${fullLastUsed(scope.lastUsedAt)}`} onclick={() => onOpenHistoryScope(scope)} />
                  <Badge variant="secondary" title={fullLastUsed(scope.lastUsedAt)}>{formatLastUsed(scope.lastUsedAt)} · {scope.useCount} 次</Badge>
                  <Button variant="ghost" size="icon-sm" title="移除最近记录" aria-label="移除最近记录" onclick={() => onRemoveHistory(scope.id)}><Trash2 /></Button>
                </article>
              {/each}
            </TreeView.Folder>
          {/each}
        </TreeView.Folder>
      {/if}
    </TreeView.Root>
  {:else}<p class="empty">从插件菜单或 SQL 分组开始一次复习后，这里会显示最近范围。</p>{/if}
</section>

<style>
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px; }
  .section-heading > div:first-child { min-width: 0; }
  .section-heading p { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .open-documents-panel { position: relative; z-index: 1; display: flex; flex: 0 0 auto; flex-direction: column; gap: 8px; min-width: 0; padding: 10px 12px 12px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 26%, var(--border, var(--b3-border-color))); border-radius: 8px; background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 5%, var(--background, var(--b3-theme-background))); }
  .open-documents-panel::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 68%, transparent); opacity: .75; }
  .open-documents-heading { align-items: flex-start; min-height: 32px; }
  .open-documents-heading p { margin-top: 2px; }
  .open-documents-list { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .open-document-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 8px; border: 1px solid transparent; border-top-color: color-mix(in srgb, var(--border, var(--b3-border-color)) 75%, transparent); border-radius: 6px; }
  .open-document-row:first-child { border-top-color: transparent; }
  .open-document-row:hover { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 24%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 5%, transparent); }
  .open-document-row.open-document-active { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 30%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 9%, transparent); box-shadow: inset 3px 0 0 var(--primary, var(--b3-theme-primary)); }
  .open-document-row.open-document-highlighted { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 68%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 14%, transparent); box-shadow: inset 3px 0 0 var(--primary, var(--b3-theme-primary)); }
  .open-document-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1 1 260px; }
  .open-document-title { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .open-document-title :global(svg) { width: 15px; height: 15px; flex: 0 0 auto; color: var(--primary, var(--b3-theme-primary)); }
  .open-document-title strong, .open-document-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .open-document-title strong { font-size: 13px; }
  .open-document-path { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .open-document-actions { display: flex; align-items: center; justify-content: flex-end; gap: 5px; flex: 0 1 auto; flex-wrap: wrap; }
  .open-document-actions :global(button) { max-width: 180px; }
  .recent-history-panel { position: relative; z-index: 0; display: flex; flex: 0 0 auto; flex-direction: column; gap: 8px; min-width: 0; margin-top: 4px; padding: 12px 2px 16px; border-top: 2px solid color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 28%, var(--border, var(--b3-border-color))); }
  .recent-history-heading { min-height: 34px; padding-inline: 2px; }
  .tree-leaf-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto 28px; align-items: center; gap: 5px; min-width: 0; min-height: 42px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  :global(.tree-leaf) { min-width: 0; width: 100%; justify-content: flex-start; color: var(--foreground, var(--b3-theme-on-background)); text-align: left; }
  :global(.tree-leaf span) { min-width: 0; line-height: 1.45; overflow-wrap: anywhere; white-space: normal; }
  .tree-leaf-row > :global([data-slot="badge"]) { max-width: 145px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  :global(.scope-tree) { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  :global(.tree-branch), :global(.tree-subbranch) { width: 100%; min-height: 36px; padding: 6px 8px; border-radius: 6px; color: var(--foreground, var(--b3-theme-on-background)); font-size: 13px; font-weight: 600; }
  :global(.tree-branch:hover), :global(.tree-subbranch:hover) { background: var(--muted, var(--b3-list-hover)); }
  :global(.tree-subbranch) { min-height: 32px; font-size: 12px; }

  @container (max-width: 620px) {
    .tree-leaf-row { grid-template-columns: 28px minmax(0, 1fr) 28px; padding-block: 4px; }
    .tree-leaf-row > :global([data-slot="badge"]) { grid-column: 2; grid-row: 2; justify-self: start; max-width: 100%; }
    .tree-leaf-row > :global([data-slot="button"]:last-child) { grid-column: 3; grid-row: 1; }
    .open-documents-panel { padding: 8px 10px 10px; }
    .open-document-row { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 8px; }
    .open-document-copy { width: 100%; flex: 0 1 auto; }
    .open-document-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); width: 100%; justify-content: stretch; gap: 5px; }
    .open-document-actions :global(button) { width: 100%; max-width: none; min-width: 0; justify-content: flex-start; overflow: hidden; }
    .open-document-actions :global(button span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  }
</style>
