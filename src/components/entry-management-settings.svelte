<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { Menu, MousePointerClick, PanelRight, PanelsTopLeft, Smartphone, SquareTerminal } from "lucide-svelte";
  import { Switch } from "@/components/ui/switch";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import type { ConfigurableEntrySurface } from "@/libs/plugin-entry-settings";
  import type { ManagedEntryModule } from "@/libs/module-settings";

  interface EntryManagementLabels {
    desktopDock: string;
    mobileDock: string;
    menu: string;
    contextMenu: string;
    command: string;
    tab: string;
    disabled: string;
    unavailable: string;
  }

  export let modules: ManagedEntryModule[] = [];
  export let labels: EntryManagementLabels;
  export let mobile = false;
  export let translate: (key: string) => string = (key) => key;

  const dispatch = createEventDispatcher();
  let root: HTMLElement;
  let compact = mobile;
  const surfaces: Array<{
    key: ConfigurableEntrySurface;
    icon: typeof PanelRight;
  }> = [
    { key: "desktopDock", icon: PanelRight },
    { key: "mobileDock", icon: Smartphone },
    { key: "menu", icon: Menu },
    { key: "contextMenu", icon: MousePointerClick },
    { key: "command", icon: SquareTerminal },
    { key: "tab", icon: PanelsTopLeft },
  ];

  function change(module: ManagedEntryModule, key: ConfigurableEntrySurface, value: boolean) {
    const setting = module.surfaces[key];
    if (!setting) return;
    dispatch("changed", { group: module.group, key: setting.key, value });
  }

  onMount(() => {
    const updateLayout = () => compact = mobile || root.clientWidth < 720;
    const observer = new ResizeObserver(updateLayout);
    updateLayout();
    observer.observe(root);
    return () => observer.disconnect();
  });

  $: if (root) compact = mobile || root.clientWidth < 720;
</script>

<section bind:this={root} class="border-y border-border" data-testid="entry-management-settings">
  {#if compact}
    {#each modules as module (module.pluginName)}
      <div class="border-b border-border px-3 py-4 last:border-b-0">
        <div class="mb-3 flex min-w-0 items-start gap-3">
          <PluginIcon name={module.icon} className="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="min-w-0">
            <div class="text-sm font-medium">{translate(module.title)}</div>
            {#if !module.enabled}<div class="mt-0.5 text-xs text-muted-foreground">{labels.disabled}</div>{/if}
          </div>
        </div>
        <div class="divide-y divide-border border-t border-border">
          {#each surfaces as surface (surface.key)}
            {@const setting = module.surfaces[surface.key]}
            {@const SurfaceIcon = surface.icon}
            <div class="flex min-h-11 items-center justify-between gap-3 py-2">
              <span class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <SurfaceIcon class="size-4 shrink-0" aria-hidden="true" />
                <span>{labels[surface.key]}</span>
              </span>
              {#if setting}
                <Switch
                  class="damophus-entry-switch"
                  checked={Boolean(setting.value)}
                  aria-label={`${translate(module.title)}: ${labels[surface.key]}`}
                  onCheckedChange={(checked) => change(module, surface.key, checked)}
                />
              {:else}
                <span class="px-2 text-sm text-muted-foreground" aria-label={labels.unavailable}>-</span>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  {:else}
    <div
      class="grid min-h-11 items-center gap-3 border-b border-border bg-muted/30 px-3 text-xs font-medium text-muted-foreground"
      style="grid-template-columns: minmax(170px, 1.25fr) repeat(6, minmax(64px, 0.55fr));"
    >
      <span class="sr-only">Module</span>
      {#each surfaces as surface (surface.key)}
        {@const SurfaceIcon = surface.icon}
        <span class="flex items-center justify-center gap-1.5 text-center">
          <SurfaceIcon class="size-4 shrink-0" aria-hidden="true" />
          <span>{labels[surface.key]}</span>
        </span>
      {/each}
    </div>
    {#each modules as module (module.pluginName)}
      <div
        class="grid min-h-16 items-center gap-3 border-b border-border px-3 py-3 last:border-b-0"
        style="grid-template-columns: minmax(170px, 1.25fr) repeat(6, minmax(64px, 0.55fr));"
      >
        <div class="flex min-w-0 items-start gap-3">
          <PluginIcon name={module.icon} className="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{translate(module.title)}</div>
            {#if !module.enabled}<div class="mt-0.5 text-xs text-muted-foreground">{labels.disabled}</div>{/if}
          </div>
        </div>
        {#each surfaces as surface (surface.key)}
          {@const setting = module.surfaces[surface.key]}
          <div class="flex h-9 items-center justify-center">
            {#if setting}
              <Switch
                class="damophus-entry-switch"
                checked={Boolean(setting.value)}
                aria-label={`${translate(module.title)}: ${labels[surface.key]}`}
                onCheckedChange={(checked) => change(module, surface.key, checked)}
              />
            {:else}
              <span class="text-sm text-muted-foreground" aria-label={labels.unavailable}>-</span>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</section>

<style>
  :global(.damophus-entry-switch[data-state="unchecked"]) {
    background: var(--input);
    border-color: var(--border);
  }

  :global(.damophus-entry-switch[data-state="checked"]) {
    background: var(--primary);
    border-color: color-mix(in oklab, var(--primary) 82%, var(--foreground));
  }

  :global(.damophus-entry-switch [data-slot="switch-thumb"]) {
    background: var(--background);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--foreground) 14%, transparent);
  }
</style>
