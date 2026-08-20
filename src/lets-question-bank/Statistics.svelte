<script lang="ts">
  import {
    AlertTriangle,
    BarChart3,
    BookOpen,
    Briefcase,
    Calendar,
    CalendarRange,
    CheckSquare,
    Clock3,
    Filter,
    Flame,
    FolderTree,
    Globe2,
    GraduationCap,
    GripHorizontal,
    HeartHandshake,
    HelpCircle,
    History,
    Landmark,
    ScrollText,
    ShieldAlert,
    ShieldCheck,
    Target,
    TrendingUp,
  } from "lucide-svelte";
  import * as Select from "@/components/ui/select";
  import { Badge } from "@/components/ui/badge";
  import { Input } from "@/components/ui/input";
  import StatisticsHeatmap from "./StatisticsHeatmap.svelte";
  import { resolveTopicDictionaryClassificationLabel, type TopicDictionaryDocument } from "@/question-bank/topic-dictionary";
  import {
    subjectCompletionPercent,
    subjectPlannedTotal,
    type SubjectQuestionTotals,
  } from "@/question-bank/core/subject-dashboard";
  import {
    defaultStatisticsLayout,
    statisticsCardDefaultHeight,
    statisticsCardMaxHeight,
    statisticsCardMinHeight,
    type StatisticsLayout,
  } from "@/question-bank/core/subject-dashboard";
  import type {
    StatisticsDimension,
    StatisticsRange,
    StatisticsSnapshot,
    StatisticsSort,
  } from "@/question-bank/core/statistics";

  import { topicSubjectIds } from "@/question-bank/topic-subjects";

  export let snapshot: StatisticsSnapshot | undefined;
  export let loading = false;
  export let range: StatisticsRange = 30;
  export let sort: StatisticsSort = "weakness";
  export let onRangeChange: ((value: StatisticsRange) => void) | undefined = undefined;
  export let onSortChange: ((value: StatisticsSort) => void) | undefined = undefined;
  export let topicDictionary: TopicDictionaryDocument | undefined = undefined;
  export let subjectQuestionTotals: SubjectQuestionTotals = {};
  export let onSubjectQuestionTotalChange: ((subjectId: string, value: string) => void) | undefined = undefined;
  export let subjectTotalsSaveStatus: "idle" | "saving" | "saved" | "error" = "idle";
  export let statisticsLayout: StatisticsLayout = defaultStatisticsLayout;
  export let onLayoutChange: ((layout: StatisticsLayout) => void) | undefined = undefined;
  export let translations: Record<string, string> = {};
  export let label: (key: string, fallback: string) => string = (_key, fallback) => fallback;

  function getSubjectIcon(subjectKey: string) {
    switch (subjectKey) {
      case "civil": return HeartHandshake;
      case "criminal": return ShieldAlert;
      case "civil-procedure": return ScrollText;
      case "criminal-procedure": return ShieldCheck;
      case "administrative": return Landmark;
      case "commercial-economic": return Briefcase;
      case "theory-law": return BookOpen;
      case "international-law": return Globe2;
      default: return HelpCircle;
    }
  }

  function getDimensionIcon(dim: StatisticsDimension) {
    switch (dim) {
      case "subject": return BookOpen;
      case "category": return FolderTree;
      case "year": return Calendar;
      case "question_type": return CheckSquare;
      default: return BarChart3;
    }
  }

  const subjectTranslationKeys: Readonly<Record<string, string>> = {
    civil: "lets-topic-dictionary.subjectCivil",
    criminal: "lets-topic-dictionary.subjectCriminal",
    "civil-procedure": "lets-topic-dictionary.subjectCivilProcedure",
    "criminal-procedure": "lets-topic-dictionary.subjectCriminalProcedure",
    administrative: "lets-topic-dictionary.subjectAdministrative",
    "commercial-economic": "lets-topic-dictionary.subjectCommercialEconomic",
    "theory-law": "lets-topic-dictionary.subjectTheoryLaw",
    "international-law": "lets-topic-dictionary.subjectInternationalLaw",
  };
  const defaultSubjectNames: Readonly<Record<string, string>> = {
    civil: "民法",
    criminal: "刑法",
    "civil-procedure": "民诉",
    "criminal-procedure": "刑诉",
    administrative: "行政法",
    "commercial-economic": "商经知",
    "theory-law": "理论法",
    "international-law": "三国法",
  };
  const questionTypeLabelKeys: Readonly<Record<string, string>> = {
    single: "questionTypeSingle",
    multiple: "questionTypeMultiple",
    indefinite: "questionTypeIndefinite",
    "true-false": "questionTypeTrueFalse",
    subjective: "questionTypeSubjective",
    group: "questionTypeGroup",
  };

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
  ];

  $: distributionByDimension = new Map(snapshot?.distributions.map((item) => [item.dimension, item]) ?? []);
  $: subjectMetrics = (() => {
    const fromDist = new Map((distributionByDimension.get("subject")?.items ?? []).map((m) => [m.key, m]));
    const keys = new Set<string>([
      ...topicSubjectIds,
      ...Object.keys(subjectQuestionTotals),
      ...fromDist.keys(),
    ]);
    return [...keys].map((key) => {
      const existing = fromDist.get(key);
      if (existing) return existing;
      return {
        key,
        label: key,
        totalQuestions: 0,
        attemptedQuestions: 0,
        attempts: 0,
        objectiveAttempts: 0,
        correct: 0,
        wrong: 0,
        accuracy: 0,
        averageDurationMs: 0,
        totalDurationMs: 0,
      };
    });
  })();
  $: maxTrendAttempts = Math.max(1, ...(snapshot?.trend.map((point) => point.attempts) ?? [1]));
  $: maxWeakness = Math.max(1, ...(snapshot?.weakQuestions.map((question) => question.weaknessScore) ?? [1]));
  $: localHeights = { ...defaultStatisticsLayout.heights, ...statisticsLayout?.heights };

  let expandedDimensions = new Set<string>();
  function toggleDimensionExpand(dimension: string): void {
    if (expandedDimensions.has(dimension)) {
      expandedDimensions.delete(dimension);
    } else {
      expandedDimensions.add(dimension);
    }
    expandedDimensions = expandedDimensions;
  }

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

  function ratingLabel(rating: string | undefined): string {
    if (!rating) return "";
    switch (rating) {
      case "again": return label("again", "重来");
      case "hard": return label("hard", "困难");
      case "good": return label("good", "良好");
      case "easy": return label("easy", "简单");
      default: return rating;
    }
  }

  function localizedMetricLabel(dimension: StatisticsDimension, key: string, fallback: string): string {
    if (key === "Unclassified") return label("statisticsUnclassified", "Unclassified");
    if (dimension === "subject") {
      const translationKey = subjectTranslationKeys[key];
      const defaultName = defaultSubjectNames[key] ?? fallback;
      return translationKey ? translations[translationKey] ?? defaultName : defaultName;
    }
    if (dimension === "question_type") {
      const labelKey = questionTypeLabelKeys[key];
      return labelKey ? label(labelKey, fallback) : fallback;
    }
    if (dimension === "category" && topicDictionary) {
      return resolveTopicDictionaryClassificationLabel(topicDictionary, "categories", key, fallback);
    }
    if (dimension === "collection" && key === "gold") {
      return label("statisticsCollectionGold", fallback);
    }
    return fallback;
  }

  function updateLayout(next: Partial<StatisticsLayout>): void {
    const nextHeights = next.heights ?? localHeights;
    localHeights = nextHeights;
    onLayoutChange?.({
      heights: nextHeights,
    });
  }

  function resizeCard(id: string, event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    const card = handle.closest<HTMLElement>("[data-resizable-card]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = card.getBoundingClientRect().height;
    handle.setPointerCapture?.(event.pointerId);

    const onMove = (move: PointerEvent) => {
      const height = Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, startHeight + move.clientY - startY));
      const rounded = Math.round(height);
      card.style.height = `${rounded}px`;
      localHeights = { ...localHeights, [id]: rounded };
    };
    const onEnd = (end: PointerEvent) => {
      const height = Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, Math.round(startHeight + end.clientY - startY)));
      card.style.height = `${height}px`;
      handle.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onEnd, true);
      window.removeEventListener("pointercancel", onEnd, true);
      updateLayout({ heights: { ...localHeights, [id]: height } });
    };

    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onEnd, true);
    window.addEventListener("pointercancel", onEnd, true);
  }

  function resizeCardByKeyboard(id: string, event: KeyboardEvent): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const card = handle.closest<HTMLElement>("[data-resizable-card]");
    const current = localHeights[id] ?? card?.getBoundingClientRect().height ?? statisticsCardDefaultHeight;
    const height = Math.min(statisticsCardMaxHeight, Math.max(statisticsCardMinHeight, current + (event.key === "ArrowDown" ? 24 : -24)));
    if (card) card.style.height = `${height}px`;
    localHeights = { ...localHeights, [id]: height };
    updateLayout({ heights: { ...localHeights, [id]: height } });
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
      <div class="statistics-metric p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium opacity-75">{label("statisticsCoverage", "Question coverage")}</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target size={15} />
          </div>
        </div>
        <strong class="mt-2 block text-2xl font-bold tracking-tight">{snapshot.overview.attemptedQuestions} <span class="text-sm font-normal opacity-60">/ {snapshot.overview.totalQuestions}</span></strong>
        <span class="text-xs opacity-65">{label("statisticsAttemptedAll", "Attempted / all questions")}</span>
      </div>

      <div class="statistics-metric p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium opacity-75">{label("statisticsAccuracy", "Objective accuracy")}</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp size={15} />
          </div>
        </div>
        <strong class="mt-2 block text-2xl font-bold tracking-tight">{snapshot.overview.accuracy}%</strong>
        <span class="text-xs opacity-65">{snapshot.overview.correct} {label("correct", "correct")} · {snapshot.overview.wrong} {label("incorrect", "wrong")}</span>
      </div>

      <div class="statistics-metric p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium opacity-75">{label("statisticsAttempts", "Attempts")}</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Flame size={15} />
          </div>
        </div>
        <strong class="mt-2 block text-2xl font-bold tracking-tight">{snapshot.overview.attempts}</strong>
        <span class="text-xs opacity-65">{label("statisticsObjectiveAttempts", "Objective attempts")} {snapshot.overview.objectiveAttempts}</span>
      </div>

      <div class="statistics-metric p-3.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-medium opacity-75">{label("statisticsAverageTime", "Average time")}</span>
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock3 size={15} />
          </div>
        </div>
        <strong class="mt-2 block text-2xl font-bold tracking-tight">{duration(snapshot.overview.averageDurationMs)}</strong>
        <span class="text-xs opacity-65">{label("statisticsTotal", "Total")} {duration(snapshot.overview.totalDurationMs)}</span>
      </div>
    </div>

    <section
      class="statistics-panel statistics-resizable-panel relative flex min-h-0 flex-col overflow-hidden mt-4 p-4"
      aria-labelledby="statistics-subject-progress-heading"
      data-testid="subject-dashboard"
      data-resizable-card="subject-progress"
      style={localHeights["subject-progress"] ? `height: ${localHeights["subject-progress"]}px;` : undefined}
    >
      <div class="flex shrink-0 items-center justify-between gap-2">
        <div class="flex items-center gap-2.5">
          <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap size={16} />
          </div>
          <div>
            <h3 id="statistics-subject-progress-heading" class="font-semibold text-sm">{label("statisticsSubjectProgress", "Subject progress")}</h3>
            <p class="text-xs opacity-65">{label("statisticsSubjectProgressHint", "设置计划总题数后按计划计算，支持逐步录入题目")}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          {#if subjectTotalsSaveStatus === "saving"}
            <span class="text-xs text-muted-foreground animate-pulse">保存中...</span>
          {:else if subjectTotalsSaveStatus === "saved"}
            <span class="text-xs text-emerald-600 dark:text-emerald-400 font-normal">已保存</span>
          {:else if subjectTotalsSaveStatus === "error"}
            <span class="text-xs text-destructive font-normal">保存失败</span>
          {/if}
          <Badge variant="outline" class="rounded-full text-xs font-normal">{subjectMetrics.length} {label("statisticsSubjects", "subjects")}</Badge>
        </div>
      </div>
      <div class="statistics-card-content mt-3 min-h-0 flex-1 overflow-y-auto">
        {#if subjectMetrics.length === 0}
          <p class="text-sm opacity-70">{label("statisticsNoSubjects", "No indexed subjects")}</p>
        {:else}
          <div class="statistics-subject-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {#each subjectMetrics as subject (subject.key)}
              {@const plannedTotal = subjectPlannedTotal(subject, subjectQuestionTotals[subject.key])}
              {@const completionRate = subjectCompletionPercent(subject.attemptedQuestions, plannedTotal)}
              {@const subjectName = localizedMetricLabel("subject", subject.key, subject.label)}
              <article class="statistics-subject p-3.5 flex flex-col justify-between" data-subject={subject.key}>
                <div>
                  <div class="flex items-center justify-between gap-2.5">
                    <div class="flex items-center gap-2 min-w-0">
                      <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <svelte:component this={getSubjectIcon(subject.key)} size={15} />
                      </div>
                      <strong class="min-w-0 truncate text-sm font-semibold">{subjectName}</strong>
                    </div>
                    <span class="shrink-0 text-base font-bold tabular-nums text-foreground">{completionRate}%</span>
                  </div>
                  <div class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted/80" role="progressbar" aria-label={`${subjectName} ${label("statisticsCompletion", "completion")}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={completionRate}>
                    <div class="h-full rounded-full bg-primary transition-all duration-300" style={`width: ${completionRate}%`}></div>
                  </div>
                  <div class="mt-2 flex items-center justify-between gap-x-2 text-xs opacity-75">
                    <span>{label("statisticsAttempted", "已作答")} <span class="font-medium text-foreground">{subject.attemptedQuestions}</span> / {plannedTotal}</span>
                    <span>{label("statisticsAccuracy", "正确率")} <span class="font-medium text-foreground">{subject.accuracy}%</span></span>
                  </div>
                </div>
                <div class="mt-3 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-xs">
                  <span class="opacity-70">{label("statisticsIndexedQuestions", "已录入")} <span class="font-medium text-foreground">{subject.totalQuestions}</span></span>
                  <label class="flex items-center gap-1.5">
                    <span class="whitespace-nowrap opacity-70">{label("statisticsPlannedTotal", "计划总题数")}</span>
                    <Input
                      class="h-6 w-16 text-center text-xs rounded-md font-medium border-border/70 bg-background/50 focus:bg-background px-1"
                      type="number"
                      min={subject.totalQuestions}
                      step="1"
                      value={subjectQuestionTotals[subject.key] ?? ""}
                      placeholder={String(subject.totalQuestions)}
                      aria-label={`${subjectName} ${label("statisticsPlannedTotal", "计划总题数")}`}
                      oninput={(event) => onSubjectQuestionTotalChange?.(subject.key, event.currentTarget.value)}
                      onchange={(event) => onSubjectQuestionTotalChange?.(subject.key, event.currentTarget.value)}
                    />
                  </label>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
      <button
        type="button"
        class="statistics-card-resizer"
        aria-label={`${label("statisticsResizeCard", "Adjust card height")}: ${label("statisticsSubjectProgress", "Subject progress")}`}
        title={label("statisticsResizeCardHint", "Drag to adjust card height")}
        onpointerdown={(event) => resizeCard("subject-progress", event)}
        onkeydown={(event) => resizeCardByKeyboard("subject-progress", event)}
      ><GripHorizontal size={15} aria-hidden="true" /></button>
    </section>

    <div class="mt-4 grid gap-4 xl:grid-cols-[1.2fr_1fr] items-start">
      <section
        class="statistics-panel statistics-resizable-panel relative flex min-h-0 flex-col overflow-hidden p-4"
        aria-labelledby="statistics-trend-heading"
        data-testid="trend-dashboard"
        data-resizable-card="trend"
        style={localHeights["trend"] ? `height: ${localHeights["trend"]}px;` : undefined}
      >
        <div class="flex shrink-0 items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <TrendingUp size={14} />
            </div>
            <h3 id="statistics-trend-heading" class="font-semibold text-sm">{label("statisticsTrend", "Trend")}</h3>
          </div>
          <Badge variant="outline" class="rounded-full text-xs font-normal">{snapshot.trend.length} {label("statisticsDays", "days")}</Badge>
        </div>
        <div class="statistics-card-content mt-3 min-h-0 flex-1 overflow-y-auto">
          {#if snapshot.trend.length === 0}
            <p class="text-sm opacity-70">{label("statisticsNoAttempts", "No attempts in this range")}</p>
          {:else}
            <div class="space-y-2">
              {#each snapshot.trend as point (point.date)}
                <div class="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2.5 text-xs">
                  <span class="font-medium opacity-75 tabular-nums">{point.date.slice(5)}</span>
                  <div class="h-2 overflow-hidden rounded-full bg-muted/80" aria-label={`${point.date} ${point.attempts} 次`}>
                    <div class="h-full rounded-full bg-primary transition-all duration-300" style={`width: ${(point.attempts / maxTrendAttempts) * 100}%`}></div>
                  </div>
                  <span class="text-right font-medium tabular-nums">{point.accuracy}%</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <button
          type="button"
          class="statistics-card-resizer"
          aria-label={`${label("statisticsResizeCard", "Adjust card height")}: ${label("statisticsTrend", "Trend")}`}
          title={label("statisticsResizeCardHint", "Drag to adjust card height")}
          onpointerdown={(event) => resizeCard("trend", event)}
          onkeydown={(event) => resizeCardByKeyboard("trend", event)}
        ><GripHorizontal size={15} aria-hidden="true" /></button>
      </section>

      <section
        class="statistics-panel statistics-resizable-panel relative flex min-h-0 flex-col overflow-hidden p-4"
        aria-labelledby="statistics-weak-heading"
        data-testid="weak-dashboard"
        data-resizable-card="weak"
        style={localHeights["weak"] ? `height: ${localHeights["weak"]}px;` : undefined}
      >
        <div class="flex shrink-0 items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <div class="flex h-6 w-6 items-center justify-center rounded-md bg-destructive/10 text-destructive">
              <AlertTriangle size={14} />
            </div>
            <h3 id="statistics-weak-heading" class="font-semibold text-sm">{label("statisticsWeak", "Weak questions")}</h3>
          </div>
          <Badge variant="outline" class="rounded-full text-xs font-normal">{snapshot.weakQuestions.length}</Badge>
        </div>
        <div class="statistics-card-content mt-3 min-h-0 flex-1 overflow-y-auto">
          {#if snapshot.weakQuestions.length === 0}
            <p class="text-sm opacity-70">{label("statisticsNoAttempts", "No attempts in this range")}</p>
          {:else}
            <div class="space-y-3">
              {#each snapshot.weakQuestions.slice(0, 8) as question (question.questionId)}
                {@const subjectKey = question.subject || ""}
                {@const subjectName = subjectKey ? localizedMetricLabel("subject", subjectKey, subjectKey) : ""}
                {@const categoryName = question.category ? localizedMetricLabel("category", question.category, question.category) : ""}
                <div class="border-b border-border/40 pb-2.5 last:border-0">
                  <div class="flex items-start justify-between gap-2 text-sm">
                    <div class="flex min-w-0 items-center gap-1.5 flex-wrap">
                      {#if subjectName}
                        <Badge variant="outline" class="font-normal text-[11px] py-0 px-1.5 rounded-md">
                          {subjectName}
                        </Badge>
                      {/if}
                      {#if categoryName && categoryName !== subjectName}
                        <span class="text-xs opacity-75 font-normal">
                          {categoryName}
                        </span>
                      {/if}
                      <strong class="min-w-0 truncate text-xs font-semibold" title={question.questionId}>
                        {question.label}
                      </strong>
                    </div>
                    <span class="shrink-0 text-xs font-semibold tabular-nums">{question.accuracy}%</span>
                  </div>
                  <div class="mt-1.5 flex items-center gap-2 text-[11px] opacity-75 flex-wrap">
                    <span>{question.wrong} 错 / {question.attempts} 次</span>
                    <span>·</span>
                    <span>均耗时 {duration(question.averageDurationMs)}</span>
                    {#if question.latestRating}
                      <span>·</span>
                      <span class="font-medium">
                        最近: {ratingLabel(question.latestRating)}
                      </span>
                    {/if}
                    {#if question.lastAnsweredAt}
                      <span>·</span>
                      <span>{question.lastAnsweredAt.slice(5, 16).replace("T", " ")}</span>
                    {/if}
                    <span class="ml-auto font-mono text-[10px] opacity-60">指数 {question.weaknessScore.toFixed(1)}</span>
                  </div>
                  <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/80">
                    <div
                      class="h-full rounded-full bg-destructive transition-all duration-300"
                      style={`width: ${(question.weaknessScore / maxWeakness) * 100}%;`}
                    ></div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <button
          type="button"
          class="statistics-card-resizer"
          aria-label={`${label("statisticsResizeCard", "Adjust card height")}: ${label("statisticsWeak", "Weak questions")}`}
          title={label("statisticsResizeCardHint", "Drag to adjust card height")}
          onpointerdown={(event) => resizeCard("weak", event)}
          onkeydown={(event) => resizeCardByKeyboard("weak", event)}
        ><GripHorizontal size={15} aria-hidden="true" /></button>
      </section>
    </div>

    <StatisticsHeatmap
      days={snapshot.heatmap}
      height={localHeights["heatmap"]}
      onResize={(h) => updateLayout({ heights: { ...localHeights, heatmap: h } })}
      {label}
    />

    <div class="mt-4 grid gap-4 items-start" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));" data-testid="distribution-cards">
      {#each dimensions as dimension (dimension.value)}
        {@const distribution = distributionByDimension.get(dimension.value)}
        {@const items = distribution?.items ?? []}
        {@const expanded = expandedDimensions.has(dimension.value)}
        {@const visibleItems = expanded ? items : items.slice(0, 6)}
        <section
          class="statistics-panel statistics-resizable-panel relative flex min-h-0 flex-col overflow-hidden p-4"
          data-distribution-card={dimension.value}
          data-resizable-card={dimension.value}
          style={localHeights[dimension.value] ? `height: ${localHeights[dimension.value]}px;` : undefined}
        >
          <div class="flex shrink-0 items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <div class="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                <svelte:component this={getDimensionIcon(dimension.value)} size={14} />
              </div>
              <h3 class="text-sm font-semibold">{distributionTitle(dimension.value)}</h3>
            </div>
            <Badge variant="outline" class="rounded-full text-xs font-normal">{items.length} 项</Badge>
          </div>
          <div class="statistics-card-content mt-3 min-h-0 flex-1 overflow-y-auto">
            {#if items.length === 0}
              <p class="text-xs opacity-70">{label("statisticsNoData", "No data")}</p>
            {:else}
              <div class="space-y-2.5">
                {#each visibleItems as item (item.key)}
                  <div class="statistics-distribution-row text-xs">
                    <span class="truncate font-medium opacity-85" title={localizedMetricLabel(dimension.value, item.key, item.label)}>{localizedMetricLabel(dimension.value, item.key, item.label)}</span>
                    <span class="text-right font-semibold tabular-nums">{item.accuracy}%</span>
                    <div class="statistics-distribution-bar bg-muted/80">
                      <div class="h-full rounded-full bg-primary transition-all duration-300" style={`width: ${Math.max(item.attempts > 0 ? item.accuracy : 0, 2)}%`}></div>
                    </div>
                  </div>
                {/each}
              </div>
              {#if items.length > 6}
                <button
                  type="button"
                  class="statistics-expand-btn"
                  onclick={() => toggleDimensionExpand(dimension.value)}
                >
                  {expanded ? label("statisticsCollapse", "收起") : `${label("statisticsExpand", "展开全部")} (${items.length})`}
                </button>
              {/if}
            {/if}
          </div>
          <button
            type="button"
            class="statistics-card-resizer"
            aria-label={`${label("statisticsResizeCard", "Adjust card height")}: ${distributionTitle(dimension.value)}`}
            title={label("statisticsResizeCardHint", "Drag to adjust card height")}
            onpointerdown={(event) => resizeCard(dimension.value, event)}
            onkeydown={(event) => resizeCardByKeyboard(dimension.value, event)}
          ><GripHorizontal size={15} aria-hidden="true" /></button>
        </section>
      {/each}
    </div>

    <section
      class="statistics-panel statistics-resizable-panel relative flex min-h-0 flex-col overflow-hidden mt-4 p-4"
      aria-labelledby="statistics-history-heading"
      data-testid="recent-attempts-dashboard"
      data-resizable-card="recent-attempts"
      style={localHeights["recent-attempts"] ? `height: ${localHeights["recent-attempts"]}px;` : undefined}
    >
      <div class="flex shrink-0 items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <div class="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
            <History size={14} />
          </div>
          <h3 id="statistics-history-heading" class="font-semibold text-sm">{label("statisticsRecent", "Recent attempts")}</h3>
        </div>
      </div>
      <div class="statistics-card-content mt-3 min-h-0 flex-1 overflow-x-auto overflow-y-auto">
        <table class="w-full min-w-[34rem] text-left text-xs">
          <thead class="border-b border-border/40 text-[0.7rem] opacity-70">
            <tr>
              <th class="py-2 font-medium">时间</th>
              <th class="font-medium">题目</th>
              <th class="font-medium">结果</th>
              <th class="font-medium">评级</th>
              <th class="text-right font-medium">耗时</th>
            </tr>
          </thead>
          <tbody>
            {#each snapshot.recentAttempts.slice(0, 20) as attempt (attempt.attemptId)}
              <tr class="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                <td class="py-2.5 tabular-nums opacity-75">{attempt.answeredAt.slice(0, 16).replace("T", " ")}</td>
                <td class="font-medium">{attempt.questionId}</td>
                <td>
                  {#if attempt.objectiveCorrect === null}
                    <span class="opacity-75">主观</span>
                  {:else if attempt.objectiveCorrect}
                    <span class="text-emerald-600 dark:text-emerald-400 font-medium">正确</span>
                  {:else}
                    <span class="text-destructive font-medium">错误</span>
                  {/if}
                </td>
                <td>
                  {#if attempt.masteryRating}
                    <Badge variant="outline" class="font-normal text-[10px] py-0 px-1 rounded-sm">
                      {ratingLabel(attempt.masteryRating)}
                    </Badge>
                  {/if}
                </td>
                <td class="text-right tabular-nums opacity-75">{duration(attempt.durationMs ?? 0)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        class="statistics-card-resizer"
        aria-label={`${label("statisticsResizeCard", "Adjust card height")}: ${label("statisticsRecent", "Recent attempts")}`}
        title={label("statisticsResizeCardHint", "Drag to adjust card height")}
        onpointerdown={(event) => resizeCard("recent-attempts", event)}
        onkeydown={(event) => resizeCardByKeyboard("recent-attempts", event)}
      ><GripHorizontal size={15} aria-hidden="true" /></button>
    </section>
  {/if}
</section>

<style>
  .statistics-panel {
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color, var(--border)) 70%, transparent);
    background: color-mix(in srgb, var(--b3-theme-surface, var(--card)) 45%, var(--b3-theme-background, var(--background)));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .statistics-metric,
  .statistics-subject {
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color, var(--border)) 60%, transparent);
    background: color-mix(in srgb, var(--b3-theme-surface, var(--card)) 70%, var(--b3-theme-background, var(--background)));
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .statistics-metric:hover,
  .statistics-subject:hover {
    border-color: color-mix(in srgb, var(--b3-theme-primary, var(--primary)) 45%, var(--b3-border-color, var(--border)));
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
  }
  .statistics-distribution-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 3.5rem;
    gap: 4px 8px;
    align-items: center;
  }
  .statistics-distribution-bar {
    grid-column: 1 / -1;
    height: 5px;
    overflow: hidden;
    border-radius: 3px;
  }
  .statistics-expand-btn {
    margin-top: 8px;
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: var(--primary, var(--b3-theme-primary));
    font-size: 11px;
    cursor: pointer;
    text-align: left;
    opacity: 0.85;
  }
  .statistics-expand-btn:hover {
    opacity: 1;
    text-decoration: underline;
  }
  .statistics-resizable-panel {
    box-sizing: border-box;
    min-height: 120px;
    padding-bottom: 28px;
  }
  .statistics-card-content {
    box-sizing: border-box;
    min-height: 0;
    scrollbar-width: thin;
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
  .statistics-card-resizer:hover, .statistics-card-resizer:focus-visible {
    opacity: 1;
    color: var(--primary);
  }
  .statistics-card-resizer:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1px;
  }
</style>
