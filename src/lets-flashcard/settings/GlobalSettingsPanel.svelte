<script lang="ts">
  import {
    ArrowDown, ArrowUp, Boxes, CalendarClock, Check, Crosshair, Eye, Filter, Focus, Gauge, Heading,
    Highlighter, History, Layers3, LayoutDashboard, ListTree, LocateFixed, Maximize2, MessageSquareText,
    Network, PanelTop, Percent, Plus, Quote, RefreshCw, Repeat2, RotateCcw, Save, Settings2, SkipForward,
    SlidersHorizontal, Tags, Timer, Unlink,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import * as ToggleGroup from "@/components/ui/toggle-group";
  import type { ReviewToolbarAction } from "@/flashcard/review-action-registry";
  import type { FlashcardCategoryConfig, FlashcardCategoryRule } from "@/flashcard/category-module";
  import type { FlashcardReviewStatKey, FlashcardSettings } from "@/flashcard/types";

  export let config: FlashcardSettings;
  export let categoryConfig: FlashcardCategoryConfig | undefined;
  export let saving: boolean;
  export let toolbarActionRows: Array<{ action: ReviewToolbarAction; enabled: boolean }>;
  export let onSaveGlobalOnChange: () => void;
  export let onUpdateGlobal: () => void;
  export let onSaveCategoryConfig: (config: FlashcardCategoryConfig) => void | Promise<void>;
  export let onMoveCategory: (rule: FlashcardCategoryRule, direction: "up" | "down") => void;
  export let onAddFlashcardCategoryRule: () => void;
  export let onSetBooleanSetting: (key: typeof TOOLBAR_OPTIONS[number][0], value: boolean) => void;
  export let onSetToolbarActionEnabled: (id: string, enabled: boolean) => void;
  export let onMoveToolbarAction: (id: string, direction: "up" | "down") => void;
  export let onResetToolbarActions: () => void;
  export let onUpdateToolbarStyle: (key: keyof FlashcardSettings["reviewToolbarStyle"], value: string | number) => void;
  export let onMoveReviewStat: (key: FlashcardReviewStatKey, direction: "up" | "down") => void;

  const STYLE_TAG = "style";

  const REVIEW_STAT_LABELS: Record<FlashcardReviewStatKey, string> = {
    reviews: "复习次数",
    lastReview: "距上次复习",
    lapses: "遗忘次数",
    lapseRate: "遗忘率",
    interval: "复习间隔",
  };
  const RENDERER_OPTIONS = [
    ["mark", "隐藏高亮 / 挖空", Highlighter], ["list", "隐藏列表答案", ListTree], ["blockquote", "隐藏引述块答案", Quote],
    ["callout", "隐藏提示块内容", MessageSquareText], ["heading", "隐藏标题后续内容", Heading], ["superBlock", "隐藏超级块内容", Boxes], ["tag", "隐藏标签", Tags], ["topicRelations", "隐藏考点关系", Network],
  ] as const;
  const TOOLBAR_OPTIONS = [
    ["reviewToolbarLocate", "定位原块", Crosshair], ["reviewToolbarUnregister", "取消登记", Unlink], ["reviewToolbarPriority", "P1-P4", Gauge],
    ["reviewToolbarWorkbench", "打开工作台", LayoutDashboard], ["reviewToolbarRenderer", "渲染开关", Eye], ["reviewToolbarSkipBetween", "跳过置于 PQ 与显示答案之间", SkipForward],
    ["reviewToolbarShowExitFocus", "显示退出聚焦", Focus], ["reviewToolbarShowBrand", "显示闪卡标题", PanelTop],
    ["reviewToolbarShowFilter", "显示原生筛选", Filter], ["reviewToolbarShowFullscreen", "显示原生全屏", Maximize2],
  ] as const;
  const REVIEW_STAT_ICONS = {
    reviews: Repeat2,
    lastReview: CalendarClock,
    lapses: RotateCcw,
    lapseRate: Percent,
    interval: History,
  };
</script>

<div class="global-settings">
  <section class="settings-section">
    <div class="section-title"><Settings2 /><div><h3>基础与自动化</h3><p>牌组、扫描频率和新卡处理</p></div></div>
    <div class="field-grid">
      <label>牌组 ID<Input bind:value={config.deckId} onchange={onSaveGlobalOnChange} /></label>
      <label>首轮上限<Input type="number" min="1" max="1000" bind:value={config.maxReviewCards} onchange={onSaveGlobalOnChange} /></label>
      <label>向上传递深度<Input type="number" min="1" max="32" bind:value={config.maxResolveDepth} onchange={onSaveGlobalOnChange} /></label>
      <label>缓存刷新（分钟）<Input type="number" min="1" max="1440" bind:value={config.cacheUpdateInterval} onchange={onSaveGlobalOnChange} /></label>
      <label>缓存扫描（分钟）<Input type="number" min="1" max="1440" bind:value={config.scanInterval} onchange={onSaveGlobalOnChange} /></label>
      <label>推迟天数<Input type="number" min="1" max="30" bind:value={config.postponeDays} onchange={onSaveGlobalOnChange} disabled={!config.postponeEnabled} /></label>
    </div>
    <div class="setting-row review-mode-row">
      <div><strong>分组取卡模式</strong><span>用于 SQL 分组及其文档、笔记本组合范围</span></div>
      <ToggleGroup.Root
        type="single"
        variant="outline"
        class="review-mode-toggle"
        value={config.scopedReviewMode}
        onValueChange={(value) => {
          if (!value) return;
          config.scopedReviewMode = value === "native" ? "native" : "exact";
          onSaveGlobalOnChange();
        }}
        aria-label="分组取卡模式"
      >
        <ToggleGroup.Item value="exact" title="精确分组" aria-label="精确分组">
          <Crosshair aria-hidden="true" />
          <span>精确分组</span>
          {#if config.scopedReviewMode === "exact"}<Check class="review-mode-check" data-review-mode-check="exact" aria-hidden="true" />{/if}
        </ToggleGroup.Item>
        <ToggleGroup.Item value="native" title="原生过滤" aria-label="原生过滤">
          <Filter aria-hidden="true" />
          <span>原生过滤</span>
          {#if config.scopedReviewMode === "native"}<Check class="review-mode-check" data-review-mode-check="native" aria-hidden="true" />{/if}
        </ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>
    <div class="setting-row"><div><strong>自动推迟今日新卡</strong><span>按设定天数延后今天创建的新卡</span></div><Switch checked={config.postponeEnabled} onCheckedChange={(value) => { config.postponeEnabled = value; onSaveGlobalOnChange(); }} aria-label="自动推迟今日新卡" /></div>
    <div class="setting-row"><div><strong>孪生卡进度同步</strong><span>按 custom-dm-card-id 分组，把组内最新的到期时间对齐到其余副本；未制卡或已删除的副本自动跳过</span></div><Switch checked={config.twinSyncEnabled} onCheckedChange={(value) => { config.twinSyncEnabled = value; onSaveGlobalOnChange(); }} aria-label="孪生卡进度同步" /></div>
    <div class="setting-row"><div><strong>登记前额外确认</strong><span>预览界面始终显示；开启后点击制卡还会再弹出一次确认</span></div><Switch checked={config.confirmBeforeAutoRegister} onCheckedChange={(value) => { config.confirmBeforeAutoRegister = value; onSaveGlobalOnChange(); }} aria-label="登记前额外确认" /></div>
    <div class="section-actions"><Button size="sm" onclick={onUpdateGlobal} disabled={saving}><Save />保存并应用</Button></div>
  </section>

  <section class="settings-section">
    <div class="section-title"><LocateFixed /><div><h3>文档入口</h3><p>控制编辑器中的快捷入口</p></div></div>
    <div class="setting-row"><div><strong>桌面端面包屑按钮</strong><span>在桌面端当前文档面包屑中提供快速复习</span></div><Switch checked={config.showDesktopBreadcrumbReviewButton} onCheckedChange={(value) => { config.showDesktopBreadcrumbReviewButton = value; onSaveGlobalOnChange(); }} aria-label="桌面端面包屑闪卡按钮" /></div>
    <div class="setting-row"><div><strong>移动端面包屑按钮</strong><span>在移动端当前文档面包屑中提供快速复习</span></div><Switch checked={config.showMobileBreadcrumbReviewButton} onCheckedChange={(value) => { config.showMobileBreadcrumbReviewButton = value; onSaveGlobalOnChange(); }} aria-label="移动端面包屑闪卡按钮" /></div>
  </section>

  <section class="settings-section">
    <div class="section-title"><Layers3 /><div><h3>卡片渲染</h3><p>按卡片 renderer 应用专属隐藏范围</p></div></div>
    <div class="setting-row master-row"><div><strong>启用卡片渲染适配</strong><span>关闭后完全沿用思源的全局闪卡设置</span></div><Switch checked={config.rendererInterceptionEnabled} onCheckedChange={(value) => { config.rendererInterceptionEnabled = value; onSaveGlobalOnChange(); }} aria-label="启用卡片渲染适配" /></div>
    {#if config.rendererInterceptionEnabled}
      <div class="option-grid" data-testid="renderer-options">
        {#each RENDERER_OPTIONS as option}
          <div class="option-row"><svelte:component this={option[2]} aria-hidden="true" /><span>{option[1]}</span><Switch size="sm" checked={config.rendererVisibility[option[0]]} onCheckedChange={(value) => { config.rendererVisibility[option[0]] = value; onSaveGlobalOnChange(); }} aria-label={option[1]} /></div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="settings-section">
    <div class="section-title"><RefreshCw /><div><h3>复习顺序</h3><p>优先级队列中的随机策略</p></div></div>
    <div class="setting-row"><div><strong>随机穿插</strong><span>将约 5% 的较低优先级卡插入高优先级区段</span></div><Switch checked={config.randomInterleaveEnabled} onCheckedChange={(value) => { config.randomInterleaveEnabled = value; onSaveGlobalOnChange(); }} aria-label="随机穿插" /></div>
    <div class="setting-row"><div><strong>同级随机</strong><span>每轮打乱同一优先级内的卡片顺序</span></div><Switch checked={config.samePriorityShuffleEnabled} onCheckedChange={(value) => { config.samePriorityShuffleEnabled = value; onSaveGlobalOnChange(); }} aria-label="同级随机" /></div>
    {#if categoryConfig}
      <div class="setting-row master-row"><div><strong>启用闪卡分类</strong><span>使用 #闪卡/分类/名称# 管理分类；关闭后不影响 P1-P4 优先级。</span></div><Switch checked={categoryConfig.enabled} onCheckedChange={(value) => { categoryConfig.enabled = value; onSaveCategoryConfig(categoryConfig); }} aria-label="启用闪卡分类" /></div>
      {#if categoryConfig.enabled}
        <div class="setting-row"><div><strong>分类参与复习排序</strong><span>仅改变已到期卡的顺序，不修改 FSRS 到期时间。</span></div><Switch checked={categoryConfig.reviewEnabled} onCheckedChange={(value) => { categoryConfig.reviewEnabled = value; onSaveCategoryConfig(categoryConfig); }} aria-label="分类参与复习排序" /></div>
        <div class="section-actions category-actions"><Button size="sm" variant="outline" onclick={onAddFlashcardCategoryRule}><Plus />新建分类</Button></div>
        <div class="sortable-list" data-testid="flashcard-category-options">
          {#each [...categoryConfig.rules].sort((left, right) => left.reviewOrder - right.reviewOrder) as rule, index (rule.name)}
            <div class="sortable-row"><Tags aria-hidden="true" /><Input aria-label={`分类名称 ${rule.name}`} bind:value={rule.name} onchange={() => onSaveCategoryConfig(categoryConfig)} /><Switch size="sm" checked={rule.participatesInReview} onCheckedChange={(value) => { rule.participatesInReview = value; onSaveCategoryConfig(categoryConfig); }} aria-label={`${rule.name}参与复习排序`} /><Button variant="ghost" size="icon-xs" title="上移" aria-label={`${rule.name}上移`} disabled={index === 0} onclick={() => onMoveCategory(rule, "up")}><ArrowUp /></Button><Button variant="ghost" size="icon-xs" title="下移" aria-label={`${rule.name}下移`} disabled={index === categoryConfig.rules.length - 1} onclick={() => onMoveCategory(rule, "down")}><ArrowDown /></Button></div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  <section class="settings-section">
    <div class="section-title"><SlidersHorizontal /><div><h3>当前卡片信息</h3><p>选择统计项并调整显示顺序</p></div></div>
    <div class="setting-row master-row"><div><strong>显示当前卡片统计</strong><span>在原生复习界面显示复习数据</span></div><Switch checked={config.reviewStats.enabled} onCheckedChange={(value) => { config.reviewStats.enabled = value; onSaveGlobalOnChange(); }} aria-label="显示当前卡片统计" /></div>
    {#if config.reviewStats.enabled}
      <div class="sortable-list" data-testid="review-stat-options">
        {#each config.reviewStats.order as statKey, index (statKey)}
          <div class="sortable-row">
            <svelte:component this={REVIEW_STAT_ICONS[statKey]} aria-hidden="true" />
            <Switch size="sm" checked={config.reviewStats.visible[statKey]} onCheckedChange={(value) => { config.reviewStats.visible[statKey] = value; onSaveGlobalOnChange(); }} aria-label={`显示${REVIEW_STAT_LABELS[statKey]}`} />
            <span>{REVIEW_STAT_LABELS[statKey]}</span>
            <div class="sort-actions">
              <Button variant="ghost" size="icon-xs" title="上移" aria-label={`${REVIEW_STAT_LABELS[statKey]}上移`} disabled={index === 0} onclick={() => onMoveReviewStat(statKey, "up")}><ArrowUp /></Button>
              <Button variant="ghost" size="icon-xs" title="下移" aria-label={`${REVIEW_STAT_LABELS[statKey]}下移`} disabled={index === config.reviewStats.order.length - 1} onclick={() => onMoveReviewStat(statKey, "down")}><ArrowDown /></Button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="settings-section">
    <div class="section-title"><Timer /><div><h3>复习计时</h3><p>在原生复习顶栏显示本轮与当前卡片用时</p></div></div>
    <div class="setting-row master-row"><div><strong>显示复习计时</strong><span>显示本轮总计时和当前闪卡计时</span></div><Switch checked={config.reviewTimerEnabled} onCheckedChange={(value) => { config.reviewTimerEnabled = value; onSaveGlobalOnChange(); }} aria-label="显示复习计时" /></div>
    {#if config.reviewTimerEnabled}
      <div class="setting-row"><div><strong>智能暂停与恢复</strong><span>切换到其他窗口或页面隐藏时自动暂停，返回后继续计时</span></div><Switch checked={config.reviewTimerPauseOnBlur} onCheckedChange={(value) => { config.reviewTimerPauseOnBlur = value; onSaveGlobalOnChange(); }} aria-label="智能暂停与恢复" /></div>
      <div class="setting-row"><div><strong>显示答案后继续计时</strong><span>关闭时只统计查看题目的时间（默认）</span></div><Switch checked={config.reviewTimerContinueAfterAnswer} onCheckedChange={(value) => { config.reviewTimerContinueAfterAnswer = value; onSaveGlobalOnChange(); }} aria-label="显示答案后继续计时" /></div>
    {/if}
  </section>

  <section class="settings-section">
    <div class="section-title"><Settings2 /><div><h3>原生复习工具栏</h3><p>选择复习界面中需要的快捷操作</p></div></div>
    <div class="setting-row master-row"><div><strong>启用工具栏增强</strong><span>将 DAMO 操作融合进原生复习界面</span></div><Switch checked={config.reviewToolbarEnabled} onCheckedChange={(value) => { config.reviewToolbarEnabled = value; onSaveGlobalOnChange(); }} aria-label="启用工具栏增强" /></div>
    {#if config.reviewToolbarEnabled}
      <div class="option-grid" data-testid="toolbar-options">
        {#each TOOLBAR_OPTIONS as option}
          <div class="option-row"><svelte:component this={option[2]} aria-hidden="true" /><span>{option[1]}</span><Switch size="sm" checked={config[option[0]]} onCheckedChange={(value) => onSetBooleanSetting(option[0], value)} aria-label={option[1]} /></div>
        {/each}
      </div>
      <div class="toolbar-customizer">
        <div class="toolbar-customizer-heading"><div><strong>工具栏动作</strong><span>直接开关和排序，插件注册的新动作会自动出现在这里</span></div><Button variant="ghost" size="sm" onclick={onResetToolbarActions}><RotateCcw />恢复默认</Button></div>
        <div class="toolbar-action-list">
          {#each toolbarActionRows as row}
            <div class:toolbar-action-disabled={!row.enabled} class="toolbar-action-row">
              <div class="toolbar-action-icon"><svelte:component this={row.action.icon.startsWith("icon") ? Settings2 : Settings2} aria-hidden="true" /></div>
              <div class="toolbar-action-copy"><strong>{row.action.label}</strong><span>{row.action.source ?? "插件动作"} · {row.action.id}</span></div>
              <div class="toolbar-action-controls">
                <Button variant="ghost" size="icon-xs" title="上移" aria-label="上移动作" disabled={!row.enabled || config.reviewToolbarActionOrder.indexOf(row.action.id) === 0} onclick={() => onMoveToolbarAction(row.action.id, "up")}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-xs" title="下移" aria-label="下移动作" disabled={!row.enabled || config.reviewToolbarActionOrder.indexOf(row.action.id) === config.reviewToolbarActionOrder.length - 1} onclick={() => onMoveToolbarAction(row.action.id, "down")}><ArrowDown /></Button>
                <Switch size="sm" checked={row.enabled} onCheckedChange={(value) => onSetToolbarActionEnabled(row.action.id, value)} aria-label={`显示${row.action.label}`} />
              </div>
            </div>
          {/each}
        </div>
      </div>
      <div class="toolbar-style-editor">
        <div class="toolbar-customizer-heading"><div><strong>复习工具栏外观</strong><span>在左侧编辑 CSS，右侧立即预览；样式只作用于闪卡复习工具栏</span></div></div>
        <div class="toolbar-style-grid">
          <Textarea aria-label="复习工具栏自定义 CSS" bind:value={config.reviewToolbarCustomCss} rows={9} oninput={onSaveGlobalOnChange} />
          <div class="toolbar-style-controls">
            <label>工具栏背景色<input type="color" value={config.reviewToolbarStyle.background} oninput={(event) => onUpdateToolbarStyle("background", (event.currentTarget as HTMLInputElement).value)} /></label>
            <label>文字颜色<input type="color" value={config.reviewToolbarStyle.foreground} oninput={(event) => onUpdateToolbarStyle("foreground", (event.currentTarget as HTMLInputElement).value)} /></label>
            <label>强调色<input type="color" value={config.reviewToolbarStyle.accent} oninput={(event) => onUpdateToolbarStyle("accent", (event.currentTarget as HTMLInputElement).value)} /></label>
            <label>圆角 <input type="range" min="0" max="24" value={config.reviewToolbarStyle.radius} oninput={(event) => onUpdateToolbarStyle("radius", Number((event.currentTarget as HTMLInputElement).value))} /><output>{config.reviewToolbarStyle.radius}px</output></label>
            <label>按钮高度 <input type="range" min="22" max="56" value={config.reviewToolbarStyle.buttonHeight} oninput={(event) => onUpdateToolbarStyle("buttonHeight", Number((event.currentTarget as HTMLInputElement).value))} /><output>{config.reviewToolbarStyle.buttonHeight}px</output></label>
            <label>按钮间距 <input type="range" min="0" max="24" value={config.reviewToolbarStyle.gap} oninput={(event) => onUpdateToolbarStyle("gap", Number((event.currentTarget as HTMLInputElement).value))} /><output>{config.reviewToolbarStyle.gap}px</output></label>
          </div>
          <div class="toolbar-preview card__main" style={`--damophus-toolbar-bg:${config.reviewToolbarStyle.background};--damophus-toolbar-fg:${config.reviewToolbarStyle.foreground};--damophus-toolbar-accent:${config.reviewToolbarStyle.accent};--damophus-toolbar-radius:${config.reviewToolbarStyle.radius}px;--damophus-toolbar-gap:${config.reviewToolbarStyle.gap}px;--damophus-toolbar-button-height:${config.reviewToolbarStyle.buttonHeight}px`}>
            <svelte:element this={STYLE_TAG}>{config.reviewToolbarCustomCss}</svelte:element>
            <div class="toolbar-preview-caption">预览</div>
            <div class="toolbar-preview-bar"><span class="toolbar-preview-brand">闪卡</span><button type="button" data-damophus-flashcard-action="locate">定位</button><button type="button" data-damophus-flashcard-action="priority">优先级</button><button type="button" data-damophus-flashcard-action="workbench">工作台</button></div>
            <div class="toolbar-preview-card">当前闪卡 · 预览内容</div>
          </div>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
  label { display: flex; flex-direction: column; gap: 5px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; }
  .global-settings { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
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
  .section-title { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 9px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .section-title > div { min-width: 0; }
  .section-title p { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .section-title > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .field-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .setting-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding: 9px 0; }
  .setting-row + .setting-row { border-top: 1px solid var(--border, var(--b3-border-color)); }
  .setting-row > div { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 2px; }
  .setting-row strong { font-size: 13px; font-weight: 550; }
  .setting-row span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .review-mode-row { align-items: stretch; flex-direction: column; }
  :global(.review-mode-toggle) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: min(100%, 360px); }
  :global(.review-mode-toggle button) { min-width: 0; }
  :global(.review-mode-toggle button[data-state="on"]),
  :global(.review-mode-toggle button[data-state="on"]:hover) {
    z-index: 1;
    border: 1px solid var(--primary, var(--b3-theme-primary, #3573f0)) !important;
    color: var(--primary-foreground, var(--b3-theme-on-primary, #fff)) !important;
    background: var(--primary, var(--b3-theme-primary, #3573f0)) !important;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-foreground, var(--b3-theme-on-primary, #fff)) 24%, transparent);
  }
  :global(.review-mode-toggle .review-mode-check) { width: 14px; height: 14px; margin-left: 2px; stroke-width: 3; }
  .master-row { background: color-mix(in srgb, var(--muted, var(--b3-theme-surface)) 45%, transparent); margin-inline: -12px; padding-inline: 12px; }
  .option-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 18px; padding: 4px 0 8px; }
  .toolbar-customizer, .toolbar-style-editor { display: flex; flex-direction: column; gap: 8px; padding: 10px 0; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .toolbar-customizer-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; min-width: 0; }
  .toolbar-customizer-heading > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .toolbar-customizer-heading strong { font-size: 13px; }
  .toolbar-customizer-heading span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .toolbar-action-list { display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 6px; overflow: hidden; }
  .toolbar-action-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 46px; padding: 5px 7px; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .toolbar-action-row:last-child { border-bottom: 0; }
  .toolbar-action-disabled { opacity: .55; }
  .toolbar-action-icon { display: grid; place-items: center; width: 26px; height: 26px; color: var(--primary, var(--b3-theme-primary)); }
  .toolbar-action-icon :global(svg) { width: 15px; height: 15px; }
  .toolbar-action-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .toolbar-action-copy strong, .toolbar-action-copy span { overflow-wrap: anywhere; }
  .toolbar-action-copy strong { font-size: 12px; }
  .toolbar-action-copy span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 10px; }
  .toolbar-action-controls { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; }
  .toolbar-style-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 1fr); gap: 10px; min-width: 0; }
  .toolbar-style-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; min-width: 0; }
  .toolbar-style-controls label { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .toolbar-style-controls input[type="color"] { width: 30px; height: 26px; padding: 1px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 4px; background: transparent; }
  .toolbar-style-controls input[type="range"] { min-width: 0; flex: 1; }
  .toolbar-style-controls output { min-width: 34px; color: inherit; font: 10px ui-monospace, SFMono-Regular, Consolas, monospace; text-align: right; }
  .toolbar-style-grid :global(textarea) { min-width: 0; width: 100%; box-sizing: border-box; resize: vertical; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; line-height: 1.5; }
  .toolbar-preview { position: relative; display: flex; min-height: 150px; flex-direction: column; gap: 8px; min-width: 0; padding: 10px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 6px; background: var(--background, var(--b3-theme-background)); overflow: hidden; }
  .toolbar-preview-caption { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 10px; text-transform: uppercase; }
  .toolbar-preview-bar { display: flex; align-items: center; gap: var(--damophus-toolbar-gap, 6px); min-width: 0; padding: 6px; border: 1px solid color-mix(in srgb, var(--damophus-toolbar-accent, var(--primary, #7aa2ff)) 35%, transparent); border-radius: var(--damophus-toolbar-radius, 6px); color: var(--damophus-toolbar-fg, inherit); background: var(--damophus-toolbar-bg, var(--card, var(--b3-theme-background))); overflow-x: auto; }
  .toolbar-preview-bar button, .toolbar-preview-brand { flex: 0 0 auto; min-height: var(--damophus-toolbar-button-height, 30px); padding: 3px 7px; border: 1px solid color-mix(in srgb, var(--damophus-toolbar-accent, var(--primary, #7aa2ff)) 45%, transparent); border-radius: var(--damophus-toolbar-radius, 6px); color: inherit; background: transparent; font-size: 11px; }
  .toolbar-preview-brand { border-color: transparent; font-weight: 650; }
  .toolbar-preview-card { flex: 1; display: grid; place-items: center; min-height: 76px; border: 1px dashed var(--border, var(--b3-border-color)); color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .option-row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 42px; border-bottom: 1px solid var(--border, var(--b3-border-color)); font-size: 12px; }
  .option-row > :global(svg), .sortable-row > :global(svg) { width: 15px; height: 15px; color: var(--primary, var(--b3-theme-primary)); }
  .option-row:nth-last-child(-n + 2) { border-bottom-color: transparent; }
  .sortable-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0 18px; padding: 5px 0 8px; }
  .sortable-row { display: grid; grid-template-columns: 22px 26px minmax(0, 1fr) auto; align-items: center; min-height: 40px; border-bottom: 1px solid var(--border, var(--b3-border-color)); font-size: 12px; }
  [data-testid="flashcard-category-options"] { grid-template-columns: minmax(260px, 1fr); gap: 0; padding: 4px 0 8px; }
  [data-testid="flashcard-category-options"] .sortable-row { grid-template-columns: 22px minmax(120px, 1fr) auto 28px 28px; gap: 7px; min-width: 0; min-height: 44px; color: var(--foreground, var(--b3-theme-on-background)); }
  [data-testid="flashcard-category-options"] :global(input) { width: 100%; min-width: 0; min-height: 30px; box-sizing: border-box; color: var(--foreground, var(--b3-theme-on-background)); background: var(--background, var(--b3-theme-background)); }
  [data-testid="flashcard-category-options"] :global(button) { min-width: 28px; min-height: 28px; }
  .category-actions { padding-block: 6px; border-top: 0; }
  .sortable-row:last-child { border-bottom: 0; }
  .sort-actions { display: flex; gap: 2px; }
  .section-actions { display: flex; justify-content: flex-end; padding: 10px 0; border-top: 1px solid var(--border, var(--b3-border-color)); }

  @container (max-width: 620px) {
    .field-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }

  @container (max-width: 390px) {
    .field-grid { grid-template-columns: 1fr; }
    .option-grid, .sortable-list { grid-template-columns: 1fr; }
    .toolbar-style-grid { grid-template-columns: 1fr; }
    .toolbar-style-controls { grid-template-columns: 1fr; }
    .toolbar-action-row { grid-template-columns: 24px minmax(0, 1fr); }
    .toolbar-action-controls { grid-column: 2; justify-content: flex-end; }
    .setting-row { gap: 10px; }
    .section-actions :global([data-slot="button"]) { flex: 1; }
  }
</style>
