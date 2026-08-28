<script lang="ts">
  import { LocateFixed, RefreshCw, XCircle } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import * as Select from "@/components/ui/select";
  import type { FlashcardDiagnosticRow } from "@/flashcard/types";
  import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";

  export let readablePaths: Record<string, string>;
  export let diagnosticRows: FlashcardDiagnosticRow[];
  export let browserLoading: boolean;
  export let browserQuery: string;
  export let browserPriority: string;
  export let browserRenderer: string;
  export let browserDueOnly: boolean;
  export let visibleDiagnostics: FlashcardDiagnosticRow[];
  export let onBrowserQueryChange: (value: string) => void;
  export let onBrowserPriorityChange: (value: string) => void;
  export let onBrowserRendererChange: (value: string) => void;
  export let onBrowserDueOnlyChange: (value: boolean) => void;
  export let onLoadDiagnostics: () => Promise<void>;
  export let onLocateCard: (card: RiffCardRecord) => void;
  export let onUnregisterCard: (card: RiffCardRecord) => void;
  export let onSetPriority: (row: FlashcardDiagnosticRow, priority: number) => void;

  function displayBlockPath(blockId: string, paths: Record<string, string>): string {
    return paths[blockId] ?? "当前文档";
  }
</script>

<section class="browser-toolbar">
  <Input placeholder="搜索内容、路径或分组" value={browserQuery} oninput={(event) => onBrowserQueryChange((event.currentTarget as HTMLInputElement).value)} />
  <Select.Root type="single" value={browserPriority} onValueChange={(value) => onBrowserPriorityChange(value)}>
    <Select.Trigger aria-label="优先级筛选">{{ all: "全部优先级", none: "无标签", conflict: "冲突" }[browserPriority] ?? browserPriority}</Select.Trigger>
    <Select.Content>{#each [["all", "全部优先级"], ["P1", "P1"], ["P2", "P2"], ["P3", "P3"], ["P4", "P4"], ["none", "无标签"], ["conflict", "冲突"]] as option}<Select.Item value={option[0]} label={option[1]} />{/each}</Select.Content>
  </Select.Root>
  <Select.Root type="single" value={browserRenderer} onValueChange={(value) => onBrowserRendererChange(value)}>
    <Select.Trigger aria-label="Renderer 筛选">{browserRenderer === "all" ? "全部形式" : browserRenderer === "unknown" ? "未知" : browserRenderer}</Select.Trigger>
    <Select.Content>{#each ["all", "mark", "list", "heading", "superBlock", "blockquote", "callout", "unknown"] as renderer}<Select.Item value={renderer} label={renderer === "all" ? "全部形式" : renderer === "unknown" ? "未知" : renderer} />{/each}</Select.Content>
  </Select.Root>
  <label class="inline-switch"><span>仅到期</span><Switch size="sm" checked={browserDueOnly} onCheckedChange={(value) => onBrowserDueOnlyChange(value)} aria-label="仅显示到期卡" /></label>
  <Button variant="outline" size="sm" disabled={browserLoading} onclick={onLoadDiagnostics}><RefreshCw />刷新</Button>
</section>
<p class="browser-summary">显示 {visibleDiagnostics.length} / {diagnosticRows.length} 张；单次最多渲染 300 张。</p>
<div class="diagnostic-list">
  {#each visibleDiagnostics as row (row.card.cardID)}
    <article class="diagnostic-row">
      <div class="diagnostic-main">
        <strong>{row.priorityConflict ? "优先级冲突" : row.priority ?? "无优先级"} · {row.renderer} · {row.due ? "已到期" : "未到期"}</strong>
        <span>{row.content || displayBlockPath(row.blockId, readablePaths)}</span>
        <small title={row.blockId}>{displayBlockPath(row.blockId, readablePaths)}{row.groupNames.length ? ` · ${row.groupNames.join(" / ")}` : " · 未命中启用分组"}</small>
      </div>
      <div class="diagnostic-actions">
        <Button variant="ghost" size="icon-sm" title="定位原块" aria-label="定位原块" onclick={() => onLocateCard(row.card)}><LocateFixed /></Button>
        <Select.Root type="single" value={row.priority ?? ""} onValueChange={(value) => onSetPriority(row, ({ P1: 100, P2: 75, P3: 50, P4: 25 } as Record<string, number>)[value])}>
          <Select.Trigger size="sm" aria-label="修改优先级">{row.priority ?? "P"}</Select.Trigger>
          <Select.Content>{#each ["P1", "P2", "P3", "P4"] as priority}<Select.Item value={priority} label={priority} />{/each}</Select.Content>
        </Select.Root>
        <Button variant="destructive" size="icon-sm" title="取消闪卡登记" aria-label="取消闪卡登记" onclick={() => onUnregisterCard(row.card)}><XCircle /></Button>
      </div>
    </article>
  {:else}<p class="empty">没有符合筛选条件的闪卡。</p>{/each}
</div>

<style>
  .browser-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .browser-toolbar > :global([data-slot="input"]) { flex: 1 1 220px; }
  .browser-toolbar > :global([data-slot="select-trigger"]) { flex: 0 1 150px; }
  .inline-switch { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; color: var(--foreground, var(--b3-theme-on-background)); white-space: nowrap; }
  .browser-summary { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .diagnostic-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .diagnostic-row { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px 4px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .diagnostic-main { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .diagnostic-main span, .diagnostic-main small { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .diagnostic-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
  .empty { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }

  @container (max-width: 620px) {
    .diagnostic-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
    .diagnostic-actions { align-self: center; justify-content: flex-end; }
    .browser-toolbar > :global([data-slot="input"]) { flex-basis: 100%; }
    .browser-toolbar > :global([data-slot="select-trigger"]) { flex: 1 1 120px; }
  }
</style>
