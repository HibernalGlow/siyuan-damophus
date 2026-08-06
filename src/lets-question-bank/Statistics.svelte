<script lang="ts">
  import { BarChart3, CalendarRange, Clock3, Filter, History, Target, TrendingUp } from "lucide-svelte";
  import * as Select from "@/components/ui/select";
  import { Badge } from "@/components/ui/badge";
  import type {
    StatisticsDimension,
    StatisticsRange,
    StatisticsSnapshot,
    StatisticsSort,
  } from "@/question-bank/core/statistics";

  export let snapshot: StatisticsSnapshot | undefined;
  export let loading = false;
  export let range: StatisticsRange = 30;
  export let sort: StatisticsSort = "weakness";
  export let onRangeChange: ((value: StatisticsRange) => void) | undefined = undefined;
  export let onSortChange: ((value: StatisticsSort) => void) | undefined = undefined;
  export let label: (key: string, fallback: string) => string = (_key, fallback) => fallback;

  const ranges: Array<{ value: string; label: string }> = [
    { value: "7", label: label("statistics7Days", "7 days") },
    { value: "30", label: label("statistics30Days", "30 days") },
    { value: "90", label: label("statistics90Days", "90 days") },
    { value: "all", label: label("statisticsAll", "All") },
  ];
  const dimensions: Array<{ value: StatisticsDimension; label: string }> = [
    { value: "subject", label: label("statisticsSubject", "Subject") },
    { value: "category", label: label("statisticsCategory", "Category") },
    { value: "year", label: label("statisticsYear", "Year") },
    { value: "question_type", label: label("statisticsType", "Question type") },
    { value: "collection", label: label("statisticsCollection", "Collection") },
  ];

  $: distributionByDimension = new Map(snapshot?.distributions.map((item) => [item.dimension, item]) ?? []);
  $: maxTrendAttempts = Math.max(1, ...(snapshot?.trend.map((point) => point.attempts) ?? [1]));
  $: maxWeakness = Math.max(1, ...(snapshot?.weakQuestions.map((question) => question.weaknessScore) ?? [1]));

  function duration(milliseconds: number): string {
    if (!milliseconds) return "0 秒";
    const seconds = Math.round(milliseconds / 1000);
    if (seconds < 60) return `${seconds} 秒`;
    return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  }

  function rangeValue(value: string): StatisticsRange {
    return value === "all" ? "all" : Number(value) as StatisticsRange;
  }

  function changeRange(value: string): void {
    onRangeChange?.(rangeValue(value));
  }

  function changeSort(value: string): void {
    onSortChange?.(value as StatisticsSort);
  }

  function distributionTitle(dimension: StatisticsDimension): string {
    return dimensions.find((item) => item.value === dimension)?.label ?? dimension;
  }
</script>

<section class="statistics-view min-h-0 flex-1 overflow-y-auto p-4" data-testid="statistics-view">
  <div class="statistics-toolbar flex flex-wrap items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <BarChart3 aria-hidden="true" />
      <div>
        <h2 class="text-base font-semibold">{label("statistics", "Statistics")}</h2>
        <span class="text-xs opacity-70">{label("statisticsTimezone", "Beijing time · Read only")}</span>
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <Select.Root type="single" value={String(range)} onValueChange={changeRange}>
        <Select.Trigger class="w-28" aria-label={label("statisticsRange", "统计范围")}>
          <CalendarRange aria-hidden="true" />
          <span>{ranges.find((item) => item.value === String(range))?.label}</span>
        </Select.Trigger>
        <Select.Content>
          {#each ranges as item (item.value)}
            <Select.Item value={item.value} label={item.label} />
          {/each}
        </Select.Content>
      </Select.Root>
      <Select.Root type="single" value={sort} onValueChange={changeSort}>
        <Select.Trigger class="w-36" aria-label={label("statisticsSort", "薄弱项排序")}>
          <Filter aria-hidden="true" />
          <span>{sort === "weakness" ? label("statisticsWeakness", "Composite weakness") : sort === "wrong" ? label("statisticsWrongCount", "Wrong count") : sort === "accuracy" ? label("statisticsAccuracySort", "Accuracy") : label("statisticsRecentSort", "Most recent")}</span>
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="weakness" label={label("statisticsWeakness", "Composite weakness")} />
          <Select.Item value="wrong" label={label("statisticsWrongCount", "Wrong count")} />
          <Select.Item value="accuracy" label={label("statisticsAccuracySort", "Accuracy")} />
          <Select.Item value="recent" label={label("statisticsRecentSort", "Most recent")} />
        </Select.Content>
      </Select.Root>
    </div>
  </div>

  {#if loading && !snapshot}
    <div class="flex min-h-48 items-center justify-center text-sm opacity-70">{label("loading", "Loading statistics...")}</div>
  {:else if !snapshot}
    <div class="flex min-h-48 items-center justify-center text-sm opacity-70">{label("statisticsEmpty", "No attempt data yet")}</div>
  {:else}
    <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="statistics-metric border p-3">
        <span class="flex items-center gap-2 text-xs opacity-70"><Target size={15} />{label("statisticsCoverage", "Question coverage")}</span>
        <strong class="mt-2 block text-2xl">{snapshot.overview.attemptedQuestions} / {snapshot.overview.totalQuestions}</strong>
        <span class="text-xs opacity-70">{label("statisticsAttemptedAll", "Attempted / all questions")}</span>
      </div>
      <div class="statistics-metric border p-3">
        <span class="flex items-center gap-2 text-xs opacity-70"><TrendingUp size={15} />{label("statisticsAccuracy", "Objective accuracy")}</span>
        <strong class="mt-2 block text-2xl">{snapshot.overview.accuracy}%</strong>
        <span class="text-xs opacity-70">{snapshot.overview.correct} {label("correct", "correct")} · {snapshot.overview.wrong} {label("incorrect", "wrong")}</span>
      </div>
      <div class="statistics-metric border p-3">
        <span class="flex items-center gap-2 text-xs opacity-70"><History size={15} />{label("statisticsAttempts", "Attempts")}</span>
        <strong class="mt-2 block text-2xl">{snapshot.overview.attempts}</strong>
        <span class="text-xs opacity-70">{label("statisticsObjectiveAttempts", "Objective attempts")} {snapshot.overview.objectiveAttempts}</span>
      </div>
      <div class="statistics-metric border p-3">
        <span class="flex items-center gap-2 text-xs opacity-70"><Clock3 size={15} />{label("statisticsAverageTime", "Average time")}</span>
        <strong class="mt-2 block text-2xl">{duration(snapshot.overview.averageDurationMs)}</strong>
        <span class="text-xs opacity-70">{label("statisticsTotal", "Total")} {duration(snapshot.overview.totalDurationMs)}</span>
      </div>
    </div>

    <div class="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section class="statistics-panel border p-3" aria-labelledby="statistics-trend-heading">
        <div class="flex items-center justify-between gap-2">
          <h3 id="statistics-trend-heading" class="font-semibold">{label("statisticsTrend", "Trend")}</h3>
          <Badge variant="outline">{snapshot.trend.length} {label("statisticsDays", "days")}</Badge>
        </div>
        {#if snapshot.trend.length === 0}
          <p class="mt-4 text-sm opacity-70">{label("statisticsNoAttempts", "No attempts in this range")}</p>
        {:else}
          <div class="mt-4 space-y-2">
            {#each snapshot.trend as point (point.date)}
              <div class="grid grid-cols-[5.5rem_1fr_4rem] items-center gap-2 text-xs">
                <span>{point.date.slice(5)}</span>
                <div class="h-2 overflow-hidden bg-muted" aria-label={`${point.date} ${point.attempts} 次`}>
                  <div class="h-full bg-primary" style={`width: ${(point.attempts / maxTrendAttempts) * 100}%`}></div>
                </div>
                <span class="text-right">{point.accuracy}%</span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <section class="statistics-panel border p-3" aria-labelledby="statistics-weak-heading">
        <div class="flex items-center justify-between gap-2">
          <h3 id="statistics-weak-heading" class="font-semibold">{label("statisticsWeak", "Weak questions")}</h3>
          <Badge variant="outline">{snapshot.weakQuestions.length}</Badge>
        </div>
        {#if snapshot.weakQuestions.length === 0}
          <p class="mt-4 text-sm opacity-70">{label("statisticsNoAttempts", "No attempts in this range")}</p>
        {:else}
          <div class="mt-3 space-y-2">
            {#each snapshot.weakQuestions.slice(0, 8) as question (question.questionId)}
              <div class="border-b pb-2 last:border-0">
                <div class="flex items-start justify-between gap-2 text-sm">
                  <strong class="min-w-0 truncate" title={question.questionId}>{question.label}</strong>
                  <span class="shrink-0">{question.accuracy}%</span>
                </div>
                <div class="mt-1 flex items-center gap-2 text-xs opacity-70">
                  <span>{question.wrong} 错 / {question.attempts} 次</span>
                  <span>{duration(question.averageDurationMs)}</span>
                  <span class="ml-auto">{question.weaknessScore.toFixed(1)}</span>
                </div>
                <div class="mt-1 h-1 overflow-hidden bg-muted"><div class="h-full bg-destructive" style={`width: ${(question.weaknessScore / maxWeakness) * 100}%`}></div></div>
              </div>
            {/each}
          </div>
        {/if}
      </section>
    </div>

    <section class="statistics-panel mt-4 border p-3" aria-labelledby="statistics-distribution-heading">
      <div class="flex items-center gap-2"><BarChart3 size={16} aria-hidden="true" /><h3 id="statistics-distribution-heading" class="font-semibold">{label("statisticsDistribution", "Distribution")}</h3></div>
      <div class="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {#each dimensions as dimension (dimension.value)}
          {@const distribution = distributionByDimension.get(dimension.value)}
          <div>
            <h4 class="text-sm font-medium">{distributionTitle(dimension.value)}</h4>
            <div class="mt-2 space-y-2">
              {#each distribution?.items.slice(0, 6) ?? [] as item (item.key)}
                <div class="grid grid-cols-[minmax(0,1fr)_3rem] gap-2 text-xs">
                  <span class="truncate" title={item.label}>{item.label}</span>
                  <span class="text-right">{item.accuracy}%</span>
                  <div class="col-span-2 h-1 overflow-hidden bg-muted"><div class="h-full bg-secondary-foreground/60" style={`width: ${Math.max(item.attempts > 0 ? item.accuracy : 0, 2)}%`}></div></div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="statistics-panel mt-4 border p-3" aria-labelledby="statistics-history-heading">
      <div class="flex items-center gap-2"><History size={16} aria-hidden="true" /><h3 id="statistics-history-heading" class="font-semibold">{label("statisticsRecent", "Recent attempts")}</h3></div>
      <div class="mt-3 overflow-x-auto">
        <table class="w-full min-w-[34rem] text-left text-xs">
          <thead class="border-b text-[0.7rem] opacity-70"><tr><th class="py-2">时间</th><th>题目</th><th>结果</th><th>评级</th><th class="text-right">耗时</th></tr></thead>
          <tbody>
            {#each snapshot.recentAttempts.slice(0, 20) as attempt (attempt.attemptId)}
              <tr class="border-b last:border-0"><td class="py-2">{attempt.answeredAt.slice(0, 16).replace("T", " ")}</td><td>{attempt.questionId}</td><td>{attempt.objectiveCorrect === null ? "主观" : attempt.objectiveCorrect ? "正确" : "错误"}</td><td>{attempt.masteryRating}</td><td class="text-right">{duration(attempt.durationMs ?? 0)}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</section>
