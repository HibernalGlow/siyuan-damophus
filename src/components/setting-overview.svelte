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
  import { createEventDispatcher, tick } from "svelte";
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

  const prefersReducedMotion = typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const moduleFlipDurationMs = prefersReducedMotion ? 0 : 160;
  const cardLayoutDurationMs = prefersReducedMotion ? 0 : 280;
  let renderedCategories = categories;
  let sourceCategories = categories;
  let overviewRoot: HTMLDivElement;

  $: if (categories !== sourceCategories) {
    sourceCategories = categories;
    renderedCategories = categories;
  }
  $: visibleCategories = mode === "navigation" && compact ? [] : renderedCategories;
  function visibleModules(category: OverviewCategory) {
    return category.modules;
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

  function categoryRects(): Map<string, DOMRect> {
    if (!overviewRoot) return new Map();
    return new Map([...overviewRoot.querySelectorAll<HTMLElement>("[data-dnd-category]")]
      .map((element) => [element.dataset.dndCategory ?? "", element.getBoundingClientRect()]));
  }

  async function animateCategoryLayout(before: Map<string, DOMRect>): Promise<void> {
    await tick();
    if (compact || prefersReducedMotion || !overviewRoot) return;
    const animations = [...overviewRoot.querySelectorAll<HTMLElement>("[data-dnd-category]")]
      .map((element) => {
        const previous = before.get(element.dataset.dndCategory ?? "");
        const next = element.getBoundingClientRect();
        if (!previous || !next.width || !next.height) return undefined;
        const deltaX = previous.left - next.left;
        const deltaY = previous.top - next.top;
        const scaleX = previous.width / next.width;
        const scaleY = previous.height / next.height;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5
          && Math.abs(scaleX - 1) < 0.005 && Math.abs(scaleY - 1) < 0.005) return undefined;
        return element.animate([
          { transformOrigin: "top left", transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})` },
          { transformOrigin: "top left", transform: "none" },
        ], {
          duration: cardLayoutDurationMs,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
      })
      .filter((animation): animation is Animation => animation !== undefined);
    await Promise.allSettled(animations.map((animation) => animation.finished));
  }

  function selectModule(selectId: string) {
    if (compact) {
      dispatch("select", selectId);
      return;
    }
    const before = categoryRects();
    dispatch("select", selectId);
    void animateCategoryLayout(before).then(() => {
      const active = renderedCategories.some((category) =>
        category.modules.some((module) => module.selectId === activeSelectId));
      revealActiveItem(active);
    });
  }

  function returnToOverview() {
    const before = categoryRects();
    dispatch("overview");
    void animateCategoryLayout(before);
  }

  function revealActiveItem(categoryIsActive: boolean) {
    if (mode !== "navigation" || compact || !categoryIsActive) return;
    overviewRoot.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({
      block: "nearest",
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }
</script>

<div class={mode === "navigation" ? "min-w-0" : "contents"} data-testid="setting-overview-shell" data-mode={mode}>
  {#if mode === "navigation" && !compact}
    <div in:fade={{ duration: 140 }}>
      <Button
        variant="ghost"
        size="sm"
        class="mb-2 w-full justify-start gap-2 px-2 text-muted-foreground"
        onclick={returnToOverview}
      >
        <ArrowLeft class="size-4" aria-hidden="true" />
        <span class="truncate">{overviewLabel}</span>
      </Button>
    </div>
  {/if}
  <div
    bind:this={overviewRoot}
    class={mode === "navigation"
      ? "flex min-w-0 flex-col gap-2"
      : "grid grid-cols-1 items-start gap-3 min-[680px]:grid-cols-2 min-[1160px]:grid-cols-3"}
    data-testid="setting-overview"
    aria-label="Settings categories"
    use:dragHandleZone={{
      items: visibleCategories,
      type: "damophus-settings-categories",
      flipDurationMs: 0,
      dragDisabled: mode === "navigation",
      dropTargetClasses: ["damophus-settings-dropzone-active"],
      delayTouchStart: true,
    }}
    onconsider={considerCategories}
    onfinalize={finalizeCategories}
  >
  {#each visibleCategories as category (category.id)}
    {@const categoryModules = visibleModules(category)}
    {@const categoryIsActive = category.modules.some((module) => module.selectId === activeSelectId)}
    <div class="min-w-0" data-dnd-category={category.id} in:fade={{ duration: 160 }}>
    <section
      role="group"
      aria-label={category.label}
      class={mode === "navigation" && categoryIsActive
        ? "min-w-0 overflow-hidden rounded-lg border border-primary/30 bg-card shadow-sm transition-[border-color,box-shadow]"
        : "min-w-0 overflow-hidden rounded-lg border border-border bg-card/70 shadow-sm transition-[border-color,box-shadow]"}
      data-testid={`overview-category-${category.id}`}
    >
      <div
        class={mode === "navigation"
          ? "!grid min-h-11 grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2"
          : "!grid min-h-12 grid-cols-[0.5rem_1.75rem_minmax(0,1fr)_auto] items-center gap-1.5 px-2.5 py-2"}
        data-testid="overview-category-header"
      >
        {#if mode === "overview"}
          <span
            use:dragHandle
            class="relative flex h-7 w-2 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/50 transition-colors before:absolute before:-inset-x-1.5 before:inset-y-0 hover:text-muted-foreground active:cursor-grabbing"
            title={reorderHint}
            aria-label={`${reorderHint}: ${category.label}`}
          >
            <GripVertical class="h-3.5 w-2" aria-hidden="true" />
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
          flipDurationMs: moduleFlipDurationMs,
          dragDisabled: mode === "navigation",
          dropTargetClasses: ["damophus-settings-module-dropzone-active"],
          delayTouchStart: true,
        }}
        onconsider={(event) => considerModules(category.id, event)}
        onfinalize={(event) => finalizeModules(category.id, event)}
      >
        {#each categoryModules as module (module.id)}
          <li aria-label={module.label} animate:flip={{ duration: moduleFlipDurationMs }}>
            <div
              role="listitem"
              class="group flex min-w-0 items-center gap-0.5 rounded-md transition-[background-color,box-shadow]"
            >
              {#if mode === "overview"}
                <span
                  use:dragHandle
                  class="relative flex h-8 w-2 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/35 opacity-60 transition-[color,opacity] before:absolute before:-inset-x-1.5 before:inset-y-0 hover:text-muted-foreground group-hover:opacity-100 active:cursor-grabbing"
                  title={reorderHint}
                  aria-label={`${reorderHint}: ${module.label}`}
                >
                  <GripVertical class="h-3.5 w-2" aria-hidden="true" />
                </span>
              {/if}
              <Button
                variant={mode === "navigation" && module.selectId === activeSelectId ? "secondary" : "ghost"}
                class={mode === "navigation" && module.selectId === activeSelectId
                  ? "h-8 min-w-0 flex-1 justify-start gap-2 rounded-md border-l-2 border-primary px-2 text-foreground"
                  : "h-8 min-w-0 flex-1 justify-start gap-2 rounded-md px-2 text-foreground"}
                aria-current={mode === "navigation" && module.selectId === activeSelectId ? "page" : undefined}
                onclick={() => selectModule(module.selectId)}
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
    </div>
  {/each}
  </div>
</div>

<style>
  :global(.damophus-settings-dropzone-active > [data-dnd-category]) {
    transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  }

  :global(.damophus-settings-dropzone-active > [data-dnd-category]:focus-within) {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
  }

  :global(.damophus-settings-module-dropzone-active) {
    background: color-mix(in srgb, var(--accent) 45%, transparent);
  }
</style>
