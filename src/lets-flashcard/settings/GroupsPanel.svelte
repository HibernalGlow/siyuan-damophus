<script lang="ts">
  import { ArrowDown, ArrowUp, Eye, FileText, Files, Filter, Gauge, Pencil, Play, Plus, Save, Search, Trash2, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import * as Select from "@/components/ui/select";
  import type { FlashcardGroup, FlashcardSettings } from "@/flashcard/types";

  export let config: FlashcardSettings;
  export let workbenchMode: "make" | "review";
  export let activeCategoryId: string;
  export let editingCategoryId: string | undefined;
  export let editingCategoryName: string;
  export let visibleGroups: FlashcardGroup[];
  export let onActiveCategoryIdChange: (id: string) => void;
  export let onEditingCategoryNameChange: (name: string) => void;
  export let onAddCategory: () => Promise<void>;
  export let onAddGroup: () => Promise<void>;
  export let onCommitCategoryRename: (category: { id: string; name: string }) => Promise<void>;
  export let onCancelCategoryRename: () => void;
  export let onStartCategoryRename: (category: { id: string; name: string }) => void;
  export let onDeleteCategory: (categoryId: string) => Promise<void>;
  export let onMoveGroup: (group: FlashcardGroup, direction: "up" | "down") => Promise<void>;
  export let onOpenGroup: (group: FlashcardGroup) => void;
  export let onSaveGroup: (group: FlashcardGroup) => Promise<void>;
  export let onDeleteGroup: (group: FlashcardGroup) => Promise<void>;
  export let onViewResults: (group: FlashcardGroup, filtered: boolean) => void;
  export let onOpenRaw: (group: FlashcardGroup) => void;
  export let onOpenFiltered: (group: FlashcardGroup) => void;
  export let onBatchPriority: (group: FlashcardGroup) => void;
</script>

<div class="section-heading">
  <h3>SQL 分组</h3>
  <div class="toolbar-actions">
    <Button variant="outline" size="sm" onclick={onAddCategory}><Plus />新增分类</Button>
    <Button size="sm" onclick={onAddGroup}><Plus />新增分组</Button>
  </div>
</div>

<div class="categories" data-testid="flashcard-categories">
  {#each config.categories as category}
    <div class:active-category={activeCategoryId === category.id} class="category" data-category-id={category.id}>
      {#if editingCategoryId === category.id}
        <Input
          class="category-name-input"
          aria-label="分类名称"
          value={editingCategoryName}
          oninput={(event) => onEditingCategoryNameChange((event.currentTarget as HTMLInputElement).value)}
          onkeydown={(event) => {
            if (event.key === "Enter") void onCommitCategoryRename(category);
            if (event.key === "Escape") onCancelCategoryRename();
          }}
        />
        <Button variant="ghost" size="icon-sm" title="保存分类名称" aria-label="保存分类名称" onclick={() => void onCommitCategoryRename(category)}><Save /></Button>
        <Button variant="ghost" size="icon-sm" title="取消编辑" aria-label="取消编辑" onclick={onCancelCategoryRename}><X /></Button>
      {:else}
        <button class="category-select" onclick={() => onActiveCategoryIdChange(category.id)}>{category.name} ({config.groups.filter((group) => group.categoryId === category.id).length})</button>
        <Button variant="ghost" size="icon-sm" title="重命名分类" aria-label="重命名分类" onclick={() => onStartCategoryRename(category)}><Pencil /></Button>
      {/if}
      {#if config.categories.length > 1}<Button variant="destructive" size="icon-sm" title="删除分类" aria-label="删除分类" onclick={() => onDeleteCategory(category.id)}><Trash2 /></Button>{/if}
    </div>
  {/each}
</div>

<div class="groups" data-testid="flashcard-groups">
  {#each visibleGroups as group (group.id)}
    <article class="group" data-group-id={group.id}>
      <div class="group-row">
        <Input class="group-name" aria-label="分组名称" bind:value={group.name} />
        <label class="inline-switch"><span>启用</span><Switch size="sm" checked={group.enabled} onCheckedChange={(value) => group.enabled = value} /></label>
        <label class="inline-switch"><span>查询优先</span><Switch size="sm" checked={group.queryFirst} onCheckedChange={(value) => group.queryFirst = value} /></label>
        <Select.Root type="single" value={group.categoryId} onValueChange={(value) => group.categoryId = value}>
          <Select.Trigger size="sm" aria-label="分组分类">{config.categories.find((category) => category.id === group.categoryId)?.name ?? "选择分类"}</Select.Trigger>
          <Select.Content>{#each config.categories as category}<Select.Item value={category.id} label={category.name} />{/each}</Select.Content>
        </Select.Root>
        <Button variant="ghost" size="icon-sm" onclick={() => onMoveGroup(group, "up")} title="上移" aria-label="分组上移"><ArrowUp /></Button>
        <Button variant="ghost" size="icon-sm" onclick={() => onMoveGroup(group, "down")} title="下移" aria-label="分组下移"><ArrowDown /></Button>
        <Button size="sm" onclick={() => onOpenGroup(group)} aria-label={workbenchMode === "make" ? `检测分组 ${group.name}` : `复习分组 ${group.name}`}><svelte:component this={workbenchMode === "make" ? Search : Play} />{workbenchMode === "make" ? "检测" : "复习到期卡"}</Button>
        <div class="group-action-strip" aria-label="分组操作">
          <Button variant="ghost" size="icon-sm" title="查看原始结果" aria-label="查看原始结果" onclick={() => onViewResults(group, false)}><Eye /></Button>
          <Button variant="ghost" size="icon-sm" title="查看过滤结果" aria-label="查看过滤结果" onclick={() => onViewResults(group, true)}><Filter /></Button>
          <Button variant="ghost" size="icon-sm" title="打开原始文档流" aria-label="打开原始文档流" onclick={() => onOpenRaw(group)}><FileText /></Button>
          <Button variant="ghost" size="icon-sm" title="打开全部文档流" aria-label="打开全部文档流" onclick={() => onOpenFiltered(group)}><Files /></Button>
          <Button variant="ghost" size="icon-sm" title="批量调整优先级" aria-label="批量调整优先级" onclick={() => onBatchPriority(group)}><Gauge /></Button>
          <Button variant="destructive" size="icon-sm" title="删除分组" aria-label="删除分组" onclick={() => onDeleteGroup(group)}><Trash2 /></Button>
        </div>
      </div>
      <Textarea aria-label="SQL 查询" bind:value={group.sqlQuery} rows={3} />
      <div class="group-options">
        <label>缓存分钟<Input type="number" min="1" bind:value={group.cacheMinutes} /></label>
        <Button variant="outline" size="sm" onclick={() => onSaveGroup(group)}><Save />保存分组</Button>
      </div>
    </article>
  {:else}<p class="empty">当前分类暂无分组</p>{/each}
</div>

<style>
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
  label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; }
  .inline-switch { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; color: var(--foreground, var(--b3-theme-on-background)); white-space: nowrap; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px; }
  .section-heading > div:first-child { min-width: 0; }
  .toolbar-actions { display: flex; align-items: center; gap: 8px; }
  .groups { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--border, var(--b3-border-color));
    border-radius: 8px;
    background: var(--card, var(--b3-theme-background));
  }
  .group-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  :global(.group-name) { flex: 1 1 180px; font-weight: 600; }
  .group-options { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
  .group-options label { min-width: 110px; }
  .group-action-strip { display: flex; align-items: center; gap: 2px; }
  .categories { display: flex; flex-wrap: wrap; gap: 6px; }
  .category { display: flex; align-items: center; gap: 2px; min-width: 0; padding: 3px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: var(--card, var(--b3-theme-background)); }
  .category.active-category { border-color: var(--primary, var(--b3-theme-primary)); }
  .category-select { min-height: 28px; padding: 4px 7px; border: 0; color: inherit; background: transparent; cursor: pointer; }
  :global(.category-name-input) { min-width: 140px; font-weight: 600; }
  .empty { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }

  @container (max-width: 620px) {
    .group-row > :global([data-slot="button"]:not([data-size])) { flex: 1 1 auto; }
  }

  @container (max-width: 390px) {
    .toolbar-actions :global([data-slot="button"]) { flex: 1; }
  }
</style>
