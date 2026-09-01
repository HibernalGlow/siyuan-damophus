<script lang="ts">
  import { BookOpen, RotateCcw, SquarePen, Star } from "lucide-svelte";
  import { Badge } from "@/components/ui/badge";
  import { Button } from "@/components/ui/button";
  import { BOOKMARK_PRESET_TAGS } from "../bookmark-tags";
  import { countBookmarkTags, type StatisticsBookmarkEntry } from "./statistics-bookmarks";

  export let entries: StatisticsBookmarkEntry[] = [];
  export let label: (key: string, fallback: string) => string = (_key, fallback) => fallback;
  export let onOpenSource: ((entry: StatisticsBookmarkEntry) => void) | undefined = undefined;
  export let onStartRedo: (() => void) | undefined = undefined;

  $: tagCounts = countBookmarkTags(entries);
  $: activeTagChips = BOOKMARK_PRESET_TAGS
    .map((tag) => ({ ...tag, count: tagCounts.get(tag.key) ?? 0 }))
    .filter((tag) => tag.count > 0);

  function tagLabel(key: string): string {
    const preset = BOOKMARK_PRESET_TAGS.find((tag) => tag.key === key);
    return label(`tag_${key}`, preset?.defaultLabel ?? key);
  }
</script>

<section
  class="statistics-panel statistics-bookmarks mt-4 flex flex-col overflow-hidden p-4"
  aria-labelledby="statistics-bookmarks-heading"
  data-testid="statistics-bookmarks"
>
  <div class="flex shrink-0 items-center justify-between gap-2 flex-wrap">
    <div class="flex items-center gap-2">
      <div class="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
        <Star size={14} />
      </div>
      <h3 id="statistics-bookmarks-heading" class="font-semibold text-sm">{label("statisticsBookmarks", "收藏")}</h3>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      {#each activeTagChips as tag (tag.key)}
        <span class="statistics-bookmark-tag-chip" title={tagLabel(tag.key)}>
          <span aria-hidden="true">{tag.icon}</span>
          <span class="truncate">{tagLabel(tag.key)}</span>
          <span class="font-semibold tabular-nums">{tag.count}</span>
        </span>
      {/each}
      <Badge variant="outline" class="rounded-full text-xs font-normal">{entries.length}</Badge>
      <Button
        variant="outline"
        size="sm"
        class="h-7 gap-1.5 px-2.5 text-xs"
        disabled={entries.length === 0 || !onStartRedo}
        title={label("statisticsBookmarksRedoHint", "以“收藏”筛选开一场重做练习")}
        onclick={() => onStartRedo?.()}
      >
        <RotateCcw size={13} aria-hidden="true" />
        {label("statisticsBookmarksRedo", "重做收藏")}
      </Button>
    </div>
  </div>
  <div class="statistics-bookmark-list mt-3 pr-1">
    {#if entries.length === 0}
      <p class="text-sm opacity-70">{label("statisticsBookmarksEmpty", "还没有收藏的题目；答题时点击星标即可收藏")}</p>
    {:else}
      <div class="space-y-3">
        {#each entries as entry (entry.questionId)}
          <div class="border-b border-border/40 pb-2.5 last:border-0" data-bookmark-question-id={entry.questionId}>
            <div class="flex items-start justify-between gap-2 text-sm">
              <div class="flex min-w-0 items-center gap-1.5 flex-wrap">
                {#each entry.tags as tag (tag)}
                  <Badge variant="outline" class="gap-1 rounded-md px-1.5 py-0 text-[11px] font-normal">
                    <span aria-hidden="true">{BOOKMARK_PRESET_TAGS.find((preset) => preset.key === tag)?.icon ?? ""}</span>
                    {tagLabel(tag)}
                  </Badge>
                {/each}
                <strong class="min-w-0 flex-1 truncate text-xs font-semibold" title={entry.title}>{entry.title}</strong>
              </div>
              {#if entry.accuracy !== undefined}
                <span class="shrink-0 text-xs font-semibold tabular-nums" title={label("statisticsAccuracySort", "正确率")}>{entry.accuracy}%</span>
              {:else}
                <Badge variant="outline" class="shrink-0 rounded-md px-1.5 py-0 text-[11px] font-normal opacity-75">
                  {label("statisticsBookmarksUntouched", "未作答")}
                </Badge>
              {/if}
            </div>
            {#if entry.note}
              <div class="mt-1 flex min-w-0 items-start gap-1 text-[11px] opacity-75" title={entry.note} data-testid="bookmark-note">
                <SquarePen size={12} class="mt-0.5 shrink-0" aria-hidden="true" />
                <span class="min-w-0 truncate">{entry.note}</span>
              </div>
            {/if}
            <div class="mt-1.5 flex items-center gap-2 text-[11px] opacity-75">
              {#if entry.needsReview}
                <span class="font-medium text-destructive">{label("statisticsBookmarksNeedsReview", "需复习")}</span>
              {/if}
              {#if entry.attempts > 0}
                <span>{entry.attempts} {label("statisticsBookmarksAttemptsUnit", "次作答")}</span>
              {/if}
              {#if entry.blockId && onOpenSource}
                <button
                  type="button"
                  class="statistics-bookmark-open ml-auto"
                  title={label("statisticsBookmarksOpenSource", "查看原题")}
                  onclick={() => onOpenSource?.(entry)}
                >
                  <BookOpen size={12} aria-hidden="true" />
                  {label("statisticsBookmarksOpenSource", "查看原题")}
                </button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<style>
  .statistics-panel {
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color, var(--border)) 70%, transparent);
    background: color-mix(in srgb, var(--b3-theme-surface, var(--card)) 45%, var(--b3-theme-background, var(--background)));
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    position: relative;
  }
  .statistics-bookmark-tag-chip {
    display: inline-flex;
    max-width: 132px;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--b3-border-color, var(--border)) 60%, transparent);
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.4;
    color: var(--b3-theme-on-surface, var(--foreground));
  }
  .statistics-bookmark-list {
    max-height: 288px;
    overflow-y: auto;
  }
  .statistics-bookmark-open {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--b3-theme-primary, var(--primary));
    font-size: 11px;
    cursor: pointer;
  }
  .statistics-bookmark-open:hover {
    background: color-mix(in srgb, var(--b3-theme-primary, var(--primary)) 10%, transparent);
  }
</style>
