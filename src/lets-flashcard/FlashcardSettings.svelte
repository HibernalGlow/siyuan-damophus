<script lang="ts">
  import type { FlashcardGroup, FlashcardSettings } from "@/flashcard/types";
  import type { FlashcardRuntime } from "@/flashcard/runtime";

  export let runtime: FlashcardRuntime;
  export let onReviewGroup: (group: FlashcardGroup) => void;
  export let onReviewAll: () => void;
  export let onViewResults: (group: FlashcardGroup, filtered: boolean) => void;
  export let onOpenRaw: (group: FlashcardGroup) => void;
  export let onOpenFiltered: (group: FlashcardGroup) => void;
  export let onBatchPriority: (group: FlashcardGroup) => void;

  let config: FlashcardSettings = runtime.getSettings();
  let message = "";
  let saving = false;

  function reload(): void {
    config = runtime.getSettings();
  }

  async function saveConfig(): Promise<void> {
    saving = true;
    try {
      await runtime.saveSettings(config);
      message = "已保存闪卡设置";
    } catch (error) {
      message = `保存失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saving = false;
    }
  }

  async function saveGroup(group: FlashcardGroup): Promise<void> {
    await runtime.saveGroup(group);
    reload();
    message = `已保存分组：${group.name}`;
  }

  async function addGroup(): Promise<void> {
    const group: FlashcardGroup = {
      id: crypto.randomUUID(),
      name: "新分组",
      sqlQuery: "SELECT id FROM blocks WHERE",
      categoryId: config.categories[0]?.id ?? "default",
      enabled: true,
      queryFirst: true,
      cacheMinutes: config.cacheUpdateInterval,
      priorityEnabled: false,
    };
    await runtime.saveGroup(group);
    reload();
  }

  async function deleteGroup(group: FlashcardGroup): Promise<void> {
    await runtime.deleteGroup(group.id);
    reload();
    message = `已删除分组：${group.name}`;
  }

  async function addCategory(): Promise<void> {
    const id = crypto.randomUUID();
    await runtime.saveCategory({ id, name: "新分类" });
    reload();
  }

  async function deleteCategory(categoryId: string): Promise<void> {
    if (config.categories.length <= 1) return;
    await runtime.deleteCategory(categoryId);
    reload();
  }

  async function renameCategory(category: { id: string; name: string }): Promise<void> {
    await runtime.saveCategory(category);
    reload();
  }

  async function moveGroup(group: FlashcardGroup, direction: "up" | "down"): Promise<void> {
    await runtime.reorderGroups(group.categoryId, group.id, direction);
    reload();
  }

  async function updateGlobal(): Promise<void> {
    await saveConfig();
    runtime.startAutomation();
  }
</script>

<div class="flashcard-settings" data-testid="flashcard-settings">
  <header class="settings-header">
    <div>
      <h2>专项闪卡</h2>
      <p>SQL 分组、到期复习、缓存和自动化</p>
    </div>
    <button class="b3-button b3-button--outline" on:click={onReviewAll} title="打开全部到期卡">全部到期</button>
  </header>

  <section class="settings-grid">
    <label>牌组 ID<input bind:value={config.deckId} /></label>
    <label>首轮上限<input type="number" min="1" max="1000" bind:value={config.maxReviewCards} /></label>
    <label>向上传递深度<input type="number" min="1" max="32" bind:value={config.maxResolveDepth} /></label>
    <label>缓存刷新（分钟）<input type="number" min="1" max="1440" bind:value={config.cacheUpdateInterval} /></label>
    <label>扫描间隔（分钟）<input type="number" min="1" max="1440" bind:value={config.scanInterval} /></label>
  </section>

  <section class="automation-panel">
    <label class="check"><input type="checkbox" bind:checked={config.postponeEnabled} /> 自动推迟今日新卡</label>
    <label>推迟天数<input type="number" min="1" max="30" bind:value={config.postponeDays} /></label>
    <label class="check"><input type="checkbox" bind:checked={config.priorityScanEnabled} /> 自动优先级扫描</label>
    <label>扫描间隔（分钟）<input type="number" min="1" max="1440" bind:value={config.priorityScanInterval} /></label>
    <button class="b3-button" on:click={updateGlobal} disabled={saving}>保存并应用自动化</button>
  </section>

  <div class="section-heading">
    <h3>SQL 分组</h3>
    <div class="toolbar-actions">
      <button class="b3-button b3-button--outline" on:click={addCategory}>新增分类</button>
      <button class="b3-button b3-button--outline" on:click={addGroup}>新增分组</button>
    </div>
  </div>

  <div class="categories" data-testid="flashcard-categories">
    {#each config.categories as category}
      <div class="category" data-category-id={category.id}>
        <input aria-label="分类名称" bind:value={category.name} on:change={() => renameCategory(category)} />
        <span>{config.groups.filter((group) => group.categoryId === category.id).length} 个分组</span>
        {#if config.categories.length > 1}<button class="b3-button b3-button--outline" on:click={() => deleteCategory(category.id)}>删除分类</button>{/if}
      </div>
    {/each}
  </div>

  <div class="groups" data-testid="flashcard-groups">
    {#each config.groups as group (group.id)}
      <article class="group" data-group-id={group.id}>
        <div class="group-row">
          <input class="group-name" aria-label="分组名称" bind:value={group.name} />
          <label class="check"><input type="checkbox" bind:checked={group.enabled} /> 启用</label>
          <label class="check"><input type="checkbox" bind:checked={group.queryFirst} /> 查询优先</label>
          <select bind:value={group.categoryId} aria-label="分组分类">
            {#each config.categories as category}<option value={category.id}>{category.name}</option>{/each}
          </select>
          <button class="b3-button b3-button--outline icon-button" on:click={() => moveGroup(group, "up")} title="上移">↑</button>
          <button class="b3-button b3-button--outline icon-button" on:click={() => moveGroup(group, "down")} title="下移">↓</button>
          <button class="b3-button" on:click={() => onReviewGroup(group)}>复习到期卡</button>
          <button class="b3-button b3-button--outline" on:click={() => onViewResults(group, false)}>看原始结果</button>
          <button class="b3-button b3-button--outline" on:click={() => onViewResults(group, true)}>看过滤结果</button>
          <button class="b3-button b3-button--outline" on:click={() => onOpenRaw(group)}>文档流（原始）</button>
          <button class="b3-button b3-button--outline" on:click={() => onOpenFiltered(group)}>文档流（全部）</button>
          <button class="b3-button b3-button--outline" on:click={() => onBatchPriority(group)}>批量优先级</button>
          <button class="b3-button b3-button--outline" on:click={() => deleteGroup(group)}>删除</button>
        </div>
        <textarea aria-label="SQL 查询" bind:value={group.sqlQuery} rows="3"></textarea>
        <div class="group-options">
          <label>缓存分钟<input type="number" min="1" bind:value={group.cacheMinutes} /></label>
          <label class="check"><input type="checkbox" bind:checked={group.priorityEnabled} /> 自动优先级</label>
          <label>优先级<input type="number" min="0" max="100" bind:value={group.priority} /></label>
          <button class="b3-button b3-button--outline" on:click={() => saveGroup(group)}>保存分组</button>
        </div>
      </article>
    {/each}
  </div>
  {#if message}<p class="message" role="status">{message}</p>{/if}
</div>

<style>
  .flashcard-settings { box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; padding: 20px; height: 100%; overflow: auto; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
  .settings-header, .section-heading, .group-row, .group-options, .toolbar-actions { display: flex; align-items: center; gap: 10px; }
  .settings-header, .section-heading { justify-content: space-between; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }
  .settings-header p { margin-top: 4px; color: var(--b3-theme-on-surface-light); }
  .settings-grid, .automation-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--b3-theme-on-surface-light); }
  label.check { flex-direction: row; align-items: center; justify-content: flex-start; }
  input, textarea { min-width: 0; box-sizing: border-box; border: 1px solid var(--b3-border-color); border-radius: 4px; padding: 7px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
  .group { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; }
  .categories { display: flex; flex-wrap: wrap; gap: 8px; }
  .category { display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid var(--b3-border-color); border-radius: 4px; }
  .category span { color: var(--b3-theme-on-surface-light); font-size: 12px; }
  select { min-width: 100px; }
  .icon-button { min-width: 32px; padding-inline: 8px; }
  .group-row { flex-wrap: wrap; }
  .group-name { flex: 1 1 180px; font-weight: 600; }
  .group-options { flex-wrap: wrap; }
  .group-options label { min-width: 110px; }
  .message { color: var(--b3-theme-primary); }
  @media (max-width: 700px) { .flashcard-settings { padding: 12px; } .group-row .b3-button { flex: 1 1 auto; } }
</style>
