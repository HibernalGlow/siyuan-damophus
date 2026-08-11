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
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import { ChevronRight, GripVertical } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Separator } from "@/components/ui/separator";
  import { Switch } from "@/components/ui/switch";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import "@/styles/lucide-outline.css";

  export let categories: OverviewCategory[] = [];
  export let reorderHint = "Drag the grip to reorder";
  export let enabledLabel = "Enable module";

  const dispatch = createEventDispatcher<{
    select: string;
    toggle: { id: string; enabled: boolean };
    reorder: { categoryOrder?: string[]; moduleOrder?: { categoryId: string; order: string[] } };
  }>();

  const flipDurationMs = 160;
  let renderedCategories = categories;
  let sourceCategories = categories;

  $: if (categories !== sourceCategories) {
    sourceCategories = categories;
    renderedCategories = categories;
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

<div
  class="grid grid-cols-1 items-start gap-3 min-[680px]:grid-cols-2 min-[1160px]:grid-cols-3"
  data-testid="setting-overview"
  aria-label="Settings categories"
  use:dragHandleZone={{
    items: renderedCategories,
    type: "damophus-settings-categories",
    flipDurationMs,
    dropTargetClasses: ["damophus-settings-dropzone-active"],
    delayTouchStart: true,
  }}
  onconsider={considerCategories}
  onfinalize={finalizeCategories}
>
  {#each renderedCategories as category (category.id)}
    <section
      role="group"
      aria-label={category.label}
      class="min-w-0 overflow-hidden rounded-lg border border-border bg-card/70 shadow-sm transition-[border-color,box-shadow]"
      data-testid={`overview-category-${category.id}`}
      animate:flip={{ duration: flipDurationMs }}
    >
      <div
        class="!grid min-h-12 grid-cols-[1.75rem_1.75rem_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2"
        data-testid="overview-category-header"
      >
        <span
          use:dragHandle
          class="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/50 transition-colors hover:bg-accent hover:text-muted-foreground active:cursor-grabbing"
          title={reorderHint}
          aria-label={`${reorderHint}: ${category.label}`}
        >
          <GripVertical class="size-4" aria-hidden="true" />
        </span>
        <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <PluginIcon name={category.icon} className="size-4" />
        </span>
        <div class="min-w-0 flex-1" data-testid="overview-category-copy">
          <div class="truncate text-sm font-semibold" role="heading" aria-level="3">{category.label}</div>
          {#if category.description}<div class="mt-0.5 truncate text-xs text-muted-foreground">{category.description}</div>{/if}
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
          items: category.modules,
          type: `damophus-settings-modules-${category.id}`,
          flipDurationMs,
          dropTargetClasses: ["damophus-settings-module-dropzone-active"],
          delayTouchStart: true,
        }}
        onconsider={(event) => considerModules(category.id, event)}
        onfinalize={(event) => finalizeModules(category.id, event)}
      >
        {#each category.modules as module (module.id)}
          <li aria-label={module.label} animate:flip={{ duration: flipDurationMs }}>
            <div
              role="listitem"
              class="group flex min-w-0 items-center gap-0.5 rounded-md transition-[background-color,box-shadow]"
            >
              <span
                use:dragHandle
                class="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground/35 opacity-60 transition-[color,background-color,opacity] hover:bg-accent hover:text-muted-foreground group-hover:opacity-100 active:cursor-grabbing"
                title={reorderHint}
                aria-label={`${reorderHint}: ${module.label}`}
              >
                <GripVertical class="size-3.5" aria-hidden="true" />
              </span>
              <Button
                variant="ghost"
                class="h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-foreground"
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
