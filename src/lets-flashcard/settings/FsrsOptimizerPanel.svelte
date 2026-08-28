<script lang="ts">
  import { ArrowDown, ArrowUp, BrainCircuit, CalendarClock, CheckCircle2, ExternalLink, Info, RefreshCw, Save, Undo2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import * as Select from "@/components/ui/select";
  import * as Tooltip from "@/components/ui/tooltip";
  import type { FlashcardSettings } from "@/flashcard/types";
  import type { FsrsOptimizationResult } from "@/flashcard/fsrs-optimizer-protocol";
  import type { FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
  import type { FsrsWeightHistoryEntry } from "@/flashcard/fsrs-weight-history";
  import type { ReviewLogArchive } from "@/flashcard/review-log-export";

  export let config: FlashcardSettings;
  export let selectedReviewLogEntries: ReviewLogArchive["entries"];
  export let optimization: { result: FsrsOptimizationResult; preview: FsrsWeightPreview } | undefined;
  export let optimizerLoading: boolean;
  export let optimizerApplying: boolean;
  export let optimizerApplied: boolean;
  export let currentFsrsWeights: number[];
  export let fsrsHistory: FsrsWeightHistoryEntry[];
  export let fsrsHistoryLoading: boolean;
  export let fsrsUndoingId: string;
  export let onOptimizeReviewLogs: () => Promise<void>;
  export let onApplyOptimization: () => Promise<void>;
  export let onLoadFsrsHistory: () => Promise<void>;
  export let onUndoFsrsHistory: (entry: FsrsWeightHistoryEntry) => Promise<void>;
  export let onSaveGlobalOnChange: () => void;

  const FSRS_PARAMETER_DESCRIPTIONS = [
    ["w0", "Again 初始稳定性", "第一次按 Again 后的初始记忆稳定性。数值越大，系统给出的起始间隔通常越长。", "决定失败评级（Again）创建或重置卡片时的起始稳定性，是四个评级初始稳定性参数之一。"],
    ["w1", "Hard 初始稳定性", "第一次按 Hard 后的初始稳定性。", "决定困难评级（Hard）首次建立记忆时的起始稳定性，影响之后的首个复习间隔。"],
    ["w2", "Good 初始稳定性", "第一次按 Good 后的初始稳定性。", "决定正常记住（Good）时的初始稳定性，通常是最常用的新卡起点。"],
    ["w3", "Easy 初始稳定性", "第一次按 Easy 后的初始稳定性。", "决定轻松记住（Easy）时的初始稳定性，影响新卡首次被安排的间隔。"],
    ["w4", "初始难度基线", "新卡难度的基础水平。", "为首次评分计算难度提供基线；它与 w5 一起把 Again、Hard、Good、Easy 映射到不同初始难度。"],
    ["w5", "初始难度评级敏感度", "初始难度随评分变化的幅度。", "控制不同首次评分对初始难度的影响强弱；绝对值越大，评级之间的难度差异通常越明显。"],
    ["w6", "难度变化系数", "后续评分改变难度的力度。", "控制每次复习评级对当前难度的增减幅度，影响卡片在连续答对或答错后的难度漂移。"],
    ["w7", "难度回归强度", "让难度回到个人基准的力度。", "控制更新后的难度向 Easy 所对应的个人基准难度回归的速度，避免难度长期漂移到极端。"],
    ["w8", "成功稳定性增长基线", "答对后稳定性增长的基础倍率。", "控制成功复习时稳定性增长的总体幅度，是成功分支计算新稳定性的主要基线参数。"],
    ["w9", "成功增长稳定性敏感度", "当前稳定性对增长幅度的影响。", "控制已有稳定性对下一次增长的抑制或放大；用于让短稳定性和长稳定性卡片呈现不同增长曲线。"],
    ["w10", "成功增长可提取性敏感度", "当前可回忆程度对增长幅度的影响。", "根据复习时的可提取性（retrievability）调整成功后的增长；越接近遗忘边缘时，增长通常越有价值。"],
    ["w11", "遗忘后稳定性基线", "答错后重新建立稳定性的基础倍率。", "控制 Again 后重新学习阶段的稳定性起点，决定遗忘卡片恢复记忆的速度。"],
    ["w12", "遗忘难度敏感度", "卡片难度对遗忘后稳定性的影响。", "控制难度越高时遗忘后可恢复稳定性的衰减程度。"],
    ["w13", "遗忘前稳定性敏感度", "原有稳定性对遗忘后恢复的影响。", "控制遗忘前的稳定性如何参与恢复计算，影响熟卡偶尔遗忘后的回落幅度。"],
    ["w14", "遗忘可提取性敏感度", "遗忘时的可回忆程度对恢复的影响。", "把复习发生时的可提取性纳入遗忘分支，区分刚接近遗忘和已经严重遗忘的情况。"],
    ["w15", "Hard 成功惩罚", "答 Hard 时相对普通成功的稳定性折减。", "仅作用于成功分支中的 Hard 评级，用来限制困难回忆带来的稳定性增长。"],
    ["w16", "Easy 成功奖励", "答 Easy 时相对普通成功的稳定性加成。", "仅作用于成功分支中的 Easy 评级，用来增加轻松回忆时的稳定性增长。"],
    ["w17", "短期稳定性增长系数", "同日重复学习时的短期稳定性变化。", "控制同一天再次学习或重学时的稳定性增长，同时参与遗忘后的短期稳定性下限约束。"],
    ["w18", "短期评级偏移", "短期学习阶段不同评级的偏移量。", "调整 Again、Hard、Good、Easy 在短期学习分支中的相对增长，并参与遗忘后稳定性下限计算。"],
  ] as const;

  function formatFsrsHistoryDate(timestamp: number): string {
    return new Intl.DateTimeFormat("zh-CN", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
  }
</script>

<section class="settings-section optimizer-panel" data-testid="fsrs-optimizer-panel">
  <div class="section-title optimizer-title">
    <BrainCircuit />
    <div><h3>FSRS 参数优化</h3><p>fsrs-browser 2.0.4 · 19 参数 · {config.fsrsOptimizerMode === "internal" ? "插件内部单线程" : "系统浏览器多线程"}</p></div>
    <Select.Root type="single" value={config.fsrsOptimizerMode} onValueChange={(value) => { config.fsrsOptimizerMode = value === "browser" ? "browser" : "internal"; onSaveGlobalOnChange(); }}>
      <Select.Trigger size="sm" aria-label="FSRS 优化运行模式">{config.fsrsOptimizerMode === "internal" ? "插件内部" : "系统浏览器"}</Select.Trigger>
      <Select.Content>
        <Select.Item value="internal" label="插件内部（单线程）" />
        <Select.Item value="browser" label="系统浏览器（多线程）" />
      </Select.Content>
    </Select.Root>
    <Button
      size="sm"
      disabled={optimizerLoading || !selectedReviewLogEntries.length}
      onclick={onOptimizeReviewLogs}
      title={config.fsrsOptimizerMode === "internal" ? "在思源插件内部开始本地训练" : "在系统浏览器中开始本地训练"}
      aria-label="启动 FSRS 优化器"
    >
      {#if optimizerLoading}<RefreshCw class="loading-icon" />{:else if config.fsrsOptimizerMode === "internal"}<BrainCircuit />{:else}<ExternalLink />{/if}
      <span>{optimizerLoading ? "正在训练" : config.fsrsOptimizerMode === "internal" ? "内部训练" : "打开浏览器"}</span>
    </Button>
  </div>
  {#if optimization}
    <div class="optimizer-result-summary">
      <div><CheckCircle2 /><span>训练完成</span><strong>{optimization.result.sourceRecordCount} 条 · {optimization.result.cardCount} 张</strong></div>
      <div><CalendarClock /><span>训练耗时</span><strong>{(optimization.result.durationMs / 1000).toFixed(1)} 秒</strong></div>
      <div><BrainCircuit /><span>参数协议</span><strong>FSRS-5 · 19 项</strong></div>
    </div>
    <Tooltip.Provider>
      <div class="fsrs-parameter-grid" aria-label="FSRS 19 项参数说明">
        {#each FSRS_PARAMETER_DESCRIPTIONS as parameter, index}
          {@const current = optimization.preview.current[index]}
          {@const optimized = optimization.preview.optimized[index]}
          {@const delta = optimized - current}
          {@const changed = Math.abs(delta) > 1e-7}
          <div class:changed class:increased={delta > 1e-7} class:decreased={delta < -1e-7} class="fsrs-parameter-card">
            <div class="fsrs-parameter-info">
              <Tooltip.Root>
                <Tooltip.Trigger class="fsrs-info-trigger" aria-label={`${parameter[0]} 详细说明`}>
                  <Info />
                </Tooltip.Trigger>
                <Tooltip.Content side="top">{parameter[3]}</Tooltip.Content>
              </Tooltip.Root>
              <div class="fsrs-parameter-copy"><strong>{parameter[0]} · {parameter[1]}</strong><span>{parameter[2]}</span></div>
            </div>
            <div class:increased={delta > 1e-7} class:decreased={delta < -1e-7} class="fsrs-parameter-values" aria-label={changed ? `从 ${Number(current.toPrecision(7))} 变为 ${Number(optimized.toPrecision(7))}` : `当前值 ${Number(current.toPrecision(7))}`}>
              {#if changed}
                <div class="fsrs-value-diff">
                  <del class="fsrs-value-old">{Number(current.toPrecision(7))}</del>
                  {#if delta > 1e-7}<ArrowUp class="fsrs-diff-icon" aria-hidden="true" />{:else}<ArrowDown class="fsrs-diff-icon" aria-hidden="true" />{/if}
                  <strong class="fsrs-value-new">{Number(optimized.toPrecision(7))}</strong>
                </div>
                <span class="fsrs-delta">{delta > 0 ? "+" : ""}{Number(delta.toPrecision(5))}</span>
              {:else}
                <strong class="fsrs-value-same">{Number(current.toPrecision(7))}</strong>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </Tooltip.Provider>
    <div class="optimizer-apply">
      <Badge variant={optimizerApplied ? "secondary" : "outline"}>{optimizerApplied ? "已应用并验证" : "尚未修改思源设置"}</Badge>
      <Button size="sm" disabled={optimizerApplying || optimizerApplied} onclick={onApplyOptimization} aria-label="应用 FSRS 参数">
        {#if optimizerApplying}<RefreshCw class="loading-icon" />{:else}<Save />{/if}
        <span>{optimizerApplying ? "正在验证" : optimizerApplied ? "已应用" : "应用参数"}</span>
      </Button>
    </div>
  {:else}
    <div class="optimizer-empty">
      <BrainCircuit />
      <div><strong>在系统浏览器中训练</strong><span>当前将使用 {selectedReviewLogEntries.length || 0} 条筛选记录；本地端口 52370 仅在训练期间开放，训练结果返回后仍需在此确认应用。</span></div>
    </div>
  {/if}
  {#if !optimization}
    <Tooltip.Provider>
      <div class="fsrs-parameter-reference" aria-label="FSRS 参数参考">
        <div class="fsrs-reference-heading"><div><strong>当前 19 项参数</strong><span>短说明直接显示，悬停信息图标查看详细作用。</span></div><Badge variant="outline">FSRS-5</Badge></div>
        <div class="fsrs-reference-grid">
          {#each FSRS_PARAMETER_DESCRIPTIONS as parameter, index}
            {@const value = currentFsrsWeights[index]}
            <div class="fsrs-reference-row">
              <Tooltip.Root>
                <Tooltip.Trigger class="fsrs-info-trigger" aria-label={`${parameter[0]} 详细说明`}>
                  <Info />
                </Tooltip.Trigger>
                <Tooltip.Content side="top">{parameter[3]}</Tooltip.Content>
              </Tooltip.Root>
              <div class="fsrs-reference-copy"><strong>{parameter[0]} · {parameter[1]}</strong><span>{parameter[2]}</span></div>
              <code>{value === undefined ? "—" : Number(value.toPrecision(7))}</code>
            </div>
          {/each}
        </div>
      </div>
    </Tooltip.Provider>
  {/if}
  <section class="fsrs-history-panel" aria-label="FSRS 参数修改历史">
    <div class="fsrs-history-heading"><div><strong>参数修改历史</strong><span>每次应用或撤销都会保留上一组权重，可随时恢复。</span></div><Button variant="ghost" size="icon-sm" onclick={onLoadFsrsHistory} disabled={fsrsHistoryLoading} title="刷新参数历史" aria-label="刷新参数历史"><RefreshCw class={fsrsHistoryLoading ? "loading-icon" : ""} /></Button></div>
    {#if fsrsHistoryLoading}<p class="fsrs-history-empty">正在读取历史…</p>
    {:else if fsrsHistory.length}
      <div class="fsrs-history-list">
        {#each fsrsHistory as entry (entry.id)}
          <div class="fsrs-history-row">
            <div><strong>{entry.source === "undo" ? "撤销修改" : "优化器应用"}</strong><span>{formatFsrsHistoryDate(entry.createdAt)} · {entry.next.map((value, index) => Math.abs(value - entry.previous[index]) > 1e-7 ? `w${index}` : "").filter(Boolean).slice(0, 4).join("、") || "无变化"}</span></div>
            <Button variant="outline" size="sm" onclick={() => onUndoFsrsHistory(entry)} disabled={fsrsUndoingId !== ""} title="恢复这条记录之前的参数" aria-label="撤销这次参数修改">{#if fsrsUndoingId === entry.id}<RefreshCw class="loading-icon" />{:else}<Undo2 />{/if}<span>撤销</span></Button>
          </div>
        {/each}
      </div>
    {:else}<p class="fsrs-history-empty">还没有参数修改记录</p>{/if}
  </section>
</section>

<style>
  h3, p { margin: 0; }
  h3 { font-size: 14px; font-weight: 650; letter-spacing: 0; }
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
  .optimizer-panel { margin-top: 0; }
  .section-title { display: flex; align-items: center; gap: 9px; min-height: 54px; padding: 9px 0; border-bottom: 1px solid var(--border, var(--b3-border-color)); }
  .section-title > div { min-width: 0; }
  .section-title p { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .section-title > :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .optimizer-title { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto auto; }
  .optimizer-title > :global([data-slot="button"]) { justify-self: end; }
  .optimizer-result-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; padding: 12px 0; }
  .optimizer-result-summary > div { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 2px 7px; min-width: 0; padding: 8px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; }
  .optimizer-result-summary :global(svg) { grid-row: 1 / 3; width: 16px; height: 16px; color: var(--primary, var(--b3-theme-primary)); }
  .optimizer-result-summary span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .optimizer-result-summary strong { font-size: 12px; }
  .fsrs-parameter-grid, .fsrs-reference-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 7px; }
  .fsrs-parameter-card, .fsrs-reference-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; min-width: 0; padding: 7px 8px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: color-mix(in srgb, var(--muted, var(--b3-list-hover)) 25%, transparent); }
  .fsrs-parameter-card.changed { border-color: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 48%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 7%, transparent); }
  .fsrs-parameter-info { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: start; gap: 5px; min-width: 0; }
  :global(.fsrs-info-trigger) { display: inline-flex !important; align-items: center; justify-content: center; box-sizing: border-box; width: 24px !important; min-width: 24px !important; height: 24px !important; min-height: 24px !important; padding: 0 !important; border: 1px solid color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 38%, var(--border, var(--b3-border-color))) !important; border-radius: 999px !important; color: var(--primary, var(--b3-theme-primary)) !important; background: transparent !important; box-shadow: none !important; font: inherit; line-height: 1; cursor: help; }
  :global(.fsrs-info-trigger:hover), :global(.fsrs-info-trigger:focus-visible) { background: color-mix(in srgb, var(--primary, var(--b3-theme-primary)) 12%, transparent) !important; }
  :global(.fsrs-info-trigger svg) { width: 14px; height: 14px; color: inherit; }
  .fsrs-parameter-copy, .fsrs-reference-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fsrs-parameter-copy strong, .fsrs-reference-copy strong { min-width: 0; overflow-wrap: anywhere; font-size: 12px; }
  .fsrs-parameter-copy span, .fsrs-reference-copy span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .fsrs-parameter-values { display: flex; min-width: 106px; flex-direction: column; align-items: flex-end; gap: 2px; font: 11px ui-monospace, SFMono-Regular, Consolas, monospace; text-align: right; }
  .fsrs-value-diff { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
  .fsrs-value-old { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); text-decoration-thickness: 1px; }
  .fsrs-value-new { color: var(--primary, var(--b3-theme-primary)); font-weight: 650; }
  :global(.fsrs-diff-icon) { width: 12px; height: 12px; }
  .fsrs-delta { padding: 1px 4px; border: 1px solid color-mix(in srgb, currentColor 28%, transparent); border-radius: 4px; color: currentColor; font-size: 10px; line-height: 1.25; }
  .fsrs-parameter-values.increased, .fsrs-parameter-card.increased { color: var(--b3-theme-success, #2e8b57); }
  .fsrs-parameter-values.increased .fsrs-value-new, :global(.fsrs-parameter-values.increased .fsrs-diff-icon) { color: var(--b3-theme-success, #2e8b57); }
  .fsrs-parameter-values.decreased, .fsrs-parameter-card.decreased { color: var(--b3-theme-error, #c74444); }
  .fsrs-parameter-values.decreased .fsrs-value-new, :global(.fsrs-parameter-values.decreased .fsrs-diff-icon) { color: var(--b3-theme-error, #c74444); }
  .fsrs-parameter-card.increased { border-color: color-mix(in srgb, var(--b3-theme-success, #2e8b57) 48%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--b3-theme-success, #2e8b57) 7%, transparent); }
  .fsrs-parameter-card.decreased { border-color: color-mix(in srgb, var(--b3-theme-error, #c74444) 48%, var(--border, var(--b3-border-color))); background: color-mix(in srgb, var(--b3-theme-error, #c74444) 7%, transparent); }
  .fsrs-parameter-reference, .fsrs-history-panel { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .fsrs-reference-heading, .fsrs-history-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .fsrs-reference-heading > div, .fsrs-history-heading > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fsrs-reference-heading strong, .fsrs-history-heading strong { font-size: 13px; }
  .fsrs-reference-heading span, .fsrs-history-heading span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; line-height: 1.4; }
  .fsrs-reference-row { grid-template-columns: 24px minmax(0, 1fr) auto; }
  .fsrs-reference-row code { min-width: 64px; color: var(--primary, var(--b3-theme-primary)); font-size: 11px; text-align: right; }
  .fsrs-history-list { display: flex; flex-direction: column; gap: 6px; }
  .fsrs-history-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 7px 8px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; }
  .fsrs-history-row > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fsrs-history-row strong { font-size: 12px; }
  .fsrs-history-row span, .fsrs-history-empty { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .fsrs-history-row span { overflow-wrap: anywhere; }
  .fsrs-history-empty { margin: 0; padding: 7px 0; }
  .optimizer-apply { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border, var(--b3-border-color)); }
  .optimizer-empty { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 88px; padding: 12px 0; }
  .optimizer-empty > :global(svg) { width: 24px; height: 24px; color: var(--primary, var(--b3-theme-primary)); }
  .optimizer-empty div { display: flex; flex-direction: column; gap: 3px; }
  .optimizer-empty strong { font-size: 13px; }
  .optimizer-empty span { color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 12px; line-height: 1.45; }
  :global(.loading-icon) { animation: fsrs-optimizer-spin 1s linear infinite; }
  @keyframes fsrs-optimizer-spin { to { transform: rotate(360deg); } }

  @container (max-width: 620px) {
    .optimizer-title { grid-template-columns: 20px minmax(0, 1fr) auto; }
    .optimizer-title > :global([data-slot="button"]) { grid-column: 1 / -1; width: 100%; }
  }

  @container (max-width: 390px) {
    .fsrs-parameter-grid, .fsrs-reference-grid { grid-template-columns: 1fr; }
    .fsrs-parameter-values { min-width: 88px; }
  }
</style>
