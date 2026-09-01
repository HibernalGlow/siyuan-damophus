<script lang="ts">
  import { Check, Database, RefreshCw, TriangleAlert } from "lucide-svelte";
  import { Button } from "@/components/ui/button";

  export let label: (key: string, fallback: string) => string;
  export let targetBlockId = "";
  export let status: "idle" | "checking" | "ready" | "syncing" | "success" | "error" = "idle";
  export let message = "";
  export let selectCurrentTarget: () => void;
  export let checkTarget: () => void;
  export let syncTarget: () => void;
  export let onTargetInput: (value: string) => void;
  export let pruneStale = false;
  export let onPruneStaleChange: ((value: boolean) => void) | undefined = undefined;
  export let includeUnanswered = true;
  export let onIncludeUnansweredChange: ((value: boolean) => void) | undefined = undefined;
  export let markedIndexTargets: Array<{ blockId: string; avId?: string }> = [];
  export let refreshTargets: (() => void) | undefined = undefined;
</script>

<section class="mapping min-h-0 flex-1 overflow-y-auto" data-testid="question-bank-mapping">
  <header class="mapping-header">
    <div>
      <h2>{label("dataMapping", "数据映射")}</h2>
      <p>{label("dataMappingDescription", "将题库统计单向投射到一个已有的思源属性视图。选中数据库块即可自动标记，也可在任意数据库块右键菜单中标记或同步，无需打开题库。")}</p>
    </div>
    <Database size={22} aria-hidden="true" />
  </header>
  <div class="mapping-panel">
    {#if markedIndexTargets.length > 0}
      <div class="mapping-marked">
        <span class="mapping-marked-title">{label("markedIndexDatabases", "已标记的索引数据库")}</span>
        <div class="mapping-marked-list">
          {#each markedIndexTargets as target (target.blockId)}
            <code class="mapping-marked-chip" title={target.blockId}>{target.avId || target.blockId}</code>
          {/each}
        </div>
        {#if refreshTargets}
          <Button variant="ghost" class="mapping-marked-refresh" onclick={refreshTargets}><RefreshCw size={13} aria-hidden="true" />{label("refreshMarkedList", "刷新")}</Button>
        {/if}
      </div>
    {/if}
    <label for="question-index-target">{label("questionIndexTarget", "Question Index 目标")}</label>
    <div class="mapping-row">
      <input id="question-index-target" value={targetBlockId} placeholder="20260819123456-abcdefg" oninput={(event) => onTargetInput((event.currentTarget as HTMLInputElement).value)} />
      <Button variant="outline" onclick={selectCurrentTarget} title={label("useSelectedDatabase", "使用当前选中的数据库块")}>
        <Database size={16} aria-hidden="true" />{label("useSelectedDatabase", "使用当前选中的数据库块")}
      </Button>
    </div>
    <div class="mapping-options">
      <label class="mapping-option-label">
        <input type="checkbox" checked={includeUnanswered} onchange={(event) => onIncludeUnansweredChange?.((event.currentTarget as HTMLInputElement).checked)} />
        <span>{label("includeUnansweredProjectionRows", "同步未作答题目（关闭时仅同步有作答记录的题目）")}</span>
      </label>
      <label class="mapping-option-label">
        <input type="checkbox" checked={pruneStale} onchange={(event) => onPruneStaleChange?.((event.currentTarget as HTMLInputElement).checked)} />
        <span>{label("pruneStaleProjectionRows", "同步时删除失效数据行（清理目标数据库中不存在于题库的条目）")}</span>
      </label>
    </div>
    <div class="mapping-actions">
      <Button variant="outline" disabled={!targetBlockId || status === "checking" || status === "syncing"} onclick={checkTarget}>
        <Check size={16} aria-hidden="true" />{label("checkMapping", "检查连接")}
      </Button>
      <Button disabled={!targetBlockId || status === "checking" || status === "syncing"} onclick={syncTarget}>
        <RefreshCw size={16} aria-hidden="true" />{label("syncNow", "手动同步")}
      </Button>
    </div>
    {#if message}
      <p class:success={status === "ready" || status === "success"} class:error={status === "error"} class="mapping-message">
        {#if status === "error"}<TriangleAlert size={15} aria-hidden="true" />{:else}<Check size={15} aria-hidden="true" />{/if}{message}
      </p>
    {/if}
  </div>
</section>

<style>
  .mapping { padding: 16px; }
  .mapping-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 8px 0 16px; }
  h2 { margin: 0; font-size: 18px; }
  .mapping-header p { margin: 6px 0 0; color: var(--b3-theme-on-surface); font-size: 12px; }
  .mapping-panel { max-width: 760px; border: 1px solid var(--b3-border-color); padding: 16px; }
  label { display: block; font-size: 12px; font-weight: 600; }
  input { min-width: 0; flex: 1; border: 1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); padding: 8px 10px; }
  .mapping-row, .mapping-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .mapping-marked { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 14px; padding: 10px 12px; border: 1px dashed var(--b3-border-color); }
  .mapping-marked-title { font-size: 12px; font-weight: 600; }
  .mapping-marked-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .mapping-marked-chip { font-size: 11px; padding: 2px 8px; border: 1px solid var(--b3-border-color); background: var(--b3-theme-background); color: var(--b3-theme-on-background); }
  .mapping-marked-refresh { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 2px 6px; }
  .mapping-options { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .mapping-option-label { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: normal; cursor: pointer; user-select: none; }
  .mapping-option-label input[type="checkbox"] { width: auto; flex: none; cursor: pointer; margin: 0; }
  .mapping-message { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; font-size: 12px; }
  .mapping-message.success { color: var(--b3-theme-success); }
  .mapping-message.error { color: var(--b3-theme-error); }
</style>
