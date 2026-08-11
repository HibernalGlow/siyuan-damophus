<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { CheckCheck, ChevronDown, FoldVertical, ListChecks, Search, UnfoldVertical, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import type { PluginIconName } from "@/libs/plugin-icons";
  import type { SettingCategoryDefinition } from "@/libs/setting-categories";

  interface SwitchSettingItem {
    key: string;
    title: string;
    description?: string;
    value: unknown;
    icon?: PluginIconName;
  }

  interface SwitchCategory extends SettingCategoryDefinition {
    groups: string[];
  }

  export let items: SwitchSettingItem[] = [];
  export let categories: SwitchCategory[] = [];
  export let translate: (key: string, fallback: string) => string = (_key, fallback) => fallback;
  /** Persisted expand state; missing entries default to expanded. */
  export let expandedState: Record<string, boolean> = {};

  const dispatch = createEventDispatcher<{
    changed: { key: string; value: boolean };
    bulkChanged: { keys: string[]; value: boolean };
    expandedChanged: Record<string, boolean>;
  }>();

  let openCategories: Record<string, boolean> = { ...expandedState };
  let query = "";
  $: enabledCount = items.filter((item) => Boolean(item.value)).length;
  $: categoryItems = categories.map((category) => ({
    category,
    items: category.groups
      .map((key) => items.find((item) => item.key === key))
      .filter((item): item is SwitchSettingItem => Boolean(item)),
  }));
  $: normalizedQuery = query.trim().toLowerCase();
  $: searching = normalizedQuery.length > 0;
  $: visibleCategoryItems = searching
    ? categoryItems
      .map((entry) => ({
        ...entry,
        items: entry.items.filter((item) => matchesQuery(item, normalizedQuery)),
      }))
      .filter((entry) => entry.items.length > 0)
    : categoryItems;
  $: allCategoriesOpen = categoryItems.length > 0
    && categoryItems.every((entry) => openCategories[entry.category.id] ?? true);

  function matchesQuery(item: SwitchSettingItem, normalized: string) {
    if (translate(item.title, item.title).toLowerCase().includes(normalized)) return true;
    return item.description
      ? translate(item.description, item.description).toLowerCase().includes(normalized)
      : false;
  }

  function isOpen(id: string, categoryState = openCategories) {
    if (searching) return true;
    return categoryState[id] ?? true;
  }

  function toggleCategory(id: string) {
    openCategories = { ...openCategories, [id]: !isOpen(id) };
    dispatch("expandedChanged", openCategories);
  }

  function setAllCategories(open: boolean) {
    const next: Record<string, boolean> = {};
    for (const entry of categoryItems) next[entry.category.id] = open;
    openCategories = next;
    dispatch("expandedChanged", openCategories);
  }

  function setCategory(itemsInCategory: SwitchSettingItem[], value: boolean) {
    const keys = itemsInCategory.filter((item) => Boolean(item.value) !== value).map((item) => item.key);
    if (keys.length > 0) dispatch("bulkChanged", { keys, value });
  }
</script>

<section class="damophus-switch-settings min-w-0" data-testid="switch-settings">
  <div class="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
    <span class="flex items-center gap-2 text-xs text-muted-foreground">
      <ListChecks class="size-4" aria-hidden="true" />
      <span>{translate("settings.switchSummary", "{enabled} of {total} modules enabled").replace("{enabled}", String(enabledCount)).replace("{total}", String(items.length))}</span>
    </span>
    <div class="relative min-w-36 flex-1">
      <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        bind:value={query}
        type="search"
        placeholder={translate("settings.searchModules", "Search modules")}
        aria-label={translate("settings.searchModules", "Search modules")}
        class="h-8 pl-7 text-xs"
      />
    </div>
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        class="text-muted-foreground"
        title={allCategoriesOpen ? translate("settings.collapseAll", "Collapse all") : translate("settings.expandAll", "Expand all")}
        aria-label={allCategoriesOpen ? translate("settings.collapseAll", "Collapse all") : translate("settings.expandAll", "Expand all")}
        onclick={() => setAllCategories(!allCategoriesOpen)}
      >
        {#if allCategoriesOpen}<FoldVertical class="size-4" aria-hidden="true" />{:else}<UnfoldVertical class="size-4" aria-hidden="true" />{/if}
      </Button>
      <Button variant="ghost" size="sm" class="h-8 gap-1.5 px-2 text-muted-foreground" onclick={() => setCategory(items, true)}>
        <CheckCheck class="size-4" aria-hidden="true" />
        <span>{translate("settings.enableAll", "Enable all")}</span>
      </Button>
      <Button variant="ghost" size="sm" class="h-8 gap-1.5 px-2 text-muted-foreground" onclick={() => setCategory(items, false)}>
        <X class="size-4" aria-hidden="true" />
        <span>{translate("settings.disableAll", "Disable all")}</span>
      </Button>
    </div>
  </div>

  {#if searching && visibleCategoryItems.length === 0}
    <p class="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{translate("settings.noModuleMatches", "No modules match your search.")}</p>
  {/if}

  {#each visibleCategoryItems as entry (entry.category.id)}
    {@const categoryEnabled = entry.items.filter((item) => Boolean(item.value)).length}
    <section class="mb-2 overflow-hidden rounded-md border border-border last:mb-0" data-testid={`switch-category-${entry.category.id}`}>
      <header class="flex h-10 items-center bg-muted/30 pr-1.5">
        <button
          type="button"
          class="flex h-10 min-w-0 flex-1 items-center gap-2 border-0 bg-transparent px-2.5 text-left text-inherit [appearance:none] [font:inherit] transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={isOpen(entry.category.id, openCategories)}
          onclick={() => toggleCategory(entry.category.id)}
        >
          <ChevronDown class={`size-4 shrink-0 transition-transform ${isOpen(entry.category.id, openCategories) ? "" : "-rotate-90"}`} aria-hidden="true" />
          <PluginIcon name={entry.category.icon} className="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{translate(entry.category.label, entry.category.label)}</span>
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{categoryEnabled}/{entry.items.length}</span>
        </button>
        <span class="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="sm" class="h-7 gap-1 px-1.5 text-xs text-muted-foreground" aria-label={translate("settings.enableGroup", "Enable group")} title={translate("settings.enableGroup", "Enable group")} onclick={() => setCategory(entry.items, true)}>
            <CheckCheck class="size-3.5" aria-hidden="true" />
            <span class="max-[520px]:sr-only">{translate("settings.enableGroup", "Enable group")}</span>
          </Button>
          <Button variant="ghost" size="sm" class="h-7 gap-1 px-1.5 text-xs text-muted-foreground" aria-label={translate("settings.disableGroup", "Disable group")} title={translate("settings.disableGroup", "Disable group")} onclick={() => setCategory(entry.items, false)}>
            <X class="size-3.5" aria-hidden="true" />
            <span class="max-[520px]:sr-only">{translate("settings.disableGroup", "Disable group")}</span>
          </Button>
        </span>
      </header>
      {#if isOpen(entry.category.id, openCategories)}
        <div class="divide-y divide-border border-t border-border/60">
          {#each entry.items as item (item.key)}
            <div class="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2.5 py-1.5">
              <div class="flex min-w-0 items-center gap-2.5">
                {#if item.icon}<PluginIcon name={item.icon} className="size-4 shrink-0 text-muted-foreground" />{/if}
                <div class="min-w-0">
                  <div class="text-sm font-medium leading-5">{translate(item.title, item.title)}</div>
                  {#if item.description}<div class="text-xs leading-4 text-muted-foreground">{translate(item.description, item.description)}</div>{/if}
                </div>
              </div>
              <Switch checked={Boolean(item.value)} aria-label={translate(item.title, item.title)} onCheckedChange={(value) => dispatch("changed", { key: item.key, value })} />
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/each}
</section>
