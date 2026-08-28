<script lang="ts">
  import { Archive, CalendarClock, Download, FileArchive, FileSpreadsheet, FileText, Filter, History, RefreshCw, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Badge } from "@/components/ui/badge";
  import * as Select from "@/components/ui/select";
  import { Switch } from "@/components/ui/switch";
  import type { ReviewLogArchive } from "@/flashcard/review-log-export";

  export let reviewLogArchive: ReviewLogArchive | undefined;
  export let reviewLogLoading: boolean;
  export let reviewLogContextLoading: boolean;
  export let reviewLogContextError: string;
  export let selectedReviewLogEntries: ReviewLogArchive["entries"];
  export let reviewLogDocuments: Array<{ id: string; label: string }>;
  export let filteredReviewLogDocuments: Array<{ id: string; label: string }>;
  export let reviewLogNotebooks: Array<{ id: string; label: string }>;
  export let reviewLogFrom: string;
  export let reviewLogTo: string;
  export let reviewLogNotebook: string;
  export let reviewLogDocument: string;
  export let reviewLogDocumentQuery: string;
  export let reviewLogIncludeSubdocuments: boolean;
  export let reviewLogState: string;
  export let onScanReviewLogs: () => Promise<ReviewLogArchive | undefined>;
  export let onExportMonthlyReviewLogs: () => Promise<void>;
  export let onExportMergedReviewLog: () => Promise<void>;
  export let onReviewLogFromChange: (value: string) => void;
  export let onReviewLogToChange: (value: string) => void;
  export let onReviewLogNotebookChange: (value: string) => void;
  export let onReviewLogDocumentQueryChange: (value: string) => void;
  export let onReviewLogDocumentQueryEnter: () => void;
  export let onOpenOfficialDocumentPicker: () => Promise<void>;
  export let onClearReviewLogDocument: () => void;
  export let onReviewLogDocumentSelect: (id: string, label: string) => void;
  export let onReviewLogIncludeSubdocumentsChange: (value: boolean) => void;
  export let onReviewLogStateChange: (value: string) => void;
  export let onResetReviewLogFilters: () => void;

  function formatReviewLogDate(timestamp: number | undefined): string {
    if (!timestamp) return "暂无记录";
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  }
</script>

<section class="review-log-header">
  <div class="review-log-heading" data-testid="review-log-heading">
    <span class="review-log-heading-icon"><Archive /></span>
    <div><h3>复习记录</h3><p>导出 FSRS 兼容数据，原记录保持不变</p></div>
  </div>
  <div class="review-log-actions">
    <Button variant="outline" size="sm" disabled={reviewLogLoading} onclick={onScanReviewLogs} title="扫描复习记录" aria-label="扫描复习记录"><RefreshCw /><span>扫描</span></Button>
    <Button variant="outline" size="sm" disabled={reviewLogLoading || !selectedReviewLogEntries.length} onclick={onExportMonthlyReviewLogs} title="按当前筛选按月打包导出" aria-label="按月打包导出"><FileArchive /><span>按月 ZIP</span></Button>
    <Button size="sm" disabled={reviewLogLoading || !selectedReviewLogEntries.length} onclick={onExportMergedReviewLog} title="导出当前筛选记录" aria-label="导出合并记录"><Download /><span>合并 CSV</span></Button>
  </div>
</section>
<section class="settings-section review-log-panel" data-testid="review-log-panel">
  <div class="section-title"><FileSpreadsheet /><div><h3>Riff 复习日志</h3><p><code>/data/storage/riff/logs</code></p></div></div>
  {#if reviewLogLoading}
    <div class="review-log-empty"><RefreshCw class="loading-icon" /><strong>正在读取复习记录</strong></div>
  {:else if reviewLogArchive}
    <div class="review-log-summary">
      <div><FileArchive /><span>月份文件</span><strong>{reviewLogArchive.files.length}</strong></div>
      <div><History /><span>有效记录</span><strong>{reviewLogArchive.entries.length}</strong></div>
      <div><CalendarClock /><span>时间范围</span><strong>{formatReviewLogDate(reviewLogArchive.firstReviewedAt)}<br />至 {formatReviewLogDate(reviewLogArchive.lastReviewedAt)}</strong></div>
    </div>
    <div class="review-log-status">
      <Badge variant={reviewLogArchive.errors.length ? "destructive" : "secondary"}>
        {reviewLogArchive.errors.length ? `跳过 ${reviewLogArchive.errors.length} 个不兼容文件` : "当前 Riff 日志格式兼容"}
      </Badge>
      {#if reviewLogArchive.duplicateCount}<Badge variant="outline">已去除 {reviewLogArchive.duplicateCount} 条重复记录</Badge>{/if}
    </div>
    {#if reviewLogArchive.errors.length}
      <div class="review-log-errors">
        {#each reviewLogArchive.errors as error}<p><strong>{error.file}</strong><span>{error.message}</span></p>{/each}
      </div>
    {/if}
    <div class="review-log-filter" data-testid="review-log-filter">
      <div class="review-log-filter-heading"><Filter /><div><strong>选择导入记录</strong><span>筛选只影响本次训练和导出，原始日志不会被修改。</span></div><Badge variant="secondary">{selectedReviewLogEntries.length} / {reviewLogArchive.entries.length}</Badge></div>
      <div class="review-log-filter-grid">
        <label>开始时间<Input type="datetime-local" value={reviewLogFrom} oninput={(event) => onReviewLogFromChange((event.currentTarget as HTMLInputElement).value)} aria-label="复习记录开始时间" /></label>
        <label>结束时间<Input type="datetime-local" value={reviewLogTo} oninput={(event) => onReviewLogToChange((event.currentTarget as HTMLInputElement).value)} aria-label="复习记录结束时间" /></label>
        <label>笔记本
          <Select.Root type="single" value={reviewLogNotebook || "all"} onValueChange={(value) => onReviewLogNotebookChange(value === "all" ? "" : value)}>
            <Select.Trigger aria-label="复习记录笔记本">{reviewLogNotebook ? (reviewLogNotebooks.find((item) => item.id === reviewLogNotebook)?.label ?? "当前笔记本") : "全部笔记本"}</Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="全部笔记本" />
              {#each reviewLogNotebooks as notebook}<Select.Item value={notebook.id} label={notebook.label} />{/each}
            </Select.Content>
          </Select.Root>
        </label>
        <div class="review-log-document-field">
          <label for="review-log-document-query">文档</label>
          <div class="review-log-document-controls">
            <Input id="review-log-document-query" value={reviewLogDocumentQuery} placeholder="搜索路径或输入文档 ID" aria-label="搜索或输入复习记录文档" oninput={(event) => onReviewLogDocumentQueryChange((event.currentTarget as HTMLInputElement).value)} onkeydown={(event) => event.key === "Enter" && onReviewLogDocumentQueryEnter()} />
            <Button variant="outline" size="sm" onclick={onOpenOfficialDocumentPicker} title="调用思源官方文档选择器" aria-label="选择文档"><FileText /><span>选择</span></Button>
            {#if reviewLogDocument}<Button variant="ghost" size="icon-sm" onclick={onClearReviewLogDocument} title="清除文档筛选" aria-label="清除文档筛选"><X /></Button>{/if}
          </div>
          <div class="review-log-document-results" role="listbox" aria-label="复习记录文档候选">
            {#if filteredReviewLogDocuments.length}
              {#each filteredReviewLogDocuments as document}
                <Button variant="ghost" size="sm" class={reviewLogDocument === document.id ? "document-result document-result-active" : "document-result"} onclick={() => onReviewLogDocumentSelect(document.id, document.label)} title={document.id}>
                  <FileText /><span>{document.label}</span>
                </Button>
              {/each}
            {:else if reviewLogDocumentQuery.trim()}<span class="review-log-document-empty">没有匹配的文档</span>
            {:else}<span class="review-log-document-empty">输入路径或 ID 搜索文档，也可点击“选择”</span>{/if}
          </div>
          <div class="review-log-document-options">
            <label class="review-log-subdocument-toggle"><Switch size="sm" checked={reviewLogIncludeSubdocuments} onCheckedChange={(value) => onReviewLogIncludeSubdocumentsChange(value)} aria-label="包含子文档" /><span>包含子文档</span></label>
            <span>{reviewLogDocument ? (reviewLogDocuments.find((item) => item.id === reviewLogDocument)?.label ?? "已选择文档") : "未选择文档"}</span>
          </div>
        </div>
        <label>复习状态
          <Select.Root type="single" value={reviewLogState || "all"} onValueChange={(value) => onReviewLogStateChange(value === "all" ? "" : value)}>
            <Select.Trigger aria-label="复习记录状态">{{ "0": "新卡", "1": "学习中", "2": "复习中", "3": "重新学习" }[reviewLogState] ?? "全部状态"}</Select.Trigger>
            <Select.Content>
              <Select.Item value="all" label="全部状态" />
              <Select.Item value="0" label="新卡" />
              <Select.Item value="1" label="学习中" />
              <Select.Item value="2" label="复习中" />
              <Select.Item value="3" label="重新学习" />
            </Select.Content>
          </Select.Root>
        </label>
      </div>
      <div class="review-log-filter-footer">
        <span>{reviewLogContextLoading ? "正在读取卡片所属文档和笔记本…" : reviewLogContextError || "可按时间、文档、笔记本和复习状态组合筛选"}</span>
        <Button variant="ghost" size="sm" onclick={onResetReviewLogFilters} disabled={!reviewLogFrom && !reviewLogTo && !reviewLogNotebook && !reviewLogDocument && !reviewLogDocumentQuery && !reviewLogState}>重置筛选</Button>
      </div>
    </div>
  {:else}
    <div class="review-log-empty"><Archive /><strong>尚未扫描</strong><span>点击扫描检查当前 SiYuan 的日志格式和可导出记录数</span></div>
  {/if}
</section>

<style>
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
  label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; }
  .review-log-header { display: grid; grid-template-columns: minmax(220px, 1fr) auto; align-items: center; gap: 10px 16px; min-width: 0; }
  .review-log-heading { display: grid; grid-template-columns: 34px minmax(0, 1fr); align-items: center; gap: 10px; min-width: 0; }
  .review-log-heading-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 7px; color: var(--primary, var(--b3-theme-primary)); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 10%, transparent); }
  .review-log-heading-icon :global(svg) { width: 17px; height: 17px; }
  .review-log-heading h3 { font-size: 15px; }
  .review-log-heading p { margin-top: 2px; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.35; }
  .review-log-actions { display: grid; grid-template-columns: repeat(3, max-content); align-items: center; gap: 6px; }
  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid var(--border, var(--b3-border-color));
    border-radius: 8px;
    background: var(--card, var(--b3-theme-background));
  }
  .review-log-panel { padding-bottom: 12px; }
  .section-title { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 9px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .section-title > div { min-width: 0; }
  .section-title p { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .section-title > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; padding: 12px 0; }
  .review-log-summary > div { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 2px 8px; min-width: 0; padding: 9px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; }
  .review-log-summary :global(svg) { grid-row: 1 / 3; width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-summary span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .review-log-summary strong { min-width: 0; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }
  .review-log-status { display: flex; flex-wrap: wrap; gap: 6px; padding-bottom: 10px; }
  .review-log-empty { display: flex; min-height: 150px; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); text-align: center; }
  .review-log-empty > :global(svg) { width: 28px; height: 28px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-empty span { max-width: 420px; font-size: 12px; }
  :global(.loading-icon) { animation: review-log-spin 1s linear infinite; }
  .review-log-errors { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .review-log-errors p { display: flex; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; }
  .review-log-errors span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); overflow-wrap: anywhere; }
  .review-log-filter { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding: 12px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 8px; background: color-mix(in srgb, var(--muted, var(--b3-list-hover)) 45%, transparent); }
  .review-log-filter-heading { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; }
  .review-log-filter-heading > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-filter-heading div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .review-log-filter-heading span, .review-log-filter-footer span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .review-log-filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .review-log-filter-grid label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .review-log-filter-grid :global([data-slot="select-trigger"]) { width: 100%; min-width: 0; }
  .review-log-document-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .review-log-document-controls { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .review-log-document-controls :global([data-slot="input"]) { min-width: 0; flex: 1; }
  .review-log-document-controls :global([data-slot="button"]) { flex: 0 0 auto; }
  .review-log-document-results { display: flex; flex-direction: column; gap: 2px; max-height: 146px; overflow-y: auto; padding: 2px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: var(--background, var(--b3-theme-background)); }
  .review-log-document-results :global(.document-result) { display: flex; align-items: center; justify-content: flex-start; gap: 6px; width: 100%; min-width: 0; padding: 5px 6px; border-radius: 5px; text-align: left; }
  .review-log-document-results :global(.document-result:hover), .review-log-document-results :global(.document-result-active) { background: var(--muted, var(--b3-list-hover)); }
  .review-log-document-results :global(.document-result svg) { width: 14px; height: 14px; flex: 0 0 auto; color: var(--primary, var(--b3-theme-primary)); }
  .review-log-document-results :global(.document-result span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .review-log-document-empty { padding: 7px; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); }
  .review-log-document-options { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
  .review-log-document-options > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); }
  .review-log-subdocument-toggle { display: inline-flex !important; flex-direction: row !important; align-items: center; gap: 5px !important; white-space: nowrap; }
  .review-log-filter-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .review-log-filter-footer span { min-width: 0; overflow-wrap: anywhere; }
  @keyframes review-log-spin { to { transform: rotate(360deg); } }

  @container (max-width: 620px) {
    .review-log-header { grid-template-columns: minmax(0, 1fr); }
    .review-log-actions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .review-log-actions :global([data-slot="button"]) { width: 100%; min-width: 0; }
    .review-log-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @container (max-width: 390px) {
    .review-log-filter-grid { grid-template-columns: 1fr; }
  }

  @container (max-width: 330px) {
    .review-log-actions :global([data-slot="button"] span) { display: none; }
    .review-log-actions :global([data-slot="button"]) { min-height: 32px; padding-inline: 0; }
  }
</style>
