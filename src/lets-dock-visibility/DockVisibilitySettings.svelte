<script lang="ts" module>
  export interface DockVisibilityLabels {
    settingsTitle: string;
    showOn: string;
    platformDesktop: string;
    platformMobile: string;
    platformBoth: string;
    positionLeft: string;
    positionRight: string;
    positionBottom: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Eye, Monitor, Smartphone } from "lucide-svelte";
  import { Menu } from "siyuan";
  import { Button } from "@/components/ui/button";
  import { dockPlatformOf, type DockItemInfo, type DockPosition } from "./dock-items";
  import { DOCK_PLATFORMS, type DockPlatform } from "./visibility";

  export let group: string;
  export let title: string;
  export let items: DockItemInfo[] = [];
  export let platforms: Record<string, DockPlatform> = {};
  export let labels: DockVisibilityLabels;

  const dispatch = createEventDispatcher<{
    changed: { group: string; key: string; value: Record<string, DockPlatform> };
  }>();

  const POSITION_LABEL_KEYS: Record<DockPosition, keyof DockVisibilityLabels> = {
    Left: "positionLeft",
    Right: "positionRight",
    Bottom: "positionBottom",
  };
  const PLATFORM_ICONS: Record<DockPlatform, typeof Eye> = {
    both: Eye,
    desktop: Monitor,
    mobile: Smartphone,
  };

  $: positions = (["Left", "Right", "Bottom"] as DockPosition[])
    .map((position) => ({ position, entries: items.filter((item) => item.position === position) }))
    .filter((entry) => entry.entries.length > 0);

  function platformLabel(platform: DockPlatform): string {
    return {
      desktop: labels.platformDesktop,
      mobile: labels.platformMobile,
      both: labels.platformBoth,
    }[platform];
  }

  function choose(event: MouseEvent, item: DockItemInfo): void {
    const menu = new Menu("damophus-dock-visibility");
    const current = dockPlatformOf(platforms, item.type);
    for (const platform of DOCK_PLATFORMS) {
      menu.addItem({
        label: platformLabel(platform),
        current: platform === current,
        click: () => {
          dispatch("changed", {
            group,
            key: "dockPlatforms",
            value: { ...platforms, [item.type]: platform },
          });
        },
      });
    }
    menu.open({ x: event.clientX, y: event.clientY });
  }
</script>

<section class="space-y-5" aria-label={labels.settingsTitle}>
  <header class="border-b border-border pb-4">
    <div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div>
  </header>

  {#each positions as entry (entry.position)}
    <section class="space-y-2">
      <h3 class="text-sm font-semibold text-muted-foreground">{labels[POSITION_LABEL_KEYS[entry.position]]}</h3>
      <div class="overflow-hidden rounded-md border border-border">
        {#each entry.entries as item (item.type)}
          <div class="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
            <Button
              variant="ghost"
              size="icon-sm"
              title={`${labels.showOn}: ${platformLabel(dockPlatformOf(platforms, item.type))}`}
              aria-label={`${labels.showOn}: ${item.label}`}
              onclick={(event) => choose(event, item)}
            >
              <svelte:component this={PLATFORM_ICONS[dockPlatformOf(platforms, item.type)]} />
            </Button>
            <span class="min-w-0 flex-1 truncate text-sm">{item.label}</span>
            <span class="min-w-0 truncate font-mono text-xs text-muted-foreground">{item.type}</span>
          </div>
        {/each}
      </div>
    </section>
  {/each}
</section>
