<script lang="ts">
  import { CalendarDays, GripHorizontal, Maximize2, X } from "lucide-svelte";
  import type { StatisticsHeatmapDay } from "@/question-bank/core/statistics";
  import { statisticsCardDefaultHeight, statisticsCardMaxHeight, statisticsCardMinHeight } from "@/question-bank/core/subject-dashboard";

  export let days: StatisticsHeatmapDay[] = [];
  export let height: number | undefined = undefined;
  export let onResize: ((height: number) => void) | undefined = undefined;
  export let fullscreen = false;
  export let onFullscreen: ((event: MouseEvent) => void) | undefined = undefined;
  export let label: (key: string, fallback: string) => string = (_key, fallback) => fallback;

  const weekDays = 7;
  $: padded = (() => {
    if (days.length === 0) return [];
    const first = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
    const mondayOffset = (first + 6) % 7;
    return [...Array.from({ length: mondayOffset }, () => undefined), ...days];
  })();
  $: weeks = Math.ceil(padded.length / weekDays);
  $: columns = Array.from({ length: weeks }, (_, column) => padded.slice(column * weekDays, (column + 1) * weekDays));
  $: maxAttempts = Math.max(1, ...days.map((day) => day.attempts));
  $: monthLabels = columns.map((column) => {
    const day = column.find(Boolean);
    if (!day) return "";
    const date = new Date(`${(day as StatisticsHeatmapDay).date}T00:00:00Z`);
    return date.getUTCDate() <= 7 ? date.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" }) : "";
  });

  function level(day: StatisticsHeatmapDay | undefined): number {
    if (!day || day.attempts === 0) return 0;
    return Math.min(4, Math.ceil((day.attempts / maxAttempts) * 4));
  }

  function tip(day: StatisticsHeatmapDay | undefined): string {
    if (!day) return "";
    if (day.attempts === 0) return `${day.date} · ${label("statisticsNoAttempts", "No attempts")}`;
    return `${day.date} · ${day.attempts} ${label("statisticsAttemptsShort", "attempts")} · ${day.accuracy}% ${label("statisticsAccuracy", "accuracy")}`;
  }

  $: localHeight = height;

  function resize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    const card = handle.closest<HTMLElement>("[data-resizable-card]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = card.getBoundingClientRect().height;
    handle.setPointerCapture?.(event.pointerId);

    const onMove = (move: PointerEvent) => {
      const h = Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, startHeight + move.clientY - startY));
      const rounded = Math.round(h);
      card.style.height = `${rounded}px`;
      localHeight = rounded;
    };
    const onEnd = (end: PointerEvent) => {
      const h = Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, Math.round(startHeight + end.clientY - startY)));
      card.style.height = `${h}px`;
      handle.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("pointercancel", onEnd, true);
      localHeight = h;
      onResize?.(h);
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("pointercancel", onEnd, true);
  }

  function resizeByKeyboard(event: KeyboardEvent): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const card = handle.closest<HTMLElement>("[data-resizable-card]");
    const current = localHeight ?? card?.getBoundingClientRect().height ?? statisticsCardDefaultHeight;
    const next = Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, current + (event.key === "ArrowDown" ? 24 : -24)));
    if (card) card.style.height = `${next}px`;
    localHeight = next;
    onResize?.(next);
  }
</script>

<section
  class:statistics-card-fullscreen={fullscreen}
  class="statistics-panel statistics-resizable-panel relative flex min-h-0 flex-col overflow-hidden mt-4 p-4"
  aria-labelledby="statistics-heatmap-heading"
  data-testid="statistics-heatmap"
  data-resizable-card="heatmap"
  data-statistics-card-id="heatmap"
  style={`height: ${localHeight ?? statisticsCardDefaultHeight}px;`}
  role={fullscreen ? "dialog" : undefined}
  aria-modal={fullscreen ? "true" : undefined}
>
  <div class="flex shrink-0 items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <div class="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
        <CalendarDays size={14} />
      </div>
      <h3 id="statistics-heatmap-heading" class="font-semibold text-sm">{label("statisticsHeatmap", "Activity heatmap")}</h3>
    </div>
    <div class="statistics-card-actions">
      <span class="text-xs opacity-70">{days.length} {label("statisticsDays", "days")}</span>
      <button
        type="button"
        class="statistics-fullscreen-button"
        aria-label={fullscreen ? label("statisticsClosePreview", "Close preview") : `${label("statisticsFullscreenPreview", "Preview full screen")}: ${label("statisticsHeatmap", "Activity heatmap")}`}
        title={fullscreen ? label("statisticsClosePreview", "Close preview") : label("statisticsFullscreenPreview", "Preview full screen")}
        onclick={(event) => onFullscreen?.(event)}
      >{#if fullscreen}<X size={15} />{:else}<Maximize2 size={15} />{/if}</button>
    </div>
  </div>
  <div class="statistics-card-content mt-3 min-h-0 flex-1 overflow-x-auto overflow-y-auto">
    {#if days.length === 0}
      <p class="text-sm opacity-70">{label("statisticsNoAttempts", "No attempts in this range")}</p>
    {:else}
      <div class="statistics-heatmap-scroll" role="img" aria-label={label("statisticsHeatmap", "Activity heatmap")}>
        <div class="statistics-heatmap-months" style={`grid-template-columns: repeat(${weeks}, minmax(12px, 1fr))`}>
          {#each monthLabels as month}<span>{month}</span>{/each}
        </div>
        <div class="statistics-heatmap-grid" style={`grid-template-columns: repeat(${weeks}, minmax(12px, 1fr))`}>
          {#each columns as column}
            <div class="statistics-heatmap-column">
              {#each column as day}
                <span class={`statistics-heatmap-cell level-${level(day)}`} title={tip(day)} aria-label={tip(day)}></span>
              {/each}
            </div>
          {/each}
        </div>
        <div class="statistics-heatmap-legend text-xs opacity-70"><span>{label("statisticsLess", "Less")}</span>{#each [0, 1, 2, 3, 4] as value}<span class={`statistics-heatmap-cell level-${value}`}></span>{/each}<span>{label("statisticsMore", "More")}</span></div>
      </div>
    {/if}
  </div>
  {#if onResize}
    <button
      type="button"
      class="statistics-card-resizer"
      aria-label={`${label("statisticsResizeCard", "Adjust card height")}: ${label("statisticsHeatmap", "Activity heatmap")}`}
      title={label("statisticsResizeCardHint", "Drag to adjust card height")}
      onpointerdown={resize}
      onkeydown={resizeByKeyboard}
    ><GripHorizontal size={15} aria-hidden="true" /></button>
  {/if}
</section>

<style>
  .statistics-panel {
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color, var(--border)) 70%, transparent);
    background: color-mix(in srgb, var(--b3-theme-surface, var(--card)) 45%, var(--b3-theme-background, var(--background)));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .statistics-resizable-panel {
    box-sizing: border-box;
    min-height: 120px;
    padding-bottom: 28px;
  }
  .statistics-card-actions {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
  }
  .statistics-fullscreen-button {
    display: inline-flex;
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--b3-theme-on-surface, var(--muted-foreground));
    cursor: pointer;
    opacity: .68;
  }
  .statistics-fullscreen-button:hover,
  .statistics-fullscreen-button:focus-visible {
    background: color-mix(in srgb, var(--b3-theme-primary, var(--primary)) 12%, transparent);
    color: var(--b3-theme-primary, var(--primary));
    opacity: 1;
  }
  .statistics-fullscreen-button:focus-visible,
  .statistics-card-fullscreen:focus-visible {
    outline: 2px solid var(--b3-theme-primary, var(--ring));
    outline-offset: 2px;
  }
  .statistics-card-fullscreen {
    position: fixed !important;
    z-index: 10001;
    inset: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    width: auto !important;
    height: auto !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    padding-bottom: 16px;
    border-radius: 8px;
    background: var(--b3-theme-background, var(--background));
    box-shadow: var(--b3-dialog-shadow, 0 20px 48px rgb(0 0 0 / 32%));
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
  }
  .statistics-card-fullscreen .statistics-card-content {
    overflow: auto;
    overscroll-behavior: contain;
    touch-action: pan-x pan-y;
  }
  .statistics-card-fullscreen .statistics-card-resizer {
    display: none;
  }
  .statistics-card-content {
    box-sizing: border-box;
    min-height: 0;
    flex: 1 1 0%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--b3-theme-on-surface, var(--foreground)) 28%, transparent) transparent;
  }
  .statistics-card-content::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  .statistics-card-content::-webkit-scrollbar-track {
    background: transparent;
  }
  .statistics-card-content::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-on-surface, var(--foreground)) 25%, transparent);
  }
  .statistics-card-content::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--b3-theme-on-surface, var(--foreground)) 45%, transparent);
  }
  .statistics-card-resizer {
    position: absolute;
    right: 8px;
    bottom: 5px;
    display: inline-flex;
    width: 28px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--muted-foreground);
    cursor: ns-resize;
    opacity: .5;
    touch-action: none;
    transition: opacity 0.15s ease, color 0.15s ease;
  }
  .statistics-card-resizer:hover,
  .statistics-card-resizer:focus-visible {
    opacity: 1;
    color: var(--primary);
  }
  .statistics-card-resizer:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
  @media (max-width: 640px) {
    .statistics-card-fullscreen {
      inset: 0;
      padding-top: max(14px, env(safe-area-inset-top));
      padding-right: max(14px, env(safe-area-inset-right));
      padding-bottom: max(14px, env(safe-area-inset-bottom));
      padding-left: max(14px, env(safe-area-inset-left));
      border-width: 0;
      border-radius: 0;
    }
  }
</style>
