<script lang="ts">
  import { type FlashcardDiagnosticRow, type FlashcardGroup, type FlashcardReviewHistoryItem, type FlashcardReviewScope, type FlashcardReviewStatKey, type FlashcardSettings } from "@/flashcard/types";
  import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";
  import type { FlashcardRuntime } from "@/flashcard/runtime";
  import {
    ArrowDown, ArrowUp, BookOpen, Boxes, CalendarClock, Crosshair, Database,
    Eye, FileText, Files, Filter, Focus, Gauge, Heading, Highlighter, History,
    Layers3, LayoutDashboard, ListTree, LocateFixed, MessageSquareText, PanelTop, Pencil, Percent, Pin,
    PinOff, Play, Plus, Quote, RefreshCw, Repeat2, RotateCcw, Save, Search,
    Settings2, SkipForward, SlidersHorizontal, Tags, Trash2, Unlink,
    Upload, X, XCircle,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Textarea } from "@/components/ui/textarea";
  import { Switch } from "@/components/ui/switch";
  import * as Tabs from "@/components/ui/tabs";
  import * as Select from "@/components/ui/select";
  import * as TreeView from "@/components/ui/tree-view";
  import { Badge } from "@/components/ui/badge";

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
  let editingCategoryId: string | undefined;
  let editingCategoryName = "";
  let visibleGroups: FlashcardGroup[] = [];
  let history = runtime.getHistory();
  let diagnosticRows: FlashcardDiagnosticRow[] = [];
  let browserLoading = false;
  let browserQuery = "";
  let browserPriority = "all";
  let browserRenderer = "all";
  let browserDueOnly = false;
  let visibleDiagnostics: FlashcardDiagnosticRow[] = [];
  let documentTreeOpen = true;
  let applicationTreeOpen = true;
  let readablePaths: Record<string, string> = {};
  const requestedPathIds = new Set<string>();
  const REVIEW_STAT_LABELS: Record<FlashcardReviewStatKey, string> = {
    reviews: "复习次数",
    lastReview: "距上次复习",
    lapses: "遗忘次数",
    lapseRate: "遗忘率",
    interval: "复习间隔",
  };
  const RENDERER_OPTIONS = [
    ["mark", "隐藏高亮 / 挖空", Highlighter], ["list", "隐藏列表答案", ListTree], ["blockquote", "隐藏引述块答案", Quote],
    ["callout", "隐藏提示块内容", MessageSquareText], ["heading", "隐藏标题后续内容", Heading], ["superBlock", "隐藏超级块内容", Boxes], ["tag", "隐藏标签", Tags],
  ] as const;
  const TOOLBAR_OPTIONS = [
    ["reviewToolbarLocate", "定位原块", Crosshair], ["reviewToolbarUnregister", "取消登记", Unlink], ["reviewToolbarPriority", "P1-P4", Gauge],
    ["reviewToolbarWorkbench", "打开工作台", LayoutDashboard], ["reviewToolbarRenderer", "渲染开关", Eye], ["reviewToolbarSkipBetween", "跳过置于 PQ 与显示答案之间", SkipForward],
    ["reviewToolbarShowExitFocus", "显示退出聚焦", Focus], ["reviewToolbarShowBrand", "显示闪卡标题", PanelTop],
  ] as const;
  const REVIEW_STAT_ICONS = {
    reviews: Repeat2,
    lastReview: CalendarClock,
    lapses: RotateCcw,
    lapseRate: Percent,
    interval: History,
  };

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
  $: documentHistory = history.filter((scope) => !scope.groupName && scope.type !== "group");
  $: applicationScopeGroups = groupApplicationScopes(history.filter((scope) => Boolean(scope.groupName) || scope.type === "group"));
  function scopeBlockId(scope: FlashcardReviewScope): string {
    const candidate = `${scope.targetId ?? ""} ${scope.targetName} ${scope.id}`;
    return candidate.match(/\d{14}-[a-z0-9]{7}/u)?.[0] ?? "";
  }

  function displayScopeName(scope: FlashcardReviewScope, paths: Record<string, string>): string {
    const blockId = scopeBlockId(scope);
    return blockId ? paths[blockId] ?? "当前文档" : scope.targetName;
  }

  function displayBlockPath(blockId: string, paths: Record<string, string>): string {
    return paths[blockId] ?? "当前文档";
  }

  function groupApplicationScopes(scopes: FlashcardReviewHistoryItem[]): Array<{ name: string; scopes: FlashcardReviewHistoryItem[] }> {
    const groups = new Map<string, FlashcardReviewHistoryItem[]>();
    for (const scope of scopes) {
      const name = scope.groupName ?? scope.targetName;
      groups.set(name, [...(groups.get(name) ?? []), scope]);
    }
    return [...groups].map(([name, groupedScopes]) => ({ name, scopes: groupedScopes }));
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

  function fullLastUsed(timestamp: number): string {
    return Number.isFinite(timestamp) && timestamp > 0
      ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(timestamp))
      : "时间未知";
  }

  async function ensureReadablePaths(ids: string[]): Promise<void> {
    const pending = [...new Set(ids.filter(Boolean))].filter((id) => !requestedPathIds.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => requestedPathIds.add(id));
    const entries = await Promise.all(pending.map(async (id) => {
      try {
        return [id, await runtime.getReadablePath(id)] as const;
      } catch {
        return [id, "文档路径不可用"] as const;
      }
    }));
    readablePaths = { ...readablePaths, ...Object.fromEntries(entries) };
  }

  void ensureReadablePaths(history.map(scopeBlockId));

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
    void ensureReadablePaths(history.map(scopeBlockId));
  }

  async function removeHistory(scopeId: string): Promise<void> {
    await runtime.removeScopeHistory(scopeId);
    history = runtime.getHistory();
  }

  async function loadDiagnostics(): Promise<void> {
    browserLoading = true;
    try {
      diagnosticRows = await runtime.buildDiagnostics();
      await ensureReadablePaths(diagnosticRows.map((row) => row.blockId));
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

  function setBooleanSetting(key: typeof TOOLBAR_OPTIONS[number][0], value: boolean): void {
    (config as unknown as Record<string, unknown>)[key] = value;
    saveGlobalOnChange();
  }

  function moveReviewStat(key: FlashcardReviewStatKey, direction: "up" | "down"): void {
    const order = [...config.reviewStats.order];
    const index = order.indexOf(key);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    config = { ...config, reviewStats: { ...config.reviewStats, order } };
    saveGlobalOnChange();
  }

  async function clearCache(): Promise<void> {
    await runtime.clearCache();
    message = "已清除 SQL 缓存";
  }

  function startCategoryRename(category: { id: string; name: string }): void {
    editingCategoryId = category.id;
    editingCategoryName = category.name;
  }

  function cancelCategoryRename(): void {
    editingCategoryId = undefined;
    editingCategoryName = "";
  }

  async function commitCategoryRename(category: { id: string; name: string }): Promise<void> {
    const name = editingCategoryName.trim();
    if (!name) {
      message = "分类名称不能为空";
      return;
    }
    if (name !== category.name) await renameCategory({ ...category, name });
    cancelCategoryRename();
  }
</script>

<div class="flashcard-settings damophus-theme-root damophus-question-bank-theme" data-testid="flashcard-settings">
  <header class="settings-header">
    <div class="settings-title"><Layers3 aria-hidden="true" /><strong>专项闪卡</strong></div>
    <div class="flashcard-header-actions">
      <Button size="sm" onclick={onReviewAll} title="打开全部到期卡" aria-label="打开全部到期卡"><Play /><span>全部到期</span></Button>
      <Button variant="outline" size="sm" onclick={clearCache} title="清除 SQL 缓存" aria-label="清除 SQL 缓存"><RefreshCw /><span>刷新缓存</span></Button>
      <Button variant="outline" size="sm" onclick={onImportSfp} title="导入 Specialized Flashcard Plugin 的分组设置" aria-label="导入 SFP 设置"><Upload /><span>导入 SFP</span></Button>
    </div>
  </header>

  <Tabs.Root bind:value={activeTab}>
    <Tabs.List class="flashcard-workbench-tabs" aria-label="闪卡设置">
      <Tabs.Trigger value="recent" title="最近范围" aria-label="最近范围" onclick={() => history = runtime.getHistory()}><History /><span>最近范围</span></Tabs.Trigger>
      <Tabs.Trigger value="groups" title="SQL 分组" aria-label="SQL 分组"><Database /><span>SQL 分组</span></Tabs.Trigger>
      <Tabs.Trigger value="browser" title="闪卡浏览器" aria-label="闪卡浏览器" onclick={() => { if (diagnosticRows.length === 0) void loadDiagnostics(); }}><Search /><span>闪卡浏览器</span></Tabs.Trigger>
      <Tabs.Trigger value="global" title="总体配置" aria-label="总体配置"><SlidersHorizontal /><span>总体配置</span></Tabs.Trigger>
      <Tabs.Trigger value="instructions" title="使用说明" aria-label="使用说明"><BookOpen /><span>使用说明</span></Tabs.Trigger>
    </Tabs.List>
  </Tabs.Root>

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
    {#if history.length}
      <TreeView.Root class="scope-tree" aria-label="最近复习范围">
        {#if documentHistory.length}
          <TreeView.Folder name={`文档范围 (${documentHistory.length})`} bind:open={documentTreeOpen} class="tree-branch">
            {#each documentHistory as scope (scope.id)}
              <article class="tree-leaf-row">
                <Button variant="ghost" size="icon-sm" title={scope.pinned ? "取消置顶" : "置顶"} aria-label={scope.pinned ? "取消置顶" : "置顶"} onclick={() => togglePinned(scope)}>{#if scope.pinned}<PinOff />{:else}<Pin />{/if}</Button>
                <TreeView.File class="tree-leaf" name={displayScopeName(scope, readablePaths)} title={`${displayScopeName(scope, readablePaths)}\n${fullLastUsed(scope.lastUsedAt)}`} onclick={() => onReviewScope(scope)} />
                <Badge variant="secondary" title={fullLastUsed(scope.lastUsedAt)}>{formatLastUsed(scope.lastUsedAt)} · {scope.useCount} 次</Badge>
                <Button variant="ghost" size="icon-sm" title="移除最近记录" aria-label="移除最近记录" onclick={() => removeHistory(scope.id)}><Trash2 /></Button>
              </article>
            {/each}
          </TreeView.Folder>
        {/if}
        {#if applicationScopeGroups.length}
          <TreeView.Folder name={`应用分组 (${applicationScopeGroups.length})`} bind:open={applicationTreeOpen} class="tree-branch">
            {#each applicationScopeGroups as group (group.name)}
              <TreeView.Folder name={`${group.name} (${group.scopes.length})`} class="tree-subbranch">
                {#each group.scopes as scope (scope.id)}
                  <article class="tree-leaf-row">
                    <Button variant="ghost" size="icon-sm" title={scope.pinned ? "取消置顶" : "置顶"} aria-label={scope.pinned ? "取消置顶" : "置顶"} onclick={() => togglePinned(scope)}>{#if scope.pinned}<PinOff />{:else}<Pin />{/if}</Button>
                    <TreeView.File class="tree-leaf" name={displayScopeName(scope, readablePaths)} title={`${displayScopeName(scope, readablePaths)}\n${fullLastUsed(scope.lastUsedAt)}`} onclick={() => onReviewScope(scope)} />
                    <Badge variant="secondary" title={fullLastUsed(scope.lastUsedAt)}>{formatLastUsed(scope.lastUsedAt)} · {scope.useCount} 次</Badge>
                    <Button variant="ghost" size="icon-sm" title="移除最近记录" aria-label="移除最近记录" onclick={() => removeHistory(scope.id)}><Trash2 /></Button>
                  </article>
                {/each}
              </TreeView.Folder>
            {/each}
          </TreeView.Folder>
        {/if}
      </TreeView.Root>
    {:else}<p class="empty">从插件菜单或 SQL 分组开始一次复习后，这里会显示最近范围。</p>{/if}
  {:else if activeTab === "browser"}
    <section class="browser-toolbar">
      <Input placeholder="搜索内容、路径或分组" bind:value={browserQuery} />
      <Select.Root type="single" value={browserPriority} onValueChange={(value) => browserPriority = value}>
        <Select.Trigger aria-label="优先级筛选">{{ all: "全部优先级", none: "无标签", conflict: "冲突" }[browserPriority] ?? browserPriority}</Select.Trigger>
        <Select.Content>{#each [["all", "全部优先级"], ["P1", "P1"], ["P2", "P2"], ["P3", "P3"], ["P4", "P4"], ["none", "无标签"], ["conflict", "冲突"]] as option}<Select.Item value={option[0]} label={option[1]} />{/each}</Select.Content>
      </Select.Root>
      <Select.Root type="single" value={browserRenderer} onValueChange={(value) => browserRenderer = value}>
        <Select.Trigger aria-label="Renderer 筛选">{browserRenderer === "all" ? "全部形式" : browserRenderer === "unknown" ? "未知" : browserRenderer}</Select.Trigger>
        <Select.Content>{#each ["all", "mark", "list", "heading", "superBlock", "blockquote", "callout", "unknown"] as renderer}<Select.Item value={renderer} label={renderer === "all" ? "全部形式" : renderer === "unknown" ? "未知" : renderer} />{/each}</Select.Content>
      </Select.Root>
      <label class="inline-switch"><span>仅到期</span><Switch size="sm" checked={browserDueOnly} onCheckedChange={(value) => browserDueOnly = value} aria-label="仅显示到期卡" /></label>
      <Button variant="outline" size="sm" disabled={browserLoading} onclick={loadDiagnostics}><RefreshCw />刷新</Button>
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
            <Select.Root type="single" value={row.priority ?? ""} onValueChange={(value) => setPriority(row, ({ P1: 100, P2: 75, P3: 50, P4: 25 } as Record<string, number>)[value])}>
              <Select.Trigger size="sm" aria-label="修改优先级">{row.priority ?? "P"}</Select.Trigger>
              <Select.Content>{#each ["P1", "P2", "P3", "P4"] as priority}<Select.Item value={priority} label={priority} />{/each}</Select.Content>
            </Select.Root>
            <Button variant="destructive" size="icon-sm" title="取消闪卡登记" aria-label="取消闪卡登记" onclick={() => onUnregisterCard(row.card)}><XCircle /></Button>
          </div>
        </article>
      {:else}<p class="empty">没有符合筛选条件的闪卡。</p>{/each}
    </div>
  {:else if activeTab === "global"}
    <div class="global-settings">
      <section class="settings-section">
        <div class="section-title"><Settings2 /><div><h3>基础与自动化</h3><p>牌组、扫描频率和新卡处理</p></div></div>
        <div class="field-grid">
          <label>牌组 ID<Input bind:value={config.deckId} onchange={saveGlobalOnChange} /></label>
          <label>首轮上限<Input type="number" min="1" max="1000" bind:value={config.maxReviewCards} onchange={saveGlobalOnChange} /></label>
          <label>向上传递深度<Input type="number" min="1" max="32" bind:value={config.maxResolveDepth} onchange={saveGlobalOnChange} /></label>
          <label>缓存刷新（分钟）<Input type="number" min="1" max="1440" bind:value={config.cacheUpdateInterval} onchange={saveGlobalOnChange} /></label>
          <label>缓存扫描（分钟）<Input type="number" min="1" max="1440" bind:value={config.scanInterval} onchange={saveGlobalOnChange} /></label>
          <label>推迟天数<Input type="number" min="1" max="30" bind:value={config.postponeDays} onchange={saveGlobalOnChange} disabled={!config.postponeEnabled} /></label>
        </div>
        <div class="setting-row"><div><strong>自动推迟今日新卡</strong><span>按设定天数延后今天创建的新卡</span></div><Switch checked={config.postponeEnabled} onCheckedChange={(value) => { config.postponeEnabled = value; saveGlobalOnChange(); }} aria-label="自动推迟今日新卡" /></div>
        <div class="section-actions"><Button size="sm" onclick={updateGlobal} disabled={saving}><Save />保存并应用</Button></div>
      </section>

      <section class="settings-section">
        <div class="section-title"><LocateFixed /><div><h3>文档入口</h3><p>控制编辑器中的快捷入口</p></div></div>
        <div class="setting-row"><div><strong>显示面包屑闪卡按钮</strong><span>在当前文档面包屑中提供快速复习</span></div><Switch checked={config.showBreadcrumbReviewButton} onCheckedChange={(value) => { config.showBreadcrumbReviewButton = value; saveGlobalOnChange(); }} aria-label="显示面包屑闪卡按钮" /></div>
      </section>

      <section class="settings-section">
        <div class="section-title"><Layers3 /><div><h3>卡片渲染</h3><p>按卡片 renderer 应用专属隐藏范围</p></div></div>
        <div class="setting-row master-row"><div><strong>启用卡片渲染适配</strong><span>关闭后完全沿用思源的全局闪卡设置</span></div><Switch checked={config.rendererInterceptionEnabled} onCheckedChange={(value) => { config.rendererInterceptionEnabled = value; saveGlobalOnChange(); }} aria-label="启用卡片渲染适配" /></div>
        {#if config.rendererInterceptionEnabled}
          <div class="option-grid" data-testid="renderer-options">
            {#each RENDERER_OPTIONS as option}
              <div class="option-row"><svelte:component this={option[2]} aria-hidden="true" /><span>{option[1]}</span><Switch size="sm" checked={config.rendererVisibility[option[0]]} onCheckedChange={(value) => { config.rendererVisibility[option[0]] = value; saveGlobalOnChange(); }} aria-label={option[1]} /></div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="settings-section">
        <div class="section-title"><RefreshCw /><div><h3>复习顺序</h3><p>优先级队列中的随机策略</p></div></div>
        <div class="setting-row"><div><strong>随机穿插</strong><span>将约 5% 的较低优先级卡插入高优先级区段</span></div><Switch checked={config.randomInterleaveEnabled} onCheckedChange={(value) => { config.randomInterleaveEnabled = value; saveGlobalOnChange(); }} aria-label="随机穿插" /></div>
        <div class="setting-row"><div><strong>同级随机</strong><span>每轮打乱同一优先级内的卡片顺序</span></div><Switch checked={config.samePriorityShuffleEnabled} onCheckedChange={(value) => { config.samePriorityShuffleEnabled = value; saveGlobalOnChange(); }} aria-label="同级随机" /></div>
      </section>

      <section class="settings-section">
        <div class="section-title"><SlidersHorizontal /><div><h3>当前卡片信息</h3><p>选择统计项并调整显示顺序</p></div></div>
        <div class="setting-row master-row"><div><strong>显示当前卡片统计</strong><span>在原生复习界面显示复习数据</span></div><Switch checked={config.reviewStats.enabled} onCheckedChange={(value) => { config.reviewStats.enabled = value; saveGlobalOnChange(); }} aria-label="显示当前卡片统计" /></div>
        {#if config.reviewStats.enabled}
          <div class="sortable-list" data-testid="review-stat-options">
            {#each config.reviewStats.order as statKey, index (statKey)}
              <div class="sortable-row">
                <svelte:component this={REVIEW_STAT_ICONS[statKey]} aria-hidden="true" />
                <Switch size="sm" checked={config.reviewStats.visible[statKey]} onCheckedChange={(value) => { config.reviewStats.visible[statKey] = value; saveGlobalOnChange(); }} aria-label={`显示${REVIEW_STAT_LABELS[statKey]}`} />
                <span>{REVIEW_STAT_LABELS[statKey]}</span>
                <div class="sort-actions">
                  <Button variant="ghost" size="icon-xs" title="上移" aria-label={`${REVIEW_STAT_LABELS[statKey]}上移`} disabled={index === 0} onclick={() => moveReviewStat(statKey, "up")}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-xs" title="下移" aria-label={`${REVIEW_STAT_LABELS[statKey]}下移`} disabled={index === config.reviewStats.order.length - 1} onclick={() => moveReviewStat(statKey, "down")}><ArrowDown /></Button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="settings-section">
        <div class="section-title"><Settings2 /><div><h3>原生复习工具栏</h3><p>选择复习界面中需要的快捷操作</p></div></div>
        <div class="setting-row master-row"><div><strong>启用工具栏增强</strong><span>将 DAMO 操作融合进原生复习界面</span></div><Switch checked={config.reviewToolbarEnabled} onCheckedChange={(value) => { config.reviewToolbarEnabled = value; saveGlobalOnChange(); }} aria-label="启用工具栏增强" /></div>
        {#if config.reviewToolbarEnabled}
          <div class="option-grid" data-testid="toolbar-options">
            {#each TOOLBAR_OPTIONS as option}
              <div class="option-row"><svelte:component this={option[2]} aria-hidden="true" /><span>{option[1]}</span><Switch size="sm" checked={config[option[0]]} onCheckedChange={(value) => setBooleanSetting(option[0], value)} aria-label={option[1]} /></div>
            {/each}
          </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="section-heading">
      <h3>SQL 分组</h3>
      <div class="toolbar-actions">
        <Button variant="outline" size="sm" onclick={addCategory}><Plus />新增分类</Button>
        <Button size="sm" onclick={addGroup}><Plus />新增分组</Button>
      </div>
    </div>

    <div class="categories" data-testid="flashcard-categories">
      {#each config.categories as category}
        <div class:active-category={activeCategoryId === category.id} class="category" data-category-id={category.id}>
          {#if editingCategoryId === category.id}
            <Input
              class="category-name-input"
              aria-label="分类名称"
              bind:value={editingCategoryName}
              onkeydown={(event) => {
                if (event.key === "Enter") void commitCategoryRename(category);
                if (event.key === "Escape") cancelCategoryRename();
              }}
            />
            <Button variant="ghost" size="icon-sm" title="保存分类名称" aria-label="保存分类名称" onclick={() => void commitCategoryRename(category)}><Save /></Button>
            <Button variant="ghost" size="icon-sm" title="取消编辑" aria-label="取消编辑" onclick={cancelCategoryRename}><X /></Button>
          {:else}
            <button class="category-select" onclick={() => activeCategoryId = category.id}>{category.name} ({config.groups.filter((group) => group.categoryId === category.id).length})</button>
            <Button variant="ghost" size="icon-sm" title="重命名分类" aria-label="重命名分类" onclick={() => startCategoryRename(category)}><Pencil /></Button>
          {/if}
          {#if config.categories.length > 1}<Button variant="destructive" size="icon-sm" title="删除分类" aria-label="删除分类" onclick={() => deleteCategory(category.id)}><Trash2 /></Button>{/if}
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
          <Button variant="ghost" size="icon-sm" onclick={() => moveGroup(group, "up")} title="上移" aria-label="分组上移"><ArrowUp /></Button>
          <Button variant="ghost" size="icon-sm" onclick={() => moveGroup(group, "down")} title="下移" aria-label="分组下移"><ArrowDown /></Button>
          <Button size="sm" onclick={() => onReviewGroup(group)}><Play />复习到期卡</Button>
          <div class="group-action-strip" aria-label="分组操作">
            <Button variant="ghost" size="icon-sm" title="查看原始结果" aria-label="查看原始结果" onclick={() => onViewResults(group, false)}><Eye /></Button>
            <Button variant="ghost" size="icon-sm" title="查看过滤结果" aria-label="查看过滤结果" onclick={() => onViewResults(group, true)}><Filter /></Button>
            <Button variant="ghost" size="icon-sm" title="打开原始文档流" aria-label="打开原始文档流" onclick={() => onOpenRaw(group)}><FileText /></Button>
            <Button variant="ghost" size="icon-sm" title="打开全部文档流" aria-label="打开全部文档流" onclick={() => onOpenFiltered(group)}><Files /></Button>
            <Button variant="ghost" size="icon-sm" title="批量调整优先级" aria-label="批量调整优先级" onclick={() => onBatchPriority(group)}><Gauge /></Button>
            <Button variant="destructive" size="icon-sm" title="删除分组" aria-label="删除分组" onclick={() => deleteGroup(group)}><Trash2 /></Button>
          </div>
        </div>
        <Textarea aria-label="SQL 查询" bind:value={group.sqlQuery} rows={3} />
        <div class="group-options">
          <label>缓存分钟<Input type="number" min="1" bind:value={group.cacheMinutes} /></label>
          <Button variant="outline" size="sm" onclick={() => saveGroup(group)}><Save />保存分组</Button>
        </div>
      </article>
    {:else}<p class="empty">当前分类暂无分组</p>{/each}
    </div>
  {/if}
  {#if message}<p class="message" role="status">{message}</p>{/if}
</div>

<style>
  :global(.flashcard-settings *) { box-sizing: border-box; }
  .flashcard-settings {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    height: 100%;
    padding: 14px 16px 24px;
    overflow: auto;
    color: var(--foreground, var(--b3-theme-on-background));
    background: var(--background, var(--b3-theme-background));
  }
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
  .settings-header, .section-heading, .flashcard-header-actions, .toolbar-actions, .browser-toolbar, .group-row, .group-options {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .settings-header {
    position: sticky;
    top: -14px;
    z-index: 3;
    justify-content: space-between;
    min-height: 42px;
    padding: 8px 0;
    background: var(--background, var(--b3-theme-background));
    border-bottom: 1px solid var(--border, var(--b3-border-color));
  }
  .settings-title { display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 14px; }
  .settings-title :global(svg), .section-title > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .flashcard-header-actions {
    display: flex !important;
    flex: 0 0 auto;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    justify-content: flex-end;
    min-width: 0;
  }
  .flashcard-settings { scrollbar-width: thin; scrollbar-color: var(--b3-scroll-color, var(--border)) transparent; }
  .flashcard-settings::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  .flashcard-settings::-webkit-scrollbar-track { background: transparent; }
  .flashcard-settings::-webkit-scrollbar-thumb { background: var(--b3-scroll-color, var(--border)); border-radius: 6px; }
  .flashcard-settings :global(.flashcard-workbench-tabs) {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    width: 100%;
    height: 36px;
    padding: 3px;
    border: 1px solid var(--border, var(--b3-border-color));
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 7%, var(--background, var(--b3-theme-background)));
  }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"]) {
    min-width: 0;
    font-size: 12px;
    color: color-mix(in srgb, var(--foreground, var(--b3-theme-on-background)) 72%, transparent) !important;
    background: transparent !important;
  }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"][data-state="active"]) {
    color: var(--primary, var(--b3-theme-primary)) !important;
    background: var(--background, var(--b3-theme-background)) !important;
    border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 35%, transparent);
  }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] svg) { width: 15px; height: 15px; }
  .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] span) { overflow: hidden; text-overflow: ellipsis; }
  .section-heading { justify-content: space-between; min-height: 38px; }
  .section-heading > div:first-child { min-width: 0; }
  .section-heading p, .section-title p, .setting-row span, .diagnostic-main span, .diagnostic-main small, .browser-summary, .empty {
    color: var(--muted-foreground, var(--b3-theme-on-surface-light));
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .instructions { max-width: 820px; line-height: 1.65; }
  .instructions p { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); }
  .instructions li { margin: 7px 0; }
  label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; }
  .inline-switch { flex-direction: row; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; color: var(--foreground, var(--b3-theme-on-background)); white-space: nowrap; }
  .global-settings, .groups, .diagnostic-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .settings-section, .group {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid var(--border, var(--b3-border-color));
    border-radius: 8px;
    background: var(--card, var(--b3-theme-background));
  }
  .section-title { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 9px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .section-title > div { min-width: 0; }
  .field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding: 9px 0; }
  .setting-row + .setting-row { border-top: 1px solid var(--border, var(--b3-border-color)); }
  .setting-row > div { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
  .setting-row strong { font-size: 13px; font-weight: 550; }
  .master-row { background: color-mix(in srgb, var(--muted, var(--b3-theme-surface)) 45%, transparent); margin-inline: -12px; padding-inline: 12px; }
  .option-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 18px; padding: 4px 0 8px; }
  .option-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 42px; border-bottom: 1px solid var(--border, var(--b3-border-color)); font-size: 12px; }
  .option-row > :global(svg), .sortable-row > :global(svg) { width: 15px; height: 15px; color: var(--primary, var(--b3-theme-primary)); }
  .option-row:nth-last-child(-n + 2) { border-bottom-color: transparent; }
  .sortable-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 18px; padding: 5px 0 8px; }
  .sortable-row { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto; align-items: center; min-height: 40px; border-bottom: 1px solid var(--border, var(--b3-border-color)); font-size: 12px; }
  .sortable-row:last-child { border-bottom: 0; }
  .sort-actions { display: flex; gap: 2px; }
  .section-actions { display: flex; justify-content: flex-end; padding: 10px 0; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .diagnostic-row { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px 4px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .diagnostic-main { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
  .diagnostic-actions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
  .browser-toolbar { flex-wrap: wrap; }
  .browser-toolbar > :global([data-slot="input"]) { flex: 1 1 220px; }
  .browser-toolbar > :global([data-slot="select-trigger"]) { flex: 0 1 150px; }
  .categories { display: flex; flex-wrap: wrap; gap: 6px; }
  .category { display: flex; align-items: center; gap: 2px; min-width: 0; padding: 3px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: var(--card, var(--b3-theme-background)); }
  .category.active-category { border-color: var(--primary, var(--b3-theme-primary)); }
  .category-select { min-height: 28px; padding: 4px 7px; border: 0; color: inherit; background: transparent; cursor: pointer; }
  :global(.category-name-input) { min-width: 140px; font-weight: 600; }
  .group { gap: 10px; padding-block: 12px; }
  .group-row { flex-wrap: wrap; }
  :global(.group-name) { flex: 1 1 180px; font-weight: 600; }
  .group-options { flex-wrap: wrap; justify-content: space-between; }
  .group-action-strip { display: flex; align-items: center; gap: 2px; }
  .group-options label { min-width: 110px; }
  :global(.scope-tree) { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  :global(.tree-branch), :global(.tree-subbranch) { width: 100%; min-height: 36px; padding: 6px 8px; border-radius: 6px; color: var(--foreground, var(--b3-theme-on-background)); font-size: 13px; font-weight: 600; }
  :global(.tree-branch:hover), :global(.tree-subbranch:hover) { background: var(--muted, var(--b3-list-hover)); }
  :global(.tree-subbranch) { min-height: 32px; font-size: 12px; }
  .tree-leaf-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto 28px; align-items: center; gap: 5px; min-width: 0; min-height: 42px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  :global(.tree-leaf) { min-width: 0; width: 100%; justify-content: flex-start; color: var(--foreground, var(--b3-theme-on-background)); text-align: left; }
  :global(.tree-leaf span) { min-width: 0; line-height: 1.45; overflow-wrap: anywhere; white-space: normal; }
  .tree-leaf-row > :global([data-slot="badge"]) { max-width: 145px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .message { position: sticky; bottom: 0; align-self: flex-start; margin: 0; padding: 5px 8px; color: var(--primary, var(--b3-theme-primary)); background: var(--background, var(--b3-theme-background)); border: 1px solid var(--border, var(--b3-border-color)); border-radius: 6px; font-size: 12px; }

  @container (max-width: 620px) {
    .flashcard-settings { gap: 10px; padding: 10px 10px 20px; }
    .settings-header { top: -10px; min-height: 38px; }
    .settings-title strong { font-size: 13px; }
    .flashcard-header-actions :global([data-slot="button"] span) { display: none; }
    .flashcard-header-actions :global([data-slot="button"]) { width: 28px; padding: 0; }
    .flashcard-settings :global(.flashcard-workbench-tabs) { height: 34px; }
    .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"] span) { display: none; }
    .flashcard-settings :global(.flashcard-workbench-tabs [data-slot="tabs-trigger"]) { padding-inline: 0; }
    .field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .tree-leaf-row { grid-template-columns: 28px minmax(0, 1fr) 28px; padding-block: 4px; }
    .tree-leaf-row > :global([data-slot="badge"]) { grid-column: 2; grid-row: 2; justify-self: start; max-width: 100%; }
    .tree-leaf-row > :global([data-slot="button"]:last-child) { grid-column: 3; grid-row: 1; }
    .diagnostic-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; }
    .diagnostic-actions { align-self: center; justify-content: flex-end; }
    .browser-toolbar > :global([data-slot="input"]) { flex-basis: 100%; }
    .browser-toolbar > :global([data-slot="select-trigger"]) { flex: 1 1 120px; }
    .group-row > :global([data-slot="button"]:not([data-size])) { flex: 1 1 auto; }
  }

  @container (max-width: 390px) {
    .settings-title strong { display: none; }
    .field-grid { grid-template-columns: 1fr; }
    .option-grid, .sortable-list { grid-template-columns: 1fr; }
    .setting-row { gap: 10px; }
    .toolbar-actions :global([data-slot="button"]), .section-actions :global([data-slot="button"]) { flex: 1; }
  }
</style>
