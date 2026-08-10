<script lang="ts">
  import { CalendarDays } from "lucide-svelte";
  import type { StatisticsHeatmapDay } from "@/question-bank/core/statistics";

  export let days: StatisticsHeatmapDay[] = [];
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
</script>

<section class="statistics-panel mt-4 border p-3" aria-labelledby="statistics-heatmap-heading" data-testid="statistics-heatmap">
  <div class="flex items-center justify-between gap-2">
    <div class="flex items-center gap-2"><CalendarDays size={16} aria-hidden="true" /><h3 id="statistics-heatmap-heading" class="font-semibold">{label("statisticsHeatmap", "Activity heatmap")}</h3></div>
    <span class="text-xs opacity-70">{days.length} {label("statisticsDays", "days")}</span>
  </div>
  {#if days.length === 0}
    <p class="mt-4 text-sm opacity-70">{label("statisticsNoAttempts", "No attempts in this range")}</p>
  {:else}
    <div class="statistics-heatmap-scroll mt-3" role="img" aria-label={label("statisticsHeatmap", "Activity heatmap")}>
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
</section>
