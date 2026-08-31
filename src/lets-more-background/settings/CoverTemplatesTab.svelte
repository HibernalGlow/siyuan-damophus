<script lang="ts">
  import { flip } from "svelte/animate";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import { ArrowDown, ArrowUp, Download, GripVertical, Info, Layers, Plus, RefreshCw, Upload } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import CoverTemplateCard from "./CoverTemplateCard.svelte";
  import CoverJsonModal from "./CoverJsonModal.svelte";
  import type { CoverConditionGroup, CoverTemplateItem, SiteCredential, TagPool } from "../sources";

  export let label: (key: string, fallback: string) => string;
  export let templates: CoverTemplateItem[] = [];
  export let tagPools: TagPool[] = [];
  export let siteCredentials: SiteCredential[] = [];
  export let writeToAssets = false;
  export let onAdd: () => void;
  export let onUpdate: (index: number, patch: Partial<CoverTemplateItem>) => void;
  export let onRemove: (index: number) => void;
  export let onApplyCondition: (index: number, condition: CoverConditionGroup) => void;
  export let onReorder: (items: CoverTemplateItem[]) => void;
  export let onResetDefaults: () => void;
  export let onImport: (templates: CoverTemplateItem[], tagPools: TagPool[]) => void;

  let jsonModalOpen = false;
  let jsonModalMode: "export" | "import" = "export";
  let exportContent = "";
  let importError = "";
  let infoOpen = false;

  function openExport() {
    exportContent = JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), templates, tagPools },
      null,
      2,
    );
    jsonModalMode = "export";
    importError = "";
    jsonModalOpen = true;
  }

  function openImport() {
    jsonModalMode = "import";
    importError = "";
    jsonModalOpen = true;
  }

  function confirmImport(content: string, importMode: "append" | "overwrite") {
    importError = "";
    try {
      const parsed = JSON.parse(content);
      const rawTemplates = Array.isArray(parsed) ? parsed : Array.isArray(parsed.templates) ? parsed.templates : null;
      const rawPools = Array.isArray(parsed.tagPools) ? parsed.tagPools : null;
      if (!rawTemplates && !rawPools) {
        importError = label("lets-more-background.importNothingFound", "未在 JSON 中找到可识别的 templates 或 tagPools 数组配置。");
        return;
      }

      const nextTemplates: CoverTemplateItem[] = (rawTemplates || []).map((tpl: any, i: number) => ({
        ...tpl,
        id: tpl.id || `tpl-imported-${Date.now()}-${i}`,
        name: tpl.name || `${label("lets-more-background.importedTemplate", "导入模板")} ${i + 1}`,
        type: tpl.type || "booru",
      }));
      const nextPools: TagPool[] = (rawPools || []).map((pool: any) => ({ ...pool, items: pool.items || [] }));

      if (importMode === "overwrite") {
        onImport(nextTemplates, nextPools);
      } else {
        const existingPoolIds = new Set(tagPools.map((pool) => pool.id));
        onImport(
          [...templates, ...nextTemplates],
          [...tagPools, ...nextPools.filter((pool) => !existingPoolIds.has(pool.id))],
        );
      }
      jsonModalOpen = false;
    } catch (e: any) {
      importError = `${label("lets-more-background.importParseError", "JSON 解析错误")}: ${e.message || String(e)}`;
    }
  }

  // --- 拖拽排序看板 ---
  let reorderOpen = false;
  let reorderItems: CoverTemplateItem[] = [];

  function openReorder() {
    reorderItems = templates.map((tpl, i) => ({ ...tpl, id: tpl.id || `tpl-${Date.now()}-${i}` }));
    reorderOpen = true;
  }

  function handleReorderConsider(event: CustomEvent<DndEvent<CoverTemplateItem>>) {
    reorderItems = event.detail.items;
  }

  function handleReorderFinalize(event: CustomEvent<DndEvent<CoverTemplateItem>>) {
    reorderItems = event.detail.items;
    onReorder(reorderItems);
  }

  function moveToTop(index: number) {
    if (index <= 0) return;
    const [item] = reorderItems.splice(index, 1);
    reorderItems.unshift(item);
    reorderItems = [...reorderItems];
    onReorder(reorderItems);
  }

  function moveToBottom(index: number) {
    if (index >= reorderItems.length - 1) return;
    const [item] = reorderItems.splice(index, 1);
    reorderItems.push(item);
    reorderItems = [...reorderItems];
    onReorder(reorderItems);
  }

  function ratioText(ratio: string | undefined): string {
    if (ratio === "wide") return label("lets-more-background.ratioWideBadge", "宽屏 ≥1.33");
    if (ratio === "landscape") return label("lets-more-background.ratioLandscapeBadge", "横屏 ≥1.0");
    if (ratio === "portrait") return label("lets-more-background.ratioPortraitBadge", "竖屏");
    return ratio || "";
  }
</script>

<div class="mb-stack">
  <section class="mb-section">
    <div class="mb-section-copy">
      <span class="mb-icon-chip" aria-hidden="true"><Layers class="size-4" /></span>
      <div class="min-w-0">
        <div class="mb-section-title">
          <span class="mb-truncate">{label("lets-more-background.templatesTab", "条件模板与过滤器")}</span>
          <span class="mb-count-badge">{templates.length}</span>
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
          <p class="mb-section-desc">{label("lets-more-background.templatesHint", "按顺序匹配条件模板，越靠前优先级越高。")}</p>
        {/if}
      </div>
    </div>
    <div class="mb-section-actions">
      <Button variant="outline" size="sm" class="gap-1.5" onclick={openReorder} title={label("lets-more-background.reorderHint", "通过看板拖拽自由调整模板优先级顺序")}>
        <GripVertical class="size-3.5" />
        <span class="label-full">{label("lets-more-background.reorderKanban", "看板排序")}</span>
        <span class="label-compact">{label("lets-more-background.reorderKanbanShort", "排序")}</span>
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" onclick={openImport} title={label("lets-more-background.importJsonHintBtn", "导入 JSON 预设文件或配置文本")}>
        <Upload class="size-3.5" />
        <span class="label-full">{label("lets-more-background.importJson", "导入 JSON")}</span>
        <span class="label-compact">{label("lets-more-background.importJsonShort", "导入")}</span>
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" onclick={openExport} title={label("lets-more-background.exportJsonHintBtn", "导出全部模板为 JSON 格式")}>
        <Download class="size-3.5" />
        <span class="label-full">{label("lets-more-background.exportJson", "导出 JSON")}</span>
        <span class="label-compact">{label("lets-more-background.exportJsonShort", "导出")}</span>
      </Button>
      <Button variant="outline" size="sm" class="gap-1.5" onclick={onResetDefaults} title={label("lets-more-background.resetDefaultsHint", "重置为默认官方预设")}>
        <RefreshCw class="size-3.5" />
        <span class="label-full">{label("lets-more-background.resetDefaults", "恢复预设")}</span>
        <span class="label-compact">{label("lets-more-background.resetDefaultsShort", "预设")}</span>
      </Button>
      <Button variant="secondary" size="sm" class="mb-toolbar-primary gap-1.5" onclick={onAdd}>
        <Plus class="size-3.5" />
        <span>{label("lets-more-background.addTemplate", "添加模板")}</span>
      </Button>
    </div>
  </section>

  <div class="mb-stack">
    {#each templates as template, tplIndex (template.id || tplIndex)}
      <CoverTemplateCard
        {label}
        {template}
        {tagPools}
        {siteCredentials}
        {writeToAssets}
        onUpdate={(patch) => onUpdate(tplIndex, patch)}
        onRemove={() => onRemove(tplIndex)}
        onApplyCondition={(condition) => onApplyCondition(tplIndex, condition)}
      />
    {/each}
  </div>
</div>

{#if jsonModalOpen}
  <CoverJsonModal
    {label}
    open={jsonModalOpen}
    mode={jsonModalMode}
    {exportContent}
    {importError}
    onClose={() => (jsonModalOpen = false)}
    onConfirmImport={confirmImport}
  />
{/if}

{#if reorderOpen}
  <div class="mb-modal" role="dialog" aria-modal="true">
    <div class="mb-modal-panel">
      <header class="mb-modal-header">
        <span class="mb-modal-title">
          <span class="mb-icon-chip"><GripVertical class="size-4" /></span>
          <span class="mb-truncate">{label("lets-more-background.reorderKanban", "看板排序")}</span>
          <span class="mb-count-badge">{reorderItems.length}</span>
        </span>
        <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" onclick={() => (reorderOpen = false)} aria-label={label("lets-more-background.cancel", "取消")}>
          <span class="text-base leading-none">&times;</span>
        </Button>
      </header>
      <div class="mb-modal-note">
        {label("lets-more-background.reorderKanbanNote", "按住左侧手柄拖拽卡片调整顺序：位置越靠前优先级越高，拖拽后自动实时保存。")}
      </div>
      <div class="mb-modal-body">
        <div
          class="reorder-list"
          use:dragHandleZone={{
            items: reorderItems,
            flipDurationMs: 160,
            dropTargetClasses: ["reorder-dropping"],
          }}
          onconsider={handleReorderConsider}
          onfinalize={handleReorderFinalize}
        >
          {#each reorderItems as item, idx (item.id)}
            <div class="reorder-row" animate:flip={{ duration: 160 }}>
              <span
                use:dragHandle
                class="reorder-handle"
                title={label("lets-more-background.dragToSort", "按住拖拽排序")}
                aria-label={`${label("lets-more-background.dragToSort", "按住拖拽排序")}: ${item.name}`}
              >
                <GripVertical class="size-4" />
              </span>
              <Badge variant="outline" class="mb-mono shrink-0 px-1.5 font-mono text-xs">#{idx + 1}</Badge>
              <div class="min-w-0 flex-1">
                <div class="mb-card-name">{item.name}</div>
                <div class="mt-1 flex flex-wrap items-center gap-1">
                  <span class="mb-site-pill">{item.site || (item.type === "preset_api" ? label("lets-more-background.builtInApi", "内置 API") : "URL")}</span>
                  {#if item.aspectRatio && item.aspectRatio !== "any"}
                    <span class="mb-site-pill">{ratioText(item.aspectRatio)}</span>
                  {/if}
                  {#if item.imageQuality}
                    <span class="mb-site-pill">{item.imageQuality === "sample" ? "Sample" : item.imageQuality === "preview" ? "Preview" : "Original"}</span>
                  {/if}
                  {#if item.minScore !== undefined && item.minScore > 0}
                    <span class="mb-site-pill score-pill">{label("lets-more-background.minScoreBadge", "分值")} ≥ {item.minScore}</span>
                  {/if}
                  {#if item.tags}
                    <span class="mb-mono mb-truncate max-w-[140px] text-[10px] text-muted-foreground">{item.tags}</span>
                  {/if}
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" disabled={idx === 0} onclick={() => moveToTop(idx)} title={label("lets-more-background.moveToTop", "一键置顶")} aria-label={label("lets-more-background.moveToTop", "一键置顶")}>
                  <ArrowUp class="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" disabled={idx === reorderItems.length - 1} onclick={() => moveToBottom(idx)} title={label("lets-more-background.moveToBottom", "一键置底")} aria-label={label("lets-more-background.moveToBottom", "一键置底")}>
                  <ArrowDown class="size-3.5" />
                </Button>
              </div>
            </div>
          {/each}
        </div>
      </div>
      <footer class="mb-modal-footer">
        <span class="text-[11px] text-muted-foreground">{label("lets-more-background.reorderAutoSaved", "调整后已实时保存至设置")}</span>
        <Button variant="secondary" size="sm" class="font-medium" onclick={() => (reorderOpen = false)}>
          {label("lets-more-background.done", "完成")}
        </Button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .reorder-list {
    display: grid;
    gap: 8px;
  }

  .reorder-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-surface);
    user-select: none;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  .reorder-row:hover {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 40%, var(--b3-border-color));
  }

  :global(.reorder-dropping) {
    opacity: 0.6;
    border-color: var(--b3-theme-primary) !important;
  }

  .reorder-handle {
    display: grid;
    place-items: center;
    padding: 4px;
    border-radius: 7px;
    color: var(--b3-theme-on-surface);
    cursor: grab;
  }

  .reorder-handle:active {
    cursor: grabbing;
  }

  .reorder-handle:hover {
    color: var(--b3-theme-on-background);
    background: var(--b3-list-hover);
  }

  .score-pill {
    color: #d97706;
    border-color: color-mix(in srgb, #d97706 40%, var(--b3-border-color));
  }

  .label-compact {
    display: none;
  }

  @container mbframe (max-width: 760px) {
    .label-full {
      display: none;
    }

    .label-compact {
      display: inline;
    }
  }
</style>
