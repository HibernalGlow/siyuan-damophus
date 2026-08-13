<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { flip } from "svelte/animate";
  import { dragHandle, dragHandleZone, type DndEvent } from "svelte-dnd-action";
  import { CircleHelp, GripVertical, Image, RefreshCw } from "lucide-svelte";
  import { Switch } from "@/components/ui/switch";
  import {
    mergeSlashMenuItems,
    parseSlashMenuConfig,
    parseSlashMenuItems,
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
  let surface: SlashMenuSurface = "mobile";
  let mobileRendered: SlashMenuItemConfig[] = [];
  let desktopRendered: SlashMenuItemConfig[] = [];
  let mobileSourceKey = "";
  let desktopSourceKey = "";
  $: discovered = parseSlashMenuItems(catalog);
  $: mobileItems = mergeSlashMenuItems(discovered, parseSlashMenuConfig(mobileConfig));
  $: desktopItems = mergeSlashMenuItems(discovered, parseSlashMenuConfig(desktopConfig));
  $: mobileKey = `${catalog}\u0000${mobileConfig}`;
  $: desktopKey = `${catalog}\u0000${desktopConfig}`;
  $: if (mobileKey !== mobileSourceKey) {
    mobileSourceKey = mobileKey;
    mobileRendered = mobileItems;
  }
  $: if (desktopKey !== desktopSourceKey) {
    desktopSourceKey = desktopKey;
    desktopRendered = desktopItems;
  }
  $: surfaceTitle = surface === "mobile" ? labels.mobile : labels.desktop;
  $: surfaceEnabled = surface === "mobile" ? mobileEnabled : desktopEnabled;
  $: config = surface === "mobile" ? mobileRendered : desktopRendered;

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

  function setRendered(surface: SlashMenuSurface, next: SlashMenuItemConfig[]) {
    if (surface === "mobile") mobileRendered = next;
    else desktopRendered = next;
  }

  function consider(event: CustomEvent<DndEvent<SlashMenuItemConfig>>) {
    setRendered(surface, event.detail.items);
  }

  function finalize(event: CustomEvent<DndEvent<SlashMenuItemConfig>>) {
    setRendered(surface, event.detail.items);
    persist(surface, event.detail.items);
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

  <div class="slash-settings__surface-tabs" role="tablist" aria-label={title}>
    <button role="tab" aria-selected={surface === "mobile"} class:active={surface === "mobile"} onclick={() => surface = "mobile"}>{labels.mobile}</button>
    <button role="tab" aria-selected={surface === "desktop"} class:active={surface === "desktop"} onclick={() => surface = "desktop"}>{labels.desktop}</button>
  </div>

  <section class="slash-settings__surface" data-slash-surface={surface} aria-labelledby={`slash-surface-${surface}`}>
    <header class="slash-settings__surface-header">
      <div id={`slash-surface-${surface}`} class="slash-settings__surface-title">{surfaceTitle}</div>
      <label class="slash-settings__surface-toggle">
        <span>{labels.enabled}</span>
        <Switch checked={surfaceEnabled} aria-label={`${labels.enabled}: ${surfaceTitle}`} onCheckedChange={(enabled) => setSurfaceEnabled(surface, enabled)} />
      </label>
    </header>

    {#if config.length === 0}
      <div class="slash-settings__empty"><CircleHelp class="size-5" aria-hidden="true" />{labels.empty}</div>
    {:else}
      <div
        class="slash-settings__list"
        role="list"
        data-slash-menu-dnd
        use:dragHandleZone={{
          items: config,
          type: `damophus-slash-menu-${surface}`,
          flipDurationMs: 160,
          dropTargetClasses: ["slash-settings__list--drop-target"],
          delayTouchStart: true,
        }}
        onconsider={consider}
        onfinalize={finalize}
      >
        {#each config as entry, index (entry.id)}
          {@const item = discovered.find((candidate) => candidate.id === entry.id)}
          <article class="slash-settings__card" role="listitem" data-slash-item={entry.id} animate:flip={{ duration: 160 }}>
            <div class="slash-settings__card-header">
              <span use:dragHandle class="slash-settings__drag" title={`${labels.display}: ${item?.label ?? entry.id}`} aria-label={`Drag: ${item?.label ?? entry.id}`}>
                <GripVertical class="size-4" aria-hidden="true" />
              </span>
              <span class="slash-settings__icon" title={item?.hasIcon ? labels.icon : labels.noIcon}>
                {#if item?.hasIcon}<Image class="size-4" aria-hidden="true" />{:else}<span class="slash-settings__text-icon">T</span>{/if}
              </span>
              <span class="slash-settings__label" title={item?.label}>{item?.label ?? entry.id}</span>
              <Switch checked={entry.visible} aria-label={`${labels.visible}: ${item?.label ?? entry.id}`} onCheckedChange={(visible) => update(surface, config, index, { visible })} />
            </div>
            {#if item?.hasIcon}
              <div class="slash-settings__display-tabs" role="tablist" aria-label={`${labels.display}: ${item.label}`}>
                <button role="tab" aria-selected={entry.display === "icon"} class:active={entry.display === "icon"} onclick={() => update(surface, config, index, { display: "icon" })}>{labels.iconOnly}</button>
                <button role="tab" aria-selected={entry.display === "full"} class:active={entry.display === "full"} onclick={() => update(surface, config, index, { display: "full" })}>{labels.full}</button>
              </div>
            {:else}
              <span class="slash-settings__forced" title={labels.noIcon}>{labels.full}</span>
            {/if}
          </article>
        {/each}
      </div>
    {/if}
  </section>
</section>

<style>
  .slash-settings { display: flex; min-width: 0; flex-direction: column; gap: 16px; }
  .slash-settings__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
  .slash-settings__heading-copy { min-width: 0; }
  .slash-settings__refresh { display: inline-flex; min-height: 32px; flex: 0 0 auto; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); color: var(--foreground); font-size: 12px; }
  .slash-settings__refresh:hover { background: var(--muted); }
  .slash-settings__surface-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; padding: 3px; border: 1px solid var(--border); border-radius: 7px; background: var(--muted); }
  .slash-settings__surface-tabs button, .slash-settings__display-tabs button { border: 0; border-radius: 5px; background: transparent; color: var(--muted-foreground); }
  .slash-settings__surface-tabs button { min-height: 36px; font-size: 13px; font-weight: 600; }
  .slash-settings__surface-tabs button.active, .slash-settings__display-tabs button.active { background: var(--background); color: var(--foreground); box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 12%, transparent); }
  .slash-settings__surface { min-width: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
  .slash-settings__surface-header { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--muted) 45%, transparent); }
  .slash-settings__surface-title { font-size: 14px; font-weight: 600; }
  .slash-settings__surface-toggle { display: inline-flex; align-items: center; gap: 8px; color: var(--muted-foreground); font-size: 12px; }
  .slash-settings__list { display: grid; min-width: 0; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap: 8px; padding: 8px; background: color-mix(in srgb, var(--muted) 18%, transparent); }
  :global(.slash-settings__list--drop-target) { background: color-mix(in srgb, var(--primary) 7%, transparent); }
  .slash-settings__card { display: flex; min-width: 0; flex-direction: column; gap: 9px; padding: 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); box-shadow: 0 1px 2px color-mix(in srgb, var(--foreground) 5%, transparent); }
  .slash-settings__card-header { display: grid; min-width: 0; grid-template-columns: 18px 30px minmax(0, 1fr) auto; align-items: center; gap: 7px; }
  .slash-settings__drag { display: inline-flex; width: 18px; height: 30px; cursor: grab; touch-action: none; align-items: center; justify-content: center; color: var(--muted-foreground); opacity: .65; }
  .slash-settings__drag:active { cursor: grabbing; }
  .slash-settings__icon { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; border-radius: 6px; background: var(--muted); color: var(--muted-foreground); }
  .slash-settings__text-icon { font-size: 12px; font-weight: 700; }
  .slash-settings__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .slash-settings__display-tabs { display: grid; grid-template-columns: repeat(2, minmax(72px, 1fr)); gap: 2px; padding: 2px; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); }
  .slash-settings__display-tabs button { min-height: 28px; padding-inline: 8px; font-size: 12px; }
  .slash-settings__forced { width: 100%; color: var(--muted-foreground); font-size: 12px; text-align: center; }
  .slash-settings__empty { display: flex; align-items: center; gap: 8px; padding: 20px; color: var(--muted-foreground); font-size: 13px; }
  @media (max-width: 640px) {
    .slash-settings__header { align-items: stretch; flex-direction: column; }
    .slash-settings__refresh { align-self: flex-start; }
  }
</style>
