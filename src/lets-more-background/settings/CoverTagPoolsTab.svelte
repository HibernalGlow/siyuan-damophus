<script lang="ts">
  import { Check, Database, Edit3, Info, Palette, Plus, Search, Trash2, Wand2, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Textarea } from "@/components/ui/textarea";
  import { formatTagLine, parseTagLine } from "../tag-dictionary";
  import type { TagEntry, TagPool } from "../sources";

  export let label: (key: string, fallback: string) => string;
  export let pools: TagPool[] = [];
  export let onAdd: () => void;
  export let onUpdate: (index: number, patch: Partial<TagPool>) => void;
  export let onRemove: (index: number) => void;

  // A pool can hold hundreds of entries; only a short preview is rendered
  // until the user asks for the rest, so the card never becomes a wall of chips.
  const PREVIEW_LIMIT = 24;

  let searchQuery: Record<string, string> = {};
  let quickAddInput: Record<string, string> = {};
  let expandedPools: Record<string, boolean> = {};
  let infoOpen = false;

  // 批量编辑弹窗状态
  let editingIndex: number | null = null;
  let editingName = "";
  let editingDesc = "";
  let editingText = "";

  function normalizeTagItem(item: string | TagEntry): TagEntry {
    if (typeof item === "string") {
      const parsed = parseTagLine(item);
      return parsed ? { tag: parsed.tag, zh: parsed.zh } : { tag: item.trim() };
    }
    return item;
  }

  function quickAdd(pool: TagPool, poolIndex: number) {
    const input = (quickAddInput[pool.id] || "").trim();
    if (!input) return;
    const parsed = parseTagLine(input);
    if (!parsed) return;
    onUpdate(poolIndex, { items: [...(pool.items || []), { tag: parsed.tag, zh: parsed.zh }] });
    quickAddInput = { ...quickAddInput, [pool.id]: "" };
  }

  function sameEntry(a: TagEntry, b: TagEntry): boolean {
    return a.tag === b.tag && (a.zh || "") === (b.zh || "");
  }

  // Resolve the entry inside the source list instead of trusting the filtered
  // index, otherwise deleting a search hit removes an unrelated entry.
  function removeTag(poolIndex: number, item: string | TagEntry) {
    const pool = pools[poolIndex];
    if (!pool) return;
    const items = pool.items || [];
    const target = normalizeTagItem(item);
    const index = items.findIndex((entry) => sameEntry(normalizeTagItem(entry), target));
    if (index < 0) return;
    onUpdate(poolIndex, { items: items.filter((_, i) => i !== index) });
  }

  function toggleExpanded(poolId: string) {
    expandedPools = { ...expandedPools, [poolId]: !expandedPools[poolId] };
  }

  function openEditor(poolIndex: number) {
    const pool = pools[poolIndex];
    if (!pool) return;
    editingIndex = poolIndex;
    editingName = pool.name;
    editingDesc = pool.description || "";
    editingText = (pool.items || [])
      .map((item) => (typeof item === "string" ? item : formatTagLine(item.tag, item.zh)))
      .join("\n");
  }

  function saveEditor() {
    if (editingIndex === null) return;
    const parsedItems: TagEntry[] = [];
    for (const line of editingText.split("\n")) {
      const parsed = parseTagLine(line);
      if (parsed) parsedItems.push({ tag: parsed.tag, zh: parsed.zh });
    }
    onUpdate(editingIndex, {
      name: editingName.trim() || `${label("lets-more-background.poolFallbackName", "词库")} ${editingIndex + 1}`,
      description: editingDesc.trim(),
      items: parsedItems,
    });
    editingIndex = null;
  }

  function autoTranslateEditorText() {
    editingText = editingText
      .split("\n")
      .map((line) => {
        const parsed = parseTagLine(line);
        return parsed ? formatTagLine(parsed.tag, parsed.zh) : line;
      })
      .join("\n");
  }
</script>

<div class="mb-stack">
  <section class="mb-section">
    <div class="mb-section-copy">
      <span class="mb-icon-chip" aria-hidden="true"><Database class="size-4" /></span>
      <div class="min-w-0">
        <div class="mb-section-title">
          <span class="mb-truncate">{label("lets-more-background.tagPoolsTitle", "画师与 Tag 词库池")}</span>
          <span class="mb-count-badge">{pools.length}</span>
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
          <p class="mb-section-desc">{label("lets-more-background.tagPoolsDesc", "集中维护画师清单或主题词库，更新后引用它的模板自动生效。")}</p>
        {/if}
      </div>
    </div>
    <div class="mb-section-actions">
      <Button variant="secondary" size="sm" class="mb-toolbar-primary gap-1.5" onclick={onAdd}>
        <Plus class="size-3.5" />
        <span>{label("lets-more-background.addTagPool", "创建词库池")}</span>
      </Button>
    </div>
  </section>

  {#each pools as pool, poolIndex (pool.id || poolIndex)}
    {@const searchQ = (searchQuery[pool.id] || "").toLowerCase()}
    {@const filteredItems = (pool.items || []).filter((item) => {
      if (!searchQ) return true;
      const entry = normalizeTagItem(item);
      return entry.tag.toLowerCase().includes(searchQ) || (!!entry.zh && entry.zh.toLowerCase().includes(searchQ));
    })}
    {@const expanded = expandedPools[pool.id] === true}
    {@const visibleItems = expanded ? filteredItems : filteredItems.slice(0, PREVIEW_LIMIT)}
    {@const hiddenCount = filteredItems.length - visibleItems.length}

    <section class="mb-card">
      <header class="mb-card-head">
        <span class="mb-icon-chip" aria-hidden="true"><Palette class="size-4" /></span>
        <div class="mb-card-title">
          <div class="mb-card-name" title={pool.description || pool.name}>{pool.name}</div>
        </div>
        <span class="mb-count-badge">{label("lets-more-background.poolItemCount", "{count} 条").replace("{count}", String(pool.items?.length || 0))}</span>
        <div class="mb-card-actions">
          <Button
            variant="outline"
            size="icon-sm"
            class="size-8 shrink-0"
            onclick={() => openEditor(poolIndex)}
            title={label("lets-more-background.editAndImport", "编辑 / 导入")}
            aria-label={label("lets-more-background.editAndImport", "编辑 / 导入")}
          >
            <Edit3 class="size-3.5 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onclick={() => onRemove(poolIndex)}
            title={label("lets-more-background.removePool", "删除词库")}
            aria-label={label("lets-more-background.removePool", "删除词库")}
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </header>

      <div class="mb-card-body">
        <div class="pool-controls">
          <div class="pool-search">
            <Search class="size-3.5" aria-hidden="true" />
            <Input
              bind:value={searchQuery[pool.id]}
              placeholder={label("lets-more-background.filterPoolPlaceholder", "过滤当前词库...")}
              class="h-8 w-full bg-background pl-8 text-xs"
              aria-label={label("lets-more-background.filterPoolPlaceholder", "过滤当前词库...")}
            />
          </div>
          <div class="pool-quick-add">
            <Input
              bind:value={quickAddInput[pool.id]}
              onkeydown={(e) => { if (e.key === "Enter") quickAdd(pool, poolIndex); }}
              placeholder={label("lets-more-background.quickAddPlaceholder", "输入新画师/Tag (如 ask_(askzy) # Ask)...")}
              class="h-8 min-w-0 flex-1 bg-background text-xs"
              aria-label={label("lets-more-background.quickAddPlaceholder", "输入新画师/Tag")}
            />
            <Button variant="secondary" size="sm" class="shrink-0 gap-1 font-medium" onclick={() => quickAdd(pool, poolIndex)}>
              <Plus class="size-3" />
              <span>{label("lets-more-background.quickAdd", "添加")}</span>
            </Button>
          </div>
        </div>

        <div class="chip-area">
          {#if filteredItems.length === 0}
            <div class="py-5 text-center text-xs text-muted-foreground">
              {(pool.items?.length || 0) === 0
                ? label("lets-more-background.emptyPoolHint", "词库暂无词条，点击右上角「编辑 / 导入」一键粘贴")
                : label("lets-more-background.noMatchHint", "未找到与搜索词匹配的词条")}
            </div>
          {:else}
            <div class="flex flex-wrap gap-1.5">
              {#each visibleItems as item, itemIndex (itemIndex)}
                {@const entry = normalizeTagItem(item)}
                <span class="mb-chip">
                  <span class="mb-chip-tag">{entry.tag}</span>
                  {#if entry.zh}
                    <span class="mb-chip-zh">{entry.zh}</span>
                  {/if}
                  <button
                    type="button"
                    class="mb-chip-delete"
                    onclick={() => removeTag(poolIndex, item)}
                    title={label("lets-more-background.deleteTag", "删除此 Tag")}
                    aria-label={`${label("lets-more-background.deleteTag", "删除此 Tag")}: ${entry.tag}`}
                  >
                    <X class="size-3" />
                  </button>
                </span>
              {/each}
            </div>
            {#if hiddenCount > 0 || expanded}
              <button type="button" class="chip-more" onclick={() => toggleExpanded(pool.id)}>
                {expanded
                  ? label("lets-more-background.collapseTags", "收起")
                  : label("lets-more-background.showMoreTags", "展开剩余 {count} 条").replace("{count}", String(hiddenCount))}
              </button>
            {/if}
          {/if}
        </div>
      </div>
    </section>
  {/each}
</div>

{#if editingIndex !== null}
  <div class="mb-modal" role="dialog" aria-modal="true">
    <div class="mb-modal-panel">
      <header class="mb-modal-header">
        <span class="mb-modal-title">
          <span class="mb-icon-chip"><Edit3 class="size-4" /></span>
          <span>{label("lets-more-background.editPoolTitle", "编辑画师 / Tag 词库")}</span>
        </span>
        <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" onclick={() => (editingIndex = null)} aria-label={label("lets-more-background.cancel", "取消")}>
          <X class="size-4" />
        </Button>
      </header>

      <div class="mb-modal-body">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label class="mb-field-label">{label("lets-more-background.poolName", "词库名称")}</Label>
            <Input bind:value={editingName} placeholder={label("lets-more-background.poolNamePlaceholder", "例如：常用精选画师池")} class="h-8 bg-background text-xs" />
          </div>
          <div>
            <Label class="mb-field-label">{label("lets-more-background.poolDesc", "描述 / 备注")}</Label>
            <Input bind:value={editingDesc} placeholder={label("lets-more-background.poolDescPlaceholder", "例如：高画质动漫插画画师")} class="h-8 bg-background text-xs" />
          </div>
        </div>

        <div class="flex flex-col min-h-[200px]">
          <div class="mb-2 flex flex-col justify-between gap-1.5 sm:flex-row sm:items-center">
            <Label class="mb-field-label m-0">
              {label("lets-more-background.poolListLabel", "词条清单（每行一个，支持 tag # 中文名）")}
            </Label>
            <Button variant="outline" size="sm" class="self-start gap-1 border-primary/30 text-primary hover:bg-primary/10 sm:self-auto" onclick={autoTranslateEditorText}>
              <Wand2 class="size-3.5" />
              <span>{label("lets-more-background.autoTranslate", "一键匹配中文翻译")}</span>
            </Button>
          </div>
          <Textarea
            bind:value={editingText}
            rows={10}
            class="min-h-[140px] flex-1 resize-none bg-background font-mono text-xs leading-relaxed"
            placeholder={"ask_(askzy) # Ask\nblade_(galaxist) # Blade\nscenery # 唯美风景"}
          />
        </div>
      </div>

      <footer class="mb-modal-footer">
        <Button variant="ghost" size="sm" onclick={() => (editingIndex = null)}>
          {label("lets-more-background.cancel", "取消")}
        </Button>
        <Button variant="secondary" size="sm" class="gap-1.5 font-medium" onclick={saveEditor}>
          <Check class="size-3.5" />
          <span>{label("lets-more-background.savePool", "保存词库")}</span>
        </Button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .pool-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pool-search {
    position: relative;
    width: 100%;
  }

  .pool-search :global(svg) {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 1;
    color: var(--b3-theme-on-surface);
    pointer-events: none;
  }

  .pool-quick-add {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .chip-area {
    max-height: 256px;
    min-height: 56px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 9px;
    background: color-mix(in srgb, var(--b3-theme-surface) 40%, var(--b3-theme-background));
  }

  .chip-more {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 30px;
    margin-top: 8px;
    padding: 0 10px;
    border: 1px dashed var(--b3-border-color);
    border-radius: 8px;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: color 150ms ease, border-color 150ms ease, background-color 150ms ease;
  }

  .chip-more:hover {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color));
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 8%, transparent);
  }

  @container mbframe (max-width: 760px) {
    .pool-quick-add :global(button) {
      min-height: 36px;
    }

    .chip-area {
      max-height: 192px;
    }

    .chip-more {
      min-height: 36px;
    }
  }

  @container mbframe (min-width: 560px) {
    .pool-controls {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .pool-search {
      width: 208px;
      flex: 0 0 auto;
    }

    .pool-quick-add {
      width: auto;
      flex: 1 1 auto;
      max-width: 420px;
      justify-content: flex-end;
    }
  }
</style>
