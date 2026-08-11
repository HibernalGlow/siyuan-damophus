<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { PluginIconName } from "@/libs/plugin-icons";
  import { ArrowLeft, ChevronDown, ChevronRight, FoldVertical, LayoutGrid, Search, UnfoldVertical } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import "@/styles/lucide-outline.css";

  export let groups: string[] = [];
  export let categorySections: Array<{
    id: string;
    label: string;
    description?: string;
    icon?: PluginIconName;
    groups: string[];
    enabled?: number;
    total?: number;
  }> = [];
  export let focusGroup = "";
  export let getGroupLabel: (group: string) => string = (group) => group;
  export let categoryLabel = "Setting categories";
  export let categoryDescription = "Choose which settings to display.";
  export let preferencesLabel = "Preferences";
  export let mobile = false;
  export let showCategories = false;
  export let backLabel = "Back";
  export let searchPlaceholder = "Search modules";
  export let expandAllLabel = "Expand all";
  export let collapseAllLabel = "Collapse all";
  export let noMatchesLabel = "No modules match your search.";
  export let overviewLabel = "Back to overview";
  export let showOverviewLink = false;
  /** Persisted expand state; missing entries default to expanded. */
  export let expandedState: Record<string, boolean> = {};
  export let getGroupIcon: (group: string, index: number) => PluginIconName = (group) => (
    group === "开关" ? "power" : group === "入口" ? "waypoints" : group === "设置" ? "settings" : "film"
  );

  const dispatch = createEventDispatcher<{
    select: string;
    back: void;
    overview: void;
    expandedChanged: Record<string, boolean>;
  }>();

  let openCategories: Record<string, boolean> = { ...expandedState };
  let query = "";

  $: focusIcon = getGroupIcon(focusGroup, Math.max(0, groups.indexOf(focusGroup)));
  $: normalizedQuery = query.trim().toLowerCase();
  $: searching = normalizedQuery.length > 0;
  $: visibleSections = searching
    ? categorySections
      .map((category) => ({
        ...category,
        groups: category.groups.filter((group) => getGroupLabel(group).toLowerCase().includes(normalizedQuery)),
      }))
      .filter((category) => category.groups.length > 0)
    : categorySections;
  $: allCategoriesOpen = categorySections.length > 0
    && categorySections.every((category) => openCategories[category.id] ?? true);

  function isCategoryOpen(id: string, categoryState = openCategories) {
    if (searching) return true;
    return categoryState[id] ?? true;
  }

  function toggleCategory(id: string) {
    openCategories = { ...openCategories, [id]: !isCategoryOpen(id) };
    dispatch("expandedChanged", openCategories);
  }

  function setAllCategories(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const category of categorySections) next[category.id] = open;
    openCategories = next;
    dispatch("expandedChanged", openCategories);
  }

  function selectGroup(group: string) {
    dispatch("select", group);
  }

</script>

{#if mobile}
  {#if showCategories}
    <section class="damophus-settings-category-page min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3" data-testid="setting-mobile-navigation" aria-label={categoryLabel}>
      <header class="border-b border-border px-2 pb-3">
        <strong class="block text-base font-semibold">Damophus</strong>
        <span class="text-xs text-muted-foreground">{preferencesLabel}</span>
      </header>
      <p class="sr-only">{categoryDescription}</p>
      {#if categorySections.length > 0}
        <div class="mt-3 flex items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              bind:value={query}
              type="search"
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              class="h-10 pl-8 text-sm"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            class="size-10 shrink-0 text-muted-foreground"
            title={allCategoriesOpen ? collapseAllLabel : expandAllLabel}
            aria-label={allCategoriesOpen ? collapseAllLabel : expandAllLabel}
            onclick={() => setAllCategories(!allCategoriesOpen)}
          >
            {#if allCategoriesOpen}<FoldVertical class="size-4" aria-hidden="true" />{:else}<UnfoldVertical class="size-4" aria-hidden="true" />{/if}
          </Button>
        </div>
      {/if}
      <nav class="mt-3 flex flex-col gap-2" aria-label={categoryLabel}>
        {#if searching && visibleSections.length === 0}
          <p class="px-2 py-6 text-center text-xs text-muted-foreground">{noMatchesLabel}</p>
        {/if}
        {#if visibleSections.length > 0}
          {#each visibleSections as category}
            <section class="overflow-hidden rounded-md border border-border/80">
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2 border-0 bg-muted/30 px-3 py-2 text-left text-sm font-medium text-inherit [appearance:none] [font:inherit]"
                aria-expanded={isCategoryOpen(category.id, openCategories)}
                onclick={() => toggleCategory(category.id)}
              >
                <ChevronDown class={`size-4 shrink-0 transition-transform ${isCategoryOpen(category.id, openCategories) ? "" : "-rotate-90"}`} aria-hidden="true" />
                {#if category.icon}<PluginIcon name={category.icon} className="size-4 shrink-0 text-muted-foreground" />{/if}
                <span class="min-w-0 flex-1 truncate">{category.label}</span>
                {#if category.total !== undefined}<span class="text-xs font-normal text-muted-foreground">{category.enabled ?? 0}/{category.total}</span>{/if}
              </button>
              {#if isCategoryOpen(category.id, openCategories)}
                <div class="border-t border-border/80 p-1">
                  {#each category.groups as group}
                    {@const icon = getGroupIcon(group, groups.indexOf(group))}
                    <Button
                      variant={group === focusGroup ? "secondary" : "ghost"}
                      class={group === focusGroup
                        ? "min-h-11 w-full touch-manipulation justify-between rounded-md border-l-2 border-primary px-3 text-left text-foreground"
                        : "min-h-11 w-full touch-manipulation justify-between rounded-md px-3 text-left text-muted-foreground"}
                      aria-current={group === focusGroup ? "page" : undefined}
                      onclick={() => selectGroup(group)}
                    >
                      <span class="flex min-w-0 items-center gap-3">
                        <PluginIcon name={icon} className="size-5 shrink-0" />
                        <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
                      </span>
                      <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
                    </Button>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}
        {:else}
          {#each groups as group, index}
            {@const icon = getGroupIcon(group, index)}
            <Button
              variant={group === focusGroup ? "secondary" : "ghost"}
              class={group === focusGroup
                ? "min-h-12 w-full touch-manipulation justify-between rounded-lg border-l-2 border-primary px-3 text-left text-foreground"
                : "min-h-12 w-full touch-manipulation justify-between rounded-lg px-3 text-left text-muted-foreground"}
              aria-current={group === focusGroup ? "page" : undefined}
              onclick={() => selectGroup(group)}
            >
              <span class="flex min-w-0 items-center gap-3">
                <PluginIcon name={icon} className="size-5 shrink-0" />
                <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
              </span>
              <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
            </Button>
          {/each}
        {/if}
      </nav>
    </section>
  {:else}
    <header class="damophus-settings-detail-header w-full shrink-0 border-b border-border px-3 py-3" data-testid="setting-mobile-detail-navigation">
      <Button
        variant="ghost"
        class="min-h-10 touch-manipulation gap-2 px-2 text-left"
        aria-label={backLabel}
        title={backLabel}
        onclick={() => dispatch("back")}
      >
        <ArrowLeft class="size-4 shrink-0" />
        <PluginIcon name={focusIcon} className="size-4 shrink-0 text-primary" />
        <span class="min-w-0 truncate">{getGroupLabel(focusGroup)}</span>
      </Button>
    </header>
  {/if}
{:else}
  <nav
    class="w-52 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3"
    aria-label={categoryLabel}
    data-testid="setting-desktop-navigation"
  >
    <div class="mb-3 border-b border-border px-2 pb-3">
      <div class="flex items-center justify-between gap-1">
        <div class="min-w-0">
          <strong class="block text-sm font-semibold">Damophus</strong>
          <span class="text-xs text-muted-foreground">{preferencesLabel}</span>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          {#if showOverviewLink}
            <Button
              variant="ghost"
              size="icon-sm"
              class="text-muted-foreground"
              title={overviewLabel}
              aria-label={overviewLabel}
              onclick={() => dispatch("overview")}
            >
              <LayoutGrid class="size-4" aria-hidden="true" />
            </Button>
          {/if}
          {#if categorySections.length > 1}
            <Button
              variant="ghost"
              size="icon-sm"
              class="shrink-0 text-muted-foreground"
              title={allCategoriesOpen ? collapseAllLabel : expandAllLabel}
              aria-label={allCategoriesOpen ? collapseAllLabel : expandAllLabel}
              onclick={() => setAllCategories(!allCategoriesOpen)}
            >
              {#if allCategoriesOpen}<FoldVertical class="size-4" aria-hidden="true" />{:else}<UnfoldVertical class="size-4" aria-hidden="true" />{/if}
            </Button>
          {/if}
        </div>
      </div>
      {#if categorySections.length > 0}
        <div class="relative mt-2">
          <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            bind:value={query}
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            class="h-8 pl-7 text-xs"
          />
        </div>
      {/if}
    </div>
    {#if searching && visibleSections.length === 0}
      <p class="px-2 py-6 text-center text-xs text-muted-foreground">{noMatchesLabel}</p>
    {/if}
    {#if visibleSections.length > 0}
      <div class="flex flex-col gap-1.5">
        {#each visibleSections as category}
          <section>
            <button
              type="button"
              class="group flex h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-xs font-semibold text-muted-foreground [appearance:none] [font:inherit] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-expanded={isCategoryOpen(category.id, openCategories)}
              title={category.description}
              onclick={() => toggleCategory(category.id)}
            >
              <ChevronDown class={`size-3.5 shrink-0 transition-transform ${isCategoryOpen(category.id, openCategories) ? "" : "-rotate-90"}`} aria-hidden="true" />
              {#if category.icon}<PluginIcon name={category.icon} className="size-3.5 shrink-0" />{/if}
              <span class="min-w-0 flex-1 truncate">{category.label}</span>
              {#if category.total !== undefined}<span class="font-normal tabular-nums">{category.enabled ?? 0}/{category.total}</span>{/if}
            </button>
            {#if isCategoryOpen(category.id, openCategories)}
              <ul class="m-0 mt-0.5 flex list-none flex-col gap-0.5 p-0 pl-1">
                {#each category.groups as group}
                  {@const icon = getGroupIcon(group, groups.indexOf(group))}
                  <li>
                    <Button
                      variant={group === focusGroup ? "secondary" : "ghost"}
                      class={group === focusGroup
                        ? "h-8 w-full touch-manipulation justify-start rounded-md border-l-2 border-primary px-2.5 text-foreground"
                        : "h-8 w-full touch-manipulation justify-start rounded-md px-2.5 text-muted-foreground"}
                      aria-current={group === focusGroup ? "page" : undefined}
                      onclick={() => selectGroup(group)}
                    >
                      <PluginIcon name={icon} className="size-4 shrink-0" />
                      <span class="min-w-0 truncate text-[13px]">{getGroupLabel(group)}</span>
                    </Button>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}
      </div>
    {:else}
      <ul class="m-0 flex list-none flex-col gap-1 p-0">
        {#each groups as group, index}
          {@const icon = getGroupIcon(group, index)}
          <li>
            <Button
              variant={group === focusGroup ? "secondary" : "ghost"}
              class={group === focusGroup
                ? "h-9 w-full touch-manipulation justify-start rounded-md border-l-2 border-primary px-3 text-foreground"
                : "h-9 w-full touch-manipulation justify-start rounded-md px-3 text-muted-foreground"}
              aria-current={group === focusGroup ? "page" : undefined}
              onclick={() => selectGroup(group)}
            >
              <PluginIcon name={icon} className="size-4 shrink-0" />
              <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
            </Button>
          </li>
        {/each}
      </ul>
    {/if}
  </nav>
{/if}
