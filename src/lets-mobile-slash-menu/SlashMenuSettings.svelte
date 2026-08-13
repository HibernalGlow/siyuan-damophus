<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ArrowDown, ArrowUp, CircleHelp, Image, RefreshCw } from "lucide-svelte";
  import { Switch } from "@/components/ui/switch";
  import * as Select from "@/components/ui/select";
  import {
    mergeSlashMenuItems,
    parseSlashMenuConfig,
    parseSlashMenuItems,
    reorderSlashMenuConfig,
    serializeSlashMenuConfig,
    type SlashMenuItemConfig,
    type SlashMenuSurface,
  } from "./slash-menu-settings";

  export let title = "";
  export let mobileConfig = "[]";
  export let desktopConfig = "[]";
  export let mobileEnabled = true;
  export let desktopEnabled = false;
  export let catalog = "[]";
  export let labels: {
    description: string;
    mobile: string;
    desktop: string;
    enabled: string;
    visible: string;
    display: string;
    icon: string;
    full: string;
    iconOnly: string;
    moveUp: string;
    moveDown: string;
    noIcon: string;
    empty: string;
    refresh: string;
  };

  const dispatch = createEventDispatcher();
  $: discovered = parseSlashMenuItems(catalog);
  $: mobileItems = mergeSlashMenuItems(discovered, parseSlashMenuConfig(mobileConfig));
  $: desktopItems = mergeSlashMenuItems(discovered, parseSlashMenuConfig(desktopConfig));
  $: surfaces = [
    { id: "mobile" as const, title: labels.mobile, enabled: mobileEnabled, config: mobileItems },
    { id: "desktop" as const, title: labels.desktop, enabled: desktopEnabled, config: desktopItems },
  ];

  function persist(surface: SlashMenuSurface, next: SlashMenuItemConfig[]) {
    const value = serializeSlashMenuConfig(next);
    if (surface === "mobile") mobileConfig = value;
    else desktopConfig = value;
    dispatch("changed", { key: surface === "mobile" ? "mobileMenuConfig" : "desktopMenuConfig", value });
  }

  function setSurfaceEnabled(surface: SlashMenuSurface, enabled: boolean) {
    if (surface === "mobile") mobileEnabled = enabled;
    else desktopEnabled = enabled;
    dispatch("changed", { key: surface === "mobile" ? "mobileEnabled" : "desktopEnabled", value: enabled });
  }

  function update(surface: SlashMenuSurface, config: SlashMenuItemConfig[], index: number, patch: Partial<SlashMenuItemConfig>) {
    persist(surface, config.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry));
  }

  function move(surface: SlashMenuSurface, config: SlashMenuItemConfig[], index: number, offset: -1 | 1) {
    persist(surface, reorderSlashMenuConfig(config, index, offset));
  }
</script>

<section class="slash-settings" data-slash-menu-settings>
  <header class="slash-settings__header">
    <div class="slash-settings__heading-copy">
      <div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div>
      <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">{labels.description}</p>
    </div>
    <button class="slash-settings__refresh" onclick={() => dispatch("refresh")}><RefreshCw class="size-4" />{labels.refresh}</button>
  </header>

  <div class="slash-settings__surfaces">
    {#each surfaces as surface (surface.id)}
      <section class="slash-settings__surface" data-slash-surface={surface.id} aria-labelledby={`slash-surface-${surface.id}`}>
        <header class="slash-settings__surface-header">
          <div id={`slash-surface-${surface.id}`} class="slash-settings__surface-title">{surface.title}</div>
          <label class="slash-settings__surface-toggle">
            <span>{labels.enabled}</span>
            <Switch
              checked={surface.enabled}
              aria-label={`${labels.enabled}: ${surface.title}`}
              onCheckedChange={(enabled) => setSurfaceEnabled(surface.id, enabled)}
            />
          </label>
        </header>

        {#if surface.config.length === 0}
          <div class="slash-settings__empty"><CircleHelp class="size-5" aria-hidden="true" />{labels.empty}</div>
        {:else}
          <div class="slash-settings__list" role="list">
            {#each surface.config as entry, index (entry.id)}
              {@const item = discovered.find((candidate) => candidate.id === entry.id)}
              <article class="slash-settings__row" role="listitem" data-slash-item={entry.id}>
                <span class="slash-settings__icon" title={item?.hasIcon ? labels.icon : labels.noIcon}>
                  {#if item?.hasIcon}<Image class="size-4" aria-hidden="true" />{:else}<span class="slash-settings__text-icon">T</span>{/if}
                </span>
                <span class="slash-settings__label" title={item?.label}>{item?.label ?? entry.id}</span>
                <Switch
                  checked={entry.visible}
                  aria-label={`${labels.visible}: ${item?.label ?? entry.id}`}
                  onCheckedChange={(visible) => update(surface.id, surface.config, index, { visible })}
                />
                <button class="slash-settings__move" title={labels.moveUp} aria-label={`${labels.moveUp}: ${item?.label ?? entry.id}`} disabled={index === 0} onclick={() => move(surface.id, surface.config, index, -1)}><ArrowUp class="size-4" /></button>
                <button class="slash-settings__move" title={labels.moveDown} aria-label={`${labels.moveDown}: ${item?.label ?? entry.id}`} disabled={index === surface.config.length - 1} onclick={() => move(surface.id, surface.config, index, 1)}><ArrowDown class="size-4" /></button>
                {#if item?.hasIcon}
                  <Select.Root type="single" value={entry.display} onValueChange={(display) => update(surface.id, surface.config, index, { display: display as "icon" | "full" })}>
                    <Select.Trigger class="slash-settings__display" aria-label={`${labels.display}: ${item.label}`}>{entry.display === "icon" ? labels.iconOnly : labels.full}</Select.Trigger>
                    <Select.Content>
                      <Select.Item value="icon" label={labels.iconOnly} />
                      <Select.Item value="full" label={labels.full} />
                    </Select.Content>
                  </Select.Root>
                {:else}
                  <span class="slash-settings__forced" title={labels.noIcon}>{labels.full}</span>
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
</section>

<style>
  .slash-settings { display: flex; min-width: 0; flex-direction: column; gap: 16px; }
  .slash-settings__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .slash-settings__heading-copy { min-width: 0; }
  .slash-settings__refresh { display: inline-flex; min-height: 32px; flex: 0 0 auto; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground); font-size: 12px; }
  .slash-settings__refresh:hover { background: var(--muted); }
  .slash-settings__surfaces { display: grid; min-width: 0; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .slash-settings__surface { min-width: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .slash-settings__surface-header { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--muted) 45%, transparent); }
  .slash-settings__surface-title { font-size: 14px; font-weight: 600; }
  .slash-settings__surface-toggle { display: inline-flex; align-items: center; gap: 8px; color: var(--muted-foreground); font-size: 12px; }
  .slash-settings__list { min-width: 0; }
  .slash-settings__row { display: grid; min-width: 0; grid-template-columns: 30px minmax(0, 1fr) auto 30px 30px; align-items: center; gap: 7px; padding: 8px 9px; border-bottom: 1px solid var(--border); }
  .slash-settings__row:last-child { border-bottom: 0; }
  .slash-settings__icon { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 6px; background: var(--muted); color: var(--muted-foreground); }
  .slash-settings__text-icon { font-size: 12px; font-weight: 700; }
  .slash-settings__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  :global(.slash-settings__display) { grid-column: 2 / -1; width: auto; min-width: 112px; justify-self: start; }
  .slash-settings__forced { grid-column: 2 / -1; color: var(--muted-foreground); font-size: 12px; }
  .slash-settings__move { display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; border: 0; border-radius: 4px; background: transparent; color: var(--muted-foreground); }
  .slash-settings__move:hover:not(:disabled) { background: var(--muted); color: var(--foreground); }
  .slash-settings__move:disabled { opacity: .35; }
  .slash-settings__empty { display: flex; align-items: center; gap: 8px; padding: 20px; color: var(--muted-foreground); font-size: 13px; }
  @media (max-width: 900px) {
    .slash-settings__surfaces { grid-template-columns: minmax(0, 1fr); }
  }
</style>
