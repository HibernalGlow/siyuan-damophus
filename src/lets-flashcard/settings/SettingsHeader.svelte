<script lang="ts">
  import { Layers3, Pencil, Play, RefreshCw, Upload } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Switch } from "@/components/ui/switch";
  import type { FlashcardSettings } from "@/flashcard/types";

  export let workbenchMode: "make" | "review";
  export let config: FlashcardSettings;
  export let onWorkbenchModeChange: (mode: "make" | "review") => void;
  export let onReviewAll: () => void;
  export let onClearCache: () => void | Promise<void>;
  export let onImportSfp: () => void | Promise<void>;
  export let onSaveGlobalOnChange: () => void;
</script>

<header class="settings-header">
  <div class="settings-title"><Layers3 aria-hidden="true" /><strong>专项闪卡</strong></div>
  <div class="workbench-mode-toggle" role="group" aria-label="工作台模式">
    <Button variant={workbenchMode === "make" ? "default" : "outline"} size="sm" aria-pressed={workbenchMode === "make"} onclick={() => onWorkbenchModeChange("make")} title="制卡模式"><Pencil /><span>制卡</span></Button>
    <Button variant={workbenchMode === "review" ? "default" : "outline"} size="sm" aria-pressed={workbenchMode === "review"} onclick={() => onWorkbenchModeChange("review")} title="复习模式"><Play /><span>复习</span></Button>
  </div>
  <label class="workbench-auto-review"><span>登记后自动复习</span><Switch size="sm" checked={config.autoReviewAfterRegistration} onCheckedChange={(value) => { config.autoReviewAfterRegistration = value; onSaveGlobalOnChange(); }} aria-label="登记后自动复习" /></label>
  <label class="workbench-timer"><span>复习计时</span><Switch size="sm" checked={config.reviewTimerEnabled} onCheckedChange={(value) => { config.reviewTimerEnabled = value; onSaveGlobalOnChange(); }} aria-label="复习计时" /></label>
  <div class="flashcard-header-actions">
    <Button size="sm" onclick={onReviewAll} title="打开全部到期卡" aria-label="打开全部到期卡"><Play /><span>全部到期</span></Button>
    <Button variant="outline" size="sm" onclick={onClearCache} title="清除 SQL 缓存" aria-label="清除 SQL 缓存"><RefreshCw /><span>刷新缓存</span></Button>
    <Button variant="outline" size="sm" onclick={onImportSfp} title="导入 Specialized Flashcard Plugin 的分组设置" aria-label="导入 SFP 设置"><Upload /><span>导入 SFP</span></Button>
  </div>
</header>

<style>
  .settings-header {
    position: sticky;
    top: -14px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 42px;
    padding: 7px 0 8px;
    background: var(--background, var(--b3-theme-background));
    border-bottom: 1px solid var(--border, var(--b3-border-color));
  }
  .settings-title { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 0 1 auto; font-size: 14px; }
  .settings-title :global(svg) { width: 17px; height: 17px; color: var(--primary, var(--b3-theme-primary)); }
  .workbench-mode-toggle { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; padding: 2px; border: 1px solid var(--border, var(--b3-border-color)); border-radius: 7px; background: color-mix(in srgb, var(--muted, var(--b3-list-hover)) 45%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground, var(--b3-theme-on-background)) 5%, transparent); }
  .workbench-mode-toggle :global([data-slot="button"]) { min-width: 70px; }
  .workbench-auto-review, .workbench-timer { display: inline-flex; align-items: center; gap: 6px; min-width: max-content; color: var(--muted-foreground, var(--b3-theme-on-surface-light)); font-size: 11px; }
  .flashcard-header-actions {
    display: flex !important;
    flex: 0 0 auto;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    justify-content: flex-end;
    min-width: 0;
    padding-left: 5px;
    border-left: 1px solid var(--border, var(--b3-border-color));
  }

  @container (max-width: 620px) {
    .settings-header { top: -10px; min-height: 38px; }
    .settings-title strong { font-size: 13px; }
    .workbench-mode-toggle :global([data-slot="button"] span), .workbench-auto-review span, .workbench-timer span { display: none; }
    .workbench-mode-toggle :global([data-slot="button"]) { width: 28px; min-width: 28px; padding: 0; }
    .flashcard-header-actions :global([data-slot="button"] span) { display: none; }
    .flashcard-header-actions :global([data-slot="button"]) { width: 28px; padding: 0; }
  }

  @container (max-width: 390px) {
    .settings-title strong { display: none; }
  }
</style>
