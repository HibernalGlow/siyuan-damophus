<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { PluginIconName } from "@/libs/plugin-icons";
  import { skillManagerAppearance } from "@/lets-skill-manager/plugin";
  import {
    ArrowLeft,
    BookOpenCheck,
    Bot,
    Brain,
    ChevronRight,
    FileOutput,
    Film,
    GlassWater,
    ImagePlay,
    ListTree,
    Network,
    PanelRight,
    Power,
    Settings2,
    Smartphone,
    Tags,
  } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import "@/styles/lucide-outline.css";

  export let groups: string[] = [];
  export let focusGroup = "";
  export let getGroupLabel: (group: string) => string = (group) => group;
  export let categoryLabel = "Setting categories";
  export let categoryDescription = "Choose which settings to display.";
  export let preferencesLabel = "Preferences";
  export let mobile = false;
  export let showCategories = false;
  export let backLabel = "Back";
  const PLUGIN_ICONS = {
    brain: Brain,
  } satisfies Record<PluginIconName, typeof Brain>;

  const PLUGIN_GROUP_ICONS: Partial<Record<string, PluginIconName>> = {
    [skillManagerAppearance.displayName]: skillManagerAppearance.icon,
  };

  const GROUP_ICONS = {
    "lets-animated-image-replay.displayName": ImagePlay,
    "lets-block-attr.displayName": Tags,
    "lets-kramdown-export.displayName": FileOutput,
    "lets-layout-actions.displayName": PanelRight,
    "lets-list-merge.displayName": ListTree,
    "lets-mobile-breadcrumb.displayName": Smartphone,
    "lets-mobile-liquid-glass.displayName": GlassWater,
    "lets-question-bank.displayName": BookOpenCheck,
    "lets-topic-relations.displayName": Network,
    "lets-agent-bridge.displayName": Bot,
  };

  const dispatch = createEventDispatcher<{ select: string; back: void }>();

  $: focusIcon = groupIcon(focusGroup, Math.max(0, groups.indexOf(focusGroup)));

  function selectGroup(group: string) {
    dispatch("select", group);
  }

  function groupIcon(group: string, index: number) {
    if (index === 0) return Power;
    if (index === 1) return Settings2;
    const pluginIcon = PLUGIN_GROUP_ICONS[group];
    const registeredIcon = (pluginIcon ? PLUGIN_ICONS[pluginIcon] : undefined)
      ?? GROUP_ICONS[group as keyof typeof GROUP_ICONS];
    if (registeredIcon) return registeredIcon;
    const label = getGroupLabel(group).toLowerCase();
    if (label.includes("题库") || label.includes("question")) return BookOpenCheck;
    return Film;
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
      <nav class="mt-3 flex flex-col gap-1" aria-label={categoryLabel}>
        {#each groups as group, index}
          {@const Icon = groupIcon(group, index)}
          <Button
            variant={group === focusGroup ? "secondary" : "ghost"}
            class={group === focusGroup
              ? "min-h-12 w-full touch-manipulation justify-between rounded-lg border-l-2 border-primary px-3 text-left text-foreground"
              : "min-h-12 w-full touch-manipulation justify-between rounded-lg px-3 text-left text-muted-foreground"}
            aria-current={group === focusGroup ? "page" : undefined}
            onclick={() => selectGroup(group)}
          >
            <span class="flex min-w-0 items-center gap-3">
              <svelte:component this={Icon} class="size-5 shrink-0" aria-hidden="true" />
              <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
            </span>
            <ChevronRight class="size-4 shrink-0" aria-hidden="true" />
          </Button>
        {/each}
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
        <svelte:component this={focusIcon} class="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span class="min-w-0 truncate">{getGroupLabel(focusGroup)}</span>
      </Button>
    </header>
  {/if}
{:else}
  <nav
    class="w-48 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3"
    aria-label={categoryLabel}
    data-testid="setting-desktop-navigation"
  >
    <div class="mb-3 border-b border-border px-2 pb-3">
      <strong class="block text-sm font-semibold">Damophus</strong>
      <span class="text-xs text-muted-foreground">{preferencesLabel}</span>
    </div>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      {#each groups as group, index}
        {@const Icon = groupIcon(group, index)}
        <li>
          <Button
            variant={group === focusGroup ? "secondary" : "ghost"}
            class={group === focusGroup
              ? "h-9 w-full touch-manipulation justify-start rounded-md border-l-2 border-primary px-3 text-foreground"
              : "h-9 w-full touch-manipulation justify-start rounded-md px-3 text-muted-foreground"}
            aria-current={group === focusGroup ? "page" : undefined}
            onclick={() => selectGroup(group)}
          >
            <svelte:component this={Icon} class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
          </Button>
        </li>
      {/each}
    </ul>
  </nav>
{/if}
