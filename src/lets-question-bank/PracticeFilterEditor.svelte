<script lang="ts">
  import { onDestroy } from "svelte";
  import { FilterBuilder, Willow, WillowDark } from "@svar-ui/svelte-filter";
  import { Locale } from "@svar-ui/svelte-core";
  import { cn, en } from "@svar-ui/filter-locales";
  import { ChevronDown, SlidersHorizontal, X } from "lucide-svelte";
  import {
    describePracticeFilterSpec,
    isPracticeFilterSpecEmpty,
    normalizePracticeFilterSpec,
    type PracticeFilterSpec,
  } from "@/question-bank/core/filter-spec";

  export let label: (key: string, fallback: string) => string;
  export let spec: PracticeFilterSpec = {};
  export let fields: { id: string; label: string; type: "tuple"; format: (value: unknown) => string }[] = [];
  export let options: Record<string, string[]> = {};
  export let total: number | undefined = undefined;
  export let matchedCount: number | undefined = undefined;
  export let emptyText: string;
  /** Per-dimension question counts appended to field labels when the panel opens. */
  export let counts: Record<string, number> = {};
  /** SiYuan language tag, e.g. "zh_CN"; picks the SVAR builder locale. */
  export let lang: string = (globalThis as { siyuan?: { config?: { lang?: string } } }).siyuan?.config?.lang ?? "zh_CN";

  $: localeWords = lang.startsWith("zh") ? cn : en;

  let open = false;
  let draft: PracticeFilterSpec = {};
  let panelFields: typeof fields = [];
  let builderKey = 0;
  let root: HTMLElement;
  let chip: HTMLElement;
  let panelStyle = "";
  let skin: typeof Willow = Willow;

  $: active = !isPracticeFilterSpecEmpty(spec);
  $: summary = active
    ? describePracticeFilterSpec(spec, {
        field: (field) => fields.find((item) => item.id === field)?.label ?? field,
        notPrefix: label("filterNotPrefix", "非"),
        and: label("filterJoinAnd", " 且 "),
        or: label("filterJoinOr", " 或 "),
      })
    : "";
  $: matchedText = matchedCount === undefined || total === undefined
    ? ""
    : label("filterMatchedCount", "命中 {matched} / {total} 题")
      .replace("{matched}", String(matchedCount))
      .replace("{total}", String(total));

  function openPanel(): void {
    // Freeze fields/labels (with counts) and the initial value so the builder
    // never re-initializes while the user edits; the {#key} remount handles resets.
    panelFields = fields.map((field) => {
      const count = counts[field.id];
      return Number.isFinite(count) ? { ...field, label: `${field.label} (${count})` } : field;
    });
    draft = normalizePracticeFilterSpec(spec);
    builderKey += 1;
    skin = darkBackground() ? WillowDark : Willow;
    open = true;
    requestAnimationFrame(positionPanel);
  }

  function darkBackground(): boolean {
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--b3-theme-background").trim();
    const match = background.match(/^#([0-9a-f]{6})$/iu);
    if (!match) return false;
    const value = parseInt(match[1], 16);
    const luminance = 0.2126 * ((value >> 16) & 255) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
    return luminance < 128;
  }

  function closePanel(): void {
    open = false;
  }

  function clearAll(): void {
    spec = {};
    draft = {};
    builderKey += 1;
  }

  function onBuilderChange(event: { value: unknown }): void {
    spec = normalizePracticeFilterSpec(event.value);
  }

  function positionPanel(): void {
    if (!open || !chip) return;
    const rect = chip.getBoundingClientRect();
    const panelWidth = Math.min(400, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelWidth - 8));
    const estimatedHeight = 420;
    const below = window.innerHeight - rect.bottom;
    const top = below < estimatedHeight && rect.top > estimatedHeight
      ? Math.max(8, rect.top - estimatedHeight - 8)
      : rect.bottom + 6;
    panelStyle = `left:${left}px; top:${top}px; width:${panelWidth}px;`;
  }

  function onPointerDown(event: PointerEvent): void {
    if (!open || !root) return;
    if (event.target instanceof Node && root.contains(event.target)) return;
    closePanel();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (open && event.key === "Escape") closePanel();
  }

  function onScrollCapture(): void {
    if (open) positionPanel();
  }

  $: if (open) document.addEventListener("pointerdown", onPointerDown, true);
  const releasePointer = () => document.removeEventListener("pointerdown", onPointerDown, true);
  onDestroy(releasePointer);
</script>

<svelte:window on:keydown={onKeyDown} onscrollcapture={onScrollCapture} on:resize={positionPanel} />

<span class="practice-filter-editor" bind:this={root}>
  <button
    type="button"
    class="practice-filter-chip"
    class:active
    bind:this={chip}
    onclick={open ? closePanel : openPanel}
    aria-expanded={open}
    title={label("filterEditorHint", "点击编辑筛选条件,支持 AND/OR 组合")}
  >
    <SlidersHorizontal size={13} aria-hidden="true" />
    <span class="practice-filter-chip-label">{active ? summary : emptyText}</span>
    <ChevronDown size={12} aria-hidden="true" />
  </button>
  {#if matchedText}<span class="practice-filter-matched">{matchedText}</span>{/if}

  {#if open}
    <div class="practice-filter-panel" role="dialog" aria-label={label("filterEditorTitle", "筛选条件")} style={panelStyle}>
      <div class="practice-filter-panel-head">
        <strong>{label("filterEditorTitle", "筛选条件")}</strong>
        <button type="button" class="practice-filter-close" onclick={closePanel} aria-label={label("cancel", "取消")}>
          <X size={14} />
        </button>
      </div>
      <div class="practice-filter-panel-body">
        {#key builderKey}
          <svelte:component this={skin} fonts={false}>
            <Locale words={localeWords} optional={true}>
              <FilterBuilder
                type="list"
                value={draft}
                fields={panelFields}
                {options}
                onchange={onBuilderChange}
              />
            </Locale>
          </svelte:component>
        {/key}
      </div>
      <div class="practice-filter-panel-foot">
        {#if matchedText}<span>{matchedText}</span>{/if}
        <button type="button" class="practice-filter-clear" onclick={clearAll}>{label("filterClear", "清空")}</button>
        <button type="button" class="practice-filter-done" onclick={closePanel}>{label("done", "完成")}</button>
      </div>
    </div>
  {/if}
</span>

<style>
  .practice-filter-editor {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .practice-filter-chip {
    max-width: 100%;
    min-height: 32px;
    padding: 4px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
    color: var(--b3-theme-on-background);
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .practice-filter-chip:hover {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color));
  }

  .practice-filter-chip.active {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 55%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary-lightest) 55%, var(--b3-theme-background));
    color: var(--b3-theme-primary);
  }

  .practice-filter-chip-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .practice-filter-matched {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    white-space: nowrap;
  }

  .practice-filter-panel {
    position: fixed;
    z-index: calc(var(--b3-layer-dialog, 90) + 20);
    max-width: calc(100vw - 16px);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-background);
    box-shadow: var(--b3-dialog-shadow, 0 8px 24px rgba(0, 0, 0, 0.25));
    display: flex;
    flex-direction: column;
  }

  .practice-filter-panel-head {
    padding: 8px 12px;
    border-bottom: 1px solid var(--b3-border-color);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }

  .practice-filter-close,
  .practice-filter-clear {
    border: 0;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .practice-filter-panel-body {
    max-height: min(52vh, 430px);
    overflow: auto;
    padding: 8px;
  }

  .practice-filter-panel-body :global(.wx-filter) {
    color: var(--b3-theme-on-background);
    font-size: 12px;
  }

  .practice-filter-panel-foot {
    padding: 8px 12px;
    border-top: 1px solid var(--b3-border-color);
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: var(--b3-theme-on-surface);
  }

  .practice-filter-clear {
    margin-left: auto;
    font-size: 12px;
  }

  .practice-filter-clear:hover {
    color: var(--b3-theme-on-background);
  }

  .practice-filter-done {
    min-height: 26px;
    padding: 3px 12px;
    border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 45%, var(--b3-border-color));
    border-radius: 5px;
    background: var(--b3-theme-primary);
    color: var(--b3-theme-primary-text, #fff);
    font-size: 12px;
    cursor: pointer;
  }
</style>
