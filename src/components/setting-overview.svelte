<script lang="ts" module>
  import type { PluginIconName } from "@/libs/plugin-icons";

  export interface OverviewModule {
    /** Stable id used for ordering. */
    id: string;
    /** Group name dispatched on select. */
    selectId: string;
    label: string;
    icon: PluginIconName;
    enabled?: boolean;
  }

  export interface OverviewCategory {
    id: string;
    label: string;
    description?: string;
    icon: PluginIconName;
    enabled?: number;
    total?: number;
    modules: OverviewModule[];
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import { ArrowLeft, ChevronRight, GripVertical } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Separator } from "@/components/ui/separator";
  import { Switch } from "@/components/ui/switch";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import "@/styles/lucide-outline.css";

  export let categories: OverviewCategory[] = [];
  export let mode: "overview" | "navigation" = "overview";
  export let activeSelectId = "";
  export let compact = false;
  export let reorderHint = "Drag the grip to reorder";
  export let enabledLabel = "Enable module";
  export let overviewLabel = "Back to overview";

  const dispatch = createEventDispatcher<{
    select: string;
    toggle: { id: string; enabled: boolean };
    overview: void;
    reorder: { categoryOrder?: string[]; moduleOrder?: { categoryId: string; order: string[] } };
  }>();

  const flipDurationMs = 160;
  let renderedCategories = categories;
  let sourceCategories = categories;

  $: if (categories !== sourceCategories) {
    sourceCategories = categories;
    renderedCategories = categories;
  }
  $: activeCategory = renderedCategories.find((category) =>
    category.modules.some((module) => module.selectId === activeSelectId),
  ) ?? renderedCategories[0];
  $: visibleCategories = mode === "navigation"
    ? activeCategory ? [activeCategory] : []
    : renderedCategories;

  function visibleModules(category: OverviewCategory) {
    if (mode !== "navigation" || !compact) return category.modules;
    return category.modules.filter((module) => module.selectId === activeSelectId);
  }

  function considerCategories(event: CustomEvent<DndEvent<OverviewCategory>>) {
    renderedCategories = event.detail.items;
  }

  function finalizeCategories(event: CustomEvent<DndEvent<OverviewCategory>>) {
    renderedCategories = event.detail.items;
    dispatch("reorder", { categoryOrder: renderedCategories.map((category) => category.id) });
  }

  function updateModules(categoryId: string, modules: OverviewModule[]) {
    renderedCategories = renderedCategories.map((category) =>
      category.id === categoryId ? { ...category, modules } : category,
    );
  }

  function considerModules(categoryId: string, event: CustomEvent<DndEvent<OverviewModule>>) {
    updateModules(categoryId, event.detail.items);
  }

  function finalizeModules(categoryId: string, event: CustomEvent<DndEvent<OverviewModule>>) {
    updateModules(categoryId, event.detail.items);
    dispatch("reorder", {
      moduleOrder: { categoryId, order: event.detail.items.map((module) => module.id) },
    });
  }
</script>

<div class={mode === "navigation" ? "min-w-0" : "contents"} data-testid="setting-overview-shell" data-mode={mode}>
  {#if mode === "navigation"}
    <div transition:fade={{ duration: 160 }}>
      <Button
        variant="ghost"
        size="sm"
        class="mb-2 w-full justify-start gap-2 px-2 text-muted-foreground"
        onclick={() => dispatch("overview")}
      >
        <ArrowLeft class="size-4" aria-hidden="true" />
        <span class="truncate">{overviewLabel}</span>
      </Button>
    </div>
  {/if}
  <div
    class={mode === "navigation"
      ? "flex min-w-0 flex-col gap-2"
      : "grid grid-cols-1 items-start gap-3 min-[680px]:grid-cols-2 min-[1160px]:grid-cols-3"}
    data-testid="setting-overview"
    aria-label="Settings categories"
    use:dragHandleZone={{
      items: visibleCategories,
      type: "damophus-settings-categories",
      flipDurationMs,
      dragDisabled: mode === "navigation",
      dropTargetClasses: ["damophus-settings-dropzone-active"],
      delayTouchStart: true,
    }}
    onconsider={considerCategories}
    onfinalize={finalizeCategories}
  >
  {#each visibleCategories as category (category.id)}
    {@const categoryModules = visibleModules(category)}
    <section
      role="group"
      aria-label={category.label}
      class={mode === "navigation"
        ? "min-w-0 overflow-hidden rounded-lg border border-primary/30 bg-card shadow-sm transition-[border-color,box-shadow]"
        : "min-w-0 overflow-hidden rounded-lg border border-border bg-card/70 shadow-sm transition-[border-color,box-shadow]"}
      data-testid={`overview-category-${category.id}`}
      animate:flip={{ duration: flipDurationMs }}
      transition:fade={{ duration: 160 }}
    >
      <div
        class={mode === "navigation"
          ? "!grid min-h-11 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2"
          : "!grid min-h-12 grid-cols-[1rem_1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2"}
        data-testid="overview-category-header"
      >
        {#if mode === "overview"}
          <span
            use:dragHandle
            class="relative flex h-7 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/50 transition-colors before:absolute before:-inset-x-1 before:inset-y-0 hover:bg-accent hover:text-muted-foreground active:cursor-grabbing"
            title={reorderHint}
            aria-label={`${reorderHint}: ${category.label}`}
          >
            <GripVertical class="size-4" aria-hidden="true" />
          </span>
        {/if}
        <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <PluginIcon name={category.icon} className="size-4" />
        </span>
        <div class="min-w-0 flex-1" data-testid="overview-category-copy">
          <div class="truncate text-sm font-semibold" role="heading" aria-level="3">{category.label}</div>
          {#if mode === "overview" && category.description}<div class="mt-0.5 truncate text-xs text-muted-foreground">{category.description}</div>{/if}
        </div>
        {#if category.total !== undefined}
          <span class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{category.enabled ?? 0}/{category.total}</span>
        {/if}
      </div>
      <Separator />
      <ul
        class="m-0 flex list-none flex-col gap-0.5 p-1.5"
        data-testid={`overview-module-zone-${category.id}`}
        aria-label={`${category.label} modules`}
        use:dragHandleZone={{
          items: categoryModules,
          type: `damophus-settings-modules-${category.id}`,
          flipDurationMs,
          dragDisabled: mode === "navigation",
          dropTargetClasses: ["damophus-settings-module-dropzone-active"],
          delayTouchStart: true,
        }}
        onconsider={(event) => considerModules(category.id, event)}
        onfinalize={(event) => finalizeModules(category.id, event)}
      >
        {#each categoryModules as module (module.id)}
          <li aria-label={module.label} animate:flip={{ duration: flipDurationMs }}>
            <div
              role="listitem"
              class="group flex min-w-0 items-center gap-0.5 rounded-md transition-[background-color,box-shadow]"
            >
              {#if mode === "overview"}
                <span
                  use:dragHandle
                  class="relative flex h-8 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/35 opacity-60 transition-[color,background-color,opacity] before:absolute before:-inset-x-1 before:inset-y-0 hover:bg-accent hover:text-muted-foreground group-hover:opacity-100 active:cursor-grabbing"
                  title={reorderHint}
                  aria-label={`${reorderHint}: ${module.label}`}
                >
                  <GripVertical class="size-3.5" aria-hidden="true" />
                </span>
              {/if}
              <Button
                variant={mode === "navigation" && module.selectId === activeSelectId ? "secondary" : "ghost"}
                class={mode === "navigation" && module.selectId === activeSelectId
                  ? "h-8 min-w-0 flex-1 justify-start gap-2 rounded-md border-l-2 border-primary px-2 text-foreground"
                  : "h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-foreground"}
                aria-current={mode === "navigation" && module.selectId === activeSelectId ? "page" : undefined}
                onclick={() => dispatch("select", module.selectId)}
              >
                <PluginIcon name={module.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate text-left text-[13px]">{module.label}</span>
                <ChevronRight class="shrink-0 text-muted-foreground/50" aria-hidden="true" />
              </Button>
              {#if module.enabled !== undefined}
                <Switch
                  size="sm"
                  class="mr-2"
                  checked={module.enabled}
                  aria-label={`${enabledLabel}: ${module.label}`}
                  onCheckedChange={(enabled) => dispatch("toggle", { id: module.id, enabled })}
                />
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
  </div>
</div>

<style>
  :global(.damophus-settings-dropzone-active > [data-testid^="overview-category-"]) {
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }

  :global(.damophus-settings-dropzone-active > [data-testid^="overview-category-"]:focus-within) {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
  }

  :global(.damophus-settings-module-dropzone-active) {
    background: color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
