<script lang="ts">
  import type { FlashcardDiagnosticRow, FlashcardGroup, FlashcardReviewScope, FlashcardSettings } from "@/flashcard/types";
  import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";
  import type { FlashcardRuntime } from "@/flashcard/runtime";

  export let runtime: FlashcardRuntime;
  export let onReviewGroup: (group: FlashcardGroup) => void;
  export let onReviewAll: () => void;
  export let onViewResults: (group: FlashcardGroup, filtered: boolean) => void;
  export let onOpenRaw: (group: FlashcardGroup) => void;
  export let onOpenFiltered: (group: FlashcardGroup) => void;
  export let onBatchPriority: (group: FlashcardGroup) => void;
  export let onImportSfp: () => void | Promise<void>;
  export let onReviewScope: (scope: FlashcardReviewScope) => void;
  export let onLocateCard: (card: RiffCardRecord) => void;
  export let onUnregisterCard: (card: RiffCardRecord) => void;
  export let onSetCardPriority: (card: RiffCardRecord, priority: number) => void;
  export let onSettingsChanged: () => void;

  let config: FlashcardSettings = runtime.getSettings();
  let message = "";
  let saving = false;
  let activeTab: "instructions" | "recent" | "groups" | "browser" | "global" = "recent";
  let activeCategoryId = config.categories[0]?.id ?? "default";
  let visibleGroups: FlashcardGroup[] = [];
  let history = runtime.getHistory();
  let diagnosticRows: FlashcardDiagnosticRow[] = [];
  let browserLoading = false;
  let browserQuery = "";
  let browserPriority = "all";
  let browserRenderer = "all";
  let browserDueOnly = false;
  let visibleDiagnostics: FlashcardDiagnosticRow[] = [];

  $: activeCategoryId = config.categories.some((category) => category.id === activeCategoryId)
    ? activeCategoryId
    : config.categories[0]?.id ?? "default";
  $: visibleGroups = config.groups.filter((group) => group.categoryId === activeCategoryId);
  $: visibleDiagnostics = diagnosticRows.filter((row) => {
    const query = browserQuery.trim().toLowerCase();
    if (query && !`${row.blockId} ${row.cardId ?? ""} ${row.content ?? ""} ${row.groupNames.join(" ")}`.toLowerCase().includes(query)) return false;
    if (browserPriority !== "all" && (row.priorityConflict ? "conflict" : row.priority ?? "none") !== browserPriority) return false;
    if (browserRenderer !== "all" && row.renderer !== browserRenderer) return false;
    return !browserDueOnly || row.due;
  }).slice(0, 300);

  function reload(): void {
    config = runtime.getSettings();
    if (!config.categories.some((category) => category.id === activeCategoryId)) {
      activeCategoryId = config.categories[0]?.id ?? "default";
    }
  }

  async function saveConfig(): Promise<void> {
    saving = true;
    try {
      await runtime.saveSettings(config);
      onSettingsChanged();
      message = "已保存闪卡设置";
    } catch (error) {
      message = `保存失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      saving = false;
    }
  }

  async function togglePinned(scope: FlashcardReviewScope & { pinned?: boolean }): Promise<void> {
    await runtime.setScopePinned(scope.id, !scope.pinned);
    history = runtime.getHistory();
  }

  async function removeHistory(scopeId: string): Promise<void> {
    await runtime.removeScopeHistory(scopeId);
    history = runtime.getHistory();
  }

  async function loadDiagnostics(): Promise<void> {
    browserLoading = true;
    try {
      diagnosticRows = await runtime.buildDiagnostics();
      message = `已加载 ${diagnosticRows.length} 张已登记闪卡`;
    } catch (error) {
      message = `闪卡浏览器加载失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      browserLoading = false;
    }
  }

  function setPriority(row: FlashcardDiagnosticRow, priority: number): void {
    onSetCardPriority(row.card, priority);
    window.setTimeout(() => void loadDiagnostics(), 300);
  }

  async function saveGroup(group: FlashcardGroup): Promise<void> {
    if (!group.name.trim() || !group.sqlQuery.trim()) {
      message = "分组名称和 SQL 查询不能为空";
      return;
    }
    await runtime.saveGroup(group);
    reload();
    message = `已保存分组：${group.name}`;
  }

  async function addGroup(): Promise<void> {
    const group: FlashcardGroup = {
      id: crypto.randomUUID(),
      name: "新分组",
      sqlQuery: "SELECT id FROM blocks WHERE",
      categoryId: activeCategoryId,
      enabled: true,
      queryFirst: true,
      cacheMinutes: config.cacheUpdateInterval,
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
    if (!window.confirm("删除分类会同时删除其中的 SQL 分组，确认继续吗？")) return;
    await runtime.deleteCategory(categoryId);
    reload();
  }

  async function renameCategory(category: { id: string; name: string }): Promise<void> {
    if (!category.name.trim()) {
      message = "分类名称不能为空";
      return;
    }
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

  function saveGlobalOnChange(): void {
    void saveConfig();
    runtime.startAutomation();
  }

  async function clearCache(): Promise<void> {
    await runtime.clearCache();
    message = "已清除 SQL 缓存";
  }

  function renameCategoryWithPrompt(category: { id: string; name: string }): void {
    const name = window.prompt("分类名称", category.name)?.trim();
    if (name && name !== category.name) void renameCategory({ ...category, name });
  }
</script>

<div class="flashcard-settings" data-testid="flashcard-settings">
  <header class="settings-header">
    <div>
      <h2>专项闪卡</h2>
      <p>SQL 分组、到期复习、缓存和自动化</p>
    </div>
    <div class="header-actions">
      <button class="b3-button b3-button--outline" on:click={onReviewAll} title="打开全部到期卡">全部到期</button>
      <button class="b3-button b3-button--outline" on:click={clearCache} title="清除 SQL 缓存">刷新缓存</button>
      <button class="b3-button b3-button--outline" on:click={onImportSfp} title="导入 Specialized Flashcard Plugin 的分组设置">导入 SFP 设置</button>
    </div>
  </header>

  <nav class="tabs" aria-label="闪卡设置">
    <button class:active={activeTab === "instructions"} on:click={() => activeTab = "instructions"}>使用说明</button>
    <button class:active={activeTab === "recent"} on:click={() => { activeTab = "recent"; history = runtime.getHistory(); }}>最近范围</button>
    <button class:active={activeTab === "groups"} on:click={() => activeTab = "groups"}>SQL 分组</button>
    <button class:active={activeTab === "browser"} on:click={() => { activeTab = "browser"; if (diagnosticRows.length === 0) void loadDiagnostics(); }}>闪卡浏览器</button>
    <button class:active={activeTab === "global"} on:click={() => activeTab = "global"}>总体配置</button>
  </nav>

  {#if activeTab === "instructions"}
    <section class="instructions" data-testid="flashcard-instructions">
      <h3>专项闪卡</h3>
      <p>SQL 只负责产生候选块，DAMO 会沿父链找到最近的显式闪卡根块，再与 Riff 到期卡取交集。</p>
      <ul>
        <li>原始结果和过滤结果可以分别查看；批量优先级调整始终先预览再确认。</li>
        <li>启用“查询优先”可在复习前读取最新 SQL 结果，否则使用缓存以缩短打开时间。</li>
        <li>自动推迟作用于牌组内今天创建且未暂停的卡；优先级只由 Markdown 中的 P1-P4 标签决定。</li>
        <li>文档流入口是可选集成；没有文档流插件时，DAMO 的结果查看和原生复习仍可用。</li>
      </ul>
    </section>
  {:else if activeTab === "recent"}
    <section class="section-heading">
      <div><h3>最近使用与置顶范围</h3><p>按置顶、使用次数和最近使用排序</p></div>
    </section>
    <div class="scope-list">
      {#each history as scope (scope.id)}
        <article class="scope-row">
          <button class="icon-button" title={scope.pinned ? "取消置顶" : "置顶"} on:click={() => togglePinned(scope)}>
            <svg><use href={scope.pinned ? "#iconPin" : "#iconUnpin"}></use></svg>
          </button>
          <div class="scope-name">
            <strong>{scope.targetName}</strong>
            <span>{scope.groupName ? `应用分组：${scope.groupName}` : scope.type === "document" ? "文档范围" : scope.type === "notebook" ? "笔记本范围" : "SQL 分组"} · 使用 {scope.useCount} 次</span>
          </div>
          <button class="b3-button" on:click={() => onReviewScope(scope)}>开始复习</button>
          <button class="icon-button" title="移除最近记录" on:click={() => removeHistory(scope.id)}><svg><use href="#iconTrashcan"></use></svg></button>
        </article>
      {:else}<p class="empty">从插件菜单或 SQL 分组开始一次复习后，这里会显示最近范围。</p>{/each}
    </div>
  {:else if activeTab === "browser"}
    <section class="browser-toolbar">
      <input placeholder="搜索块 ID、内容或分组" bind:value={browserQuery} />
      <select bind:value={browserPriority} aria-label="优先级筛选">
        <option value="all">全部优先级</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option><option value="P4">P4</option><option value="none">无标签</option><option value="conflict">冲突</option>
      </select>
      <select bind:value={browserRenderer} aria-label="Renderer 筛选">
        <option value="all">全部形式</option><option value="mark">mark</option><option value="list">list</option><option value="heading">heading</option><option value="superBlock">superBlock</option><option value="blockquote">blockquote</option><option value="callout">callout</option><option value="unknown">未知</option>
      </select>
      <label class="check"><input type="checkbox" bind:checked={browserDueOnly} /> 仅到期</label>
      <button class="b3-button b3-button--outline" disabled={browserLoading} on:click={loadDiagnostics}>刷新</button>
    </section>
    <p class="browser-summary">显示 {visibleDiagnostics.length} / {diagnosticRows.length} 张；单次最多渲染 300 张。</p>
    <div class="diagnostic-list">
      {#each visibleDiagnostics as row (row.card.cardID)}
        <article class="diagnostic-row">
          <div class="diagnostic-main">
            <strong>{row.priorityConflict ? "优先级冲突" : row.priority ?? "无优先级"} · {row.renderer} · {row.due ? "已到期" : "未到期"}</strong>
            <span>{row.content || row.blockId}</span>
            <small>{row.blockId}{row.groupNames.length ? ` · ${row.groupNames.join(" / ")}` : " · 未命中启用分组"}</small>
          </div>
          <div class="diagnostic-actions">
            <button class="icon-button" title="定位原块" on:click={() => onLocateCard(row.card)}><svg><use href="#iconFocus"></use></svg></button>
            <select aria-label="修改优先级" value={row.priority ?? ""} on:change={(event) => setPriority(row, Number((event.currentTarget as HTMLSelectElement).value))}>
              <option value="" disabled>P</option><option value="100">P1</option><option value="75">P2</option><option value="50">P3</option><option value="25">P4</option>
            </select>
            <button class="icon-button" title="取消闪卡登记" on:click={() => onUnregisterCard(row.card)}><svg><use href="#iconCloseRound"></use></svg></button>
          </div>
        </article>
      {:else}<p class="empty">没有符合筛选条件的闪卡。</p>{/each}
    </div>
  {:else if activeTab === "global"}
    <section class="settings-grid">
      <label>牌组 ID<input bind:value={config.deckId} on:change={saveGlobalOnChange} /></label>
      <label>首轮上限<input type="number" min="1" max="1000" bind:value={config.maxReviewCards} on:change={saveGlobalOnChange} /></label>
      <label>向上传递深度<input type="number" min="1" max="32" bind:value={config.maxResolveDepth} on:change={saveGlobalOnChange} /></label>
      <label>缓存刷新（分钟）<input type="number" min="1" max="1440" bind:value={config.cacheUpdateInterval} on:change={saveGlobalOnChange} /></label>
      <label>缓存扫描（分钟）<input type="number" min="1" max="1440" bind:value={config.scanInterval} on:change={saveGlobalOnChange} /></label>
    </section>
    <section class="automation-panel">
      <label class="check"><input type="checkbox" bind:checked={config.postponeEnabled} on:change={saveGlobalOnChange} /> 自动推迟今日新卡</label>
      <label>推迟天数<input type="number" min="1" max="30" bind:value={config.postponeDays} on:change={saveGlobalOnChange} /></label>
      <button class="b3-button" on:click={updateGlobal} disabled={saving}>保存并应用自动化</button>
    </section>
    <section class="tool-settings">
      <h3>卡片渲染</h3>
      <label class="check"><input type="checkbox" bind:checked={config.rendererInterceptionEnabled} on:change={saveGlobalOnChange} /> 按卡片 renderer 直接覆盖原生隐藏规则</label>
      <p class="settings-hint">关闭后不修改卡片显示，完全使用思源的全局闪卡设置。</p>
      <div class="toolbar-options">
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.mark} on:change={saveGlobalOnChange} /> 隐藏高亮 / 挖空</label>
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.list} on:change={saveGlobalOnChange} /> 隐藏列表答案</label>
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.blockquote} on:change={saveGlobalOnChange} /> 隐藏引述块答案</label>
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.callout} on:change={saveGlobalOnChange} /> 隐藏提示块内容</label>
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.heading} on:change={saveGlobalOnChange} /> 隐藏标题后续内容</label>
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.superBlock} on:change={saveGlobalOnChange} /> 隐藏超级块内容</label>
        <label class="check"><input type="checkbox" bind:checked={config.rendererVisibility.tag} on:change={saveGlobalOnChange} /> 隐藏标签</label>
      </div>
      <h3>复习顺序</h3>
      <label class="check"><input type="checkbox" bind:checked={config.randomInterleaveEnabled} on:change={saveGlobalOnChange} /> 随机模式：将约 5% 的较低优先级卡插入高优先级区段</label>
      <h3>原生复习工具栏</h3>
      <label class="check"><input type="checkbox" bind:checked={config.reviewToolbarEnabled} on:change={saveGlobalOnChange} /> 启用工具栏增强</label>
      <div class="toolbar-options">
        <label class="check"><input type="checkbox" bind:checked={config.reviewToolbarLocate} on:change={saveGlobalOnChange} /> 定位原块</label>
        <label class="check"><input type="checkbox" bind:checked={config.reviewToolbarUnregister} on:change={saveGlobalOnChange} /> 取消登记</label>
        <label class="check"><input type="checkbox" bind:checked={config.reviewToolbarPriority} on:change={saveGlobalOnChange} /> P1-P4</label>
        <label class="check"><input type="checkbox" bind:checked={config.reviewToolbarWorkbench} on:change={saveGlobalOnChange} /> 打开工作台</label>
        <label class="check"><input type="checkbox" bind:checked={config.reviewToolbarRenderer} on:change={saveGlobalOnChange} /> 渲染开关</label>
      </div>
    </section>
  {:else}
    <div class="section-heading">
      <h3>SQL 分组</h3>
      <div class="toolbar-actions">
        <button class="b3-button b3-button--outline" on:click={addCategory}>新增分类</button>
        <button class="b3-button b3-button--outline" on:click={addGroup}>新增分组</button>
      </div>
    </div>

    <div class="categories" data-testid="flashcard-categories">
      {#each config.categories as category}
        <div class:active-category={activeCategoryId === category.id} class="category" data-category-id={category.id}>
          <button class="category-select" on:click={() => activeCategoryId = category.id}>{category.name} ({config.groups.filter((group) => group.categoryId === category.id).length})</button>
          <button class="icon-button" title="重命名分类" on:click={() => renameCategoryWithPrompt(category)}>编辑</button>
          {#if config.categories.length > 1}<button class="icon-button" title="删除分类" on:click={() => deleteCategory(category.id)}>删除</button>{/if}
        </div>
      {/each}
    </div>

    <div class="groups" data-testid="flashcard-groups">
    {#each visibleGroups as group (group.id)}
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
          <button class="b3-button b3-button--outline" on:click={() => saveGroup(group)}>保存分组</button>
        </div>
      </article>
    {:else}<p class="empty">当前分类暂无分组</p>{/each}
    </div>
  {/if}
  {#if message}<p class="message" role="status">{message}</p>{/if}
</div>

<style>
  .flashcard-settings { box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; padding: 20px; height: 100%; overflow: auto; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
  .settings-header, .section-heading, .group-row, .group-options, .toolbar-actions, .header-actions, .browser-toolbar, .toolbar-options { display: flex; align-items: center; gap: 10px; }
  .settings-header, .section-heading { justify-content: space-between; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }
  .settings-header p { margin-top: 4px; color: var(--b3-theme-on-surface-light); }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--b3-border-color); }
  .tabs button { border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; color: var(--b3-theme-on-surface-light); background: transparent; cursor: pointer; }
  .tabs button.active { color: var(--b3-theme-primary); border-bottom-color: var(--b3-theme-primary); }
  .instructions { line-height: 1.6; color: var(--b3-theme-on-background); }
  .instructions p { color: var(--b3-theme-on-surface-light); }
  .instructions li { margin: 8px 0; }
  .settings-grid, .automation-panel, .tool-settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--b3-theme-on-surface-light); }
  label.check { flex-direction: row; align-items: center; justify-content: flex-start; }
  input, textarea, select { min-width: 0; box-sizing: border-box; border: 1px solid var(--b3-border-color); border-radius: 4px; padding: 7px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
  .group { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--b3-border-color); border-radius: 6px; }
  .categories { display: flex; flex-wrap: wrap; gap: 8px; }
  .category { display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid var(--b3-border-color); border-radius: 4px; }
  .category.active-category { border-color: var(--b3-theme-primary); }
  .category-select { border: 0; color: inherit; background: transparent; cursor: pointer; }
  select { min-width: 100px; }
  .icon-button { min-width: 32px; padding-inline: 8px; }
  .group-row { flex-wrap: wrap; }
  .group-name { flex: 1 1 180px; font-weight: 600; }
  .group-options { flex-wrap: wrap; }
  .group-options label { min-width: 110px; }
  .message { color: var(--b3-theme-primary); }
  .empty { color: var(--b3-theme-on-surface-light); }
  .scope-list, .diagnostic-list { display: flex; flex-direction: column; gap: 8px; }
  .scope-row, .diagnostic-row { display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid var(--b3-border-color); }
  .scope-name, .diagnostic-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .scope-name span, .diagnostic-main span, .diagnostic-main small, .browser-summary, .section-heading p { overflow-wrap: anywhere; color: var(--b3-theme-on-surface-light); }
  .icon-button svg { width: 16px; height: 16px; }
  .browser-toolbar { flex-wrap: wrap; }
  .browser-toolbar > input { flex: 1 1 240px; }
  .diagnostic-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
  .tool-settings h3 { grid-column: 1 / -1; }
  .toolbar-options { grid-column: 1 / -1; flex-wrap: wrap; }
  @media (max-width: 700px) { .flashcard-settings { padding: 12px; } .group-row .b3-button { flex: 1 1 auto; } }
</style>
