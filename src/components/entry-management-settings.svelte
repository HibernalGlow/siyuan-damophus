<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { ArrowDown, ArrowUp, Menu, MousePointerClick, PanelRight, PanelsTopLeft, SlidersHorizontal, Smartphone, SquareTerminal } from "lucide-svelte";
  import { Switch } from "@/components/ui/switch";
  import PluginIcon from "@/components/plugin-icon.svelte";
  import type { ConfigurableEntrySurface } from "@/libs/plugin-entry-settings";
  import type { ManagedEntryModule } from "@/libs/module-settings";
  import { moveMenuEntry, orderPluginNames } from "@/libs/menu-order";

  interface EntryManagementLabels {
    desktopDock: string;
    mobileDock: string;
    menu: string;
    contextMenu: string;
    command: string;
    tab: string;
    quickSwitches: string;
    showModuleDetailSwitches: string;
    disabled: string;
    unavailable: string;
    moveUp?: string;
    moveDown?: string;
    menuOrder?: string;
  }

  export let modules: ManagedEntryModule[] = [];
  export let labels: EntryManagementLabels;
  export let mobile = false;
  export let showModuleDetailSwitches = true;
  export let menuOrder: string[] | undefined = undefined;
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

  function changeLeaf(module: ManagedEntryModule, key: string, value: boolean) {
    dispatch("changed", { group: module.group, key, value });
  }

  onMount(() => {
    const updateLayout = () => compact = mobile || root.clientWidth < 720;
    const observer = new ResizeObserver(updateLayout);
    updateLayout();
    observer.observe(root);
    return () => observer.disconnect();
  });

  $: if (root) compact = mobile || root.clientWidth < 720;
  $: orderedModules = orderPluginNames(modules.map((module) => module.pluginName), menuOrder)
    .map((name) => modules.find((module) => module.pluginName === name))
    .filter((module): module is ManagedEntryModule => Boolean(module));

  function moveModule(module: ManagedEntryModule, direction: "up" | "down") {
    if (!module.surfaces.menu) return;
    const menuModules = orderedModules.filter((candidate) => candidate.surfaces.menu).map((candidate) => candidate.pluginName);
    const next = moveMenuEntry(menuModules, module.pluginName, direction);
    dispatch("menuOrderChanged", next);
  }
</script>

<section bind:this={root} class="entry-management" class:compact data-testid="entry-management-settings">
  <div class="entry-management__toolbar">
    <label class="entry-management__visibility">
      <span>{labels.showModuleDetailSwitches}</span>
      <Switch
        size="sm"
        checked={showModuleDetailSwitches}
        aria-label={labels.showModuleDetailSwitches}
        onCheckedChange={(checked) => dispatch("moduleDetailSwitchesChanged", checked)}
      />
    </label>
  </div>
  {#each orderedModules as module (module.pluginName)}
    <article class="entry-module" data-entry-module={module.pluginName}>
      <header class="entry-module__header">
        <PluginIcon name={module.icon} className="size-5 shrink-0 text-primary" />
        <div class="min-w-0">
          <div class="truncate text-sm font-medium">{translate(module.title)}</div>
          {#if !module.enabled}<div class="text-xs text-muted-foreground">{labels.disabled}</div>{/if}
        </div>
        {#if module.surfaces.menu}
          {@const menuIndex = orderedModules.filter((candidate) => candidate.surfaces.menu).findIndex((candidate) => candidate.pluginName === module.pluginName)}
          {@const menuCount = orderedModules.filter((candidate) => candidate.surfaces.menu).length}
          <div class="entry-module__order" aria-label={labels.menuOrder ?? "Menu order"}>
            <button type="button" class="entry-order-button" title={labels.moveUp ?? "Move up"} aria-label={`${labels.moveUp ?? "Move up"}: ${translate(module.title)}`} disabled={menuIndex === 0} onclick={() => moveModule(module, "up")}>
              <ArrowUp class="size-3.5" aria-hidden="true" />
            </button>
            <button type="button" class="entry-order-button" title={labels.moveDown ?? "Move down"} aria-label={`${labels.moveDown ?? "Move down"}: ${translate(module.title)}`} disabled={menuIndex === menuCount - 1} onclick={() => moveModule(module, "down")}>
              <ArrowDown class="size-3.5" aria-hidden="true" />
            </button>
          </div>
        {/if}
      </header>

      <div class="entry-module__body">
        <div class="entry-surface-grid" aria-label={translate(module.title)}>
          {#each surfaces as surface (surface.key)}
            {@const setting = module.surfaces[surface.key]}
            {@const SurfaceIcon = surface.icon}
            {#if setting}
              <div class="entry-control">
                <span class="entry-control__label">
                  <SurfaceIcon class="size-4 shrink-0" aria-hidden="true" />
                  <span>{labels[surface.key]}</span>
                </span>
                <Switch
                  size="sm"
                  class="damophus-entry-switch"
                  checked={Boolean(setting.value)}
                  aria-label={`${translate(module.title)}: ${labels[surface.key]}`}
                  onCheckedChange={(checked) => change(module, surface.key, checked)}
                />
              </div>
            {/if}
          {/each}
        </div>

        {#if module.leafSwitches.length > 0}
          <div class="entry-leaves" data-entry-leaves={module.pluginName}>
            <div class="entry-leaves__label">
              <SlidersHorizontal class="size-3.5" aria-hidden="true" />
              <span>{labels.quickSwitches}</span>
            </div>
            <div class="entry-leaves__controls">
              {#each module.leafSwitches as setting (setting.key)}
                <label class="entry-leaf-control">
                  <span class="truncate">{translate(setting.title)}</span>
                  <Switch
                    size="sm"
                    class="damophus-entry-switch"
                    checked={Boolean(setting.value)}
                    aria-label={`${translate(module.title)}: ${translate(setting.title)}`}
                    onCheckedChange={(checked) => changeLeaf(module, setting.key, checked)}
                  />
                </label>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </article>
  {/each}
</section>

<style>
  .entry-management {
    border-block: 1px solid var(--border);
  }

  .entry-management__toolbar {
    display: flex;
    min-height: 38px;
    align-items: center;
    justify-content: flex-end;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--muted) 18%, transparent);
  }

  .entry-management__visibility {
    display: inline-flex;
    cursor: pointer;
    align-items: center;
    gap: 8px;
    color: var(--muted-foreground);
    font-size: 12px;
  }

  .entry-module {
    display: grid;
    grid-template-columns: minmax(152px, 0.72fr) minmax(0, 2fr);
    border-bottom: 1px solid var(--border);
  }

  .entry-module:last-child { border-bottom: 0; }

  .entry-module__header {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 12px;
    background: color-mix(in srgb, var(--muted) 22%, transparent);
  }

  .entry-module__order { display: inline-flex; gap: 2px; margin-left: auto; }
  .entry-order-button { display: inline-grid; width: 24px; height: 24px; place-items: center; border: 1px solid var(--border); color: var(--muted-foreground); background: transparent; cursor: pointer; }
  .entry-order-button:disabled { cursor: default; opacity: 0.35; }

  .entry-module__body {
    min-width: 0;
    padding: 8px 12px;
  }

  .entry-surface-grid,
  .entry-leaves__controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 2px 12px;
  }

  .entry-control,
  .entry-leaf-control {
    display: flex;
    min-width: 0;
    min-height: 34px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .entry-control__label {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    color: var(--muted-foreground);
    font-size: 12px;
  }

  .entry-leaves {
    display: grid;
    grid-template-columns: 116px minmax(0, 1fr);
    gap: 12px;
    margin-top: 6px;
    padding-top: 7px;
    border-top: 1px dashed color-mix(in srgb, var(--border) 75%, transparent);
  }

  .entry-leaves__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted-foreground);
    font-size: 11px;
  }

  .entry-leaf-control {
    color: var(--foreground);
    font-size: 12px;
  }

  .entry-management.compact .entry-module {
    grid-template-columns: minmax(0, 1fr);
  }

  .entry-management.compact .entry-module__header {
    padding-bottom: 9px;
  }

  .entry-management.compact .entry-module__body {
    padding-top: 0;
  }

  .entry-management.compact .entry-leaves {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }

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
