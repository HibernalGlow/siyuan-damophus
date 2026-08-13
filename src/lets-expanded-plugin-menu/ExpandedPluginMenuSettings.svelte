<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ChevronDown, Plug, Puzzle } from "lucide-svelte";
  import * as Select from "@/components/ui/select";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import { parseDiscoveredPluginMenuEntries, type DiscoveredPluginMenuEntry } from "./discovered-entries";
  import {
    extractAdvancedExpandedMenuRules,
    selectedDiscoveredEntryKeys,
    serializeExpandedMenuSettings,
  } from "./settings-model";
  import {
    parseDiscoveredPluginMenuAnchors,
    parsePluginMenuPlacement,
    serializePluginMenuPlacement,
    type PluginMenuPlacement,
  } from "./settings-model";

  export let group: string;
  export let title: string;
  export let discoveredEntries: unknown = "[]";
  export let allowedEntries = "";
  export let pluginMenuPlacement: unknown = "{\"mode\":\"native\"}";
  export let pluginMenuAnchors: unknown = "[]";
  export let moduleStates: Record<string, boolean> = {};
  export let labels: {
    listTitle: string;
    listDescription: string;
    empty: string;
    emptyHint: string;
    allowExpansion: string;
    moduleEnabled: string;
    moduleDisabled: string;
    externalPlugin: string;
    textMatch: string;
    moduleId: string;
    pluginId: string;
    declaration: string;
    advanced: string;
    advancedDescription: string;
    advancedPlaceholder: string;
    placementTitle: string;
    placementDescription: string;
    placementNative: string;
    placementTop: string;
    placementBefore: string;
    placementAfter: string;
    placementAnchor: string;
  };

  const dispatch = createEventDispatcher();
  let syncedState = "";
  let selectedKeys = new Set<string>();
  let advancedRules = "";
  let placement: PluginMenuPlacement = parsePluginMenuPlacement(pluginMenuPlacement);
  $: entries = parseDiscoveredPluginMenuEntries(discoveredEntries)
    .filter((entry) => entry.source === "identity")
    .sort((left, right) => right.lastSeen - left.lastSeen || left.label.localeCompare(right.label));
  $: stateSignature = `${allowedEntries}\n${entries.map((entry) => entry.key).join("\n")}`;
  $: if (stateSignature !== syncedState) {
    syncedState = stateSignature;
    selectedKeys = selectedDiscoveredEntryKeys(allowedEntries, entries);
    advancedRules = extractAdvancedExpandedMenuRules(allowedEntries, entries);
  }
  // Preserve SiYuan's observed menu order so the selector mirrors the real
  // menu instead of alphabetically scrambling native groups.
  $: anchors = parseDiscoveredPluginMenuAnchors(pluginMenuAnchors);
  $: placement = parsePluginMenuPlacement(pluginMenuPlacement);

  function persist(nextSelectedKeys = selectedKeys, nextAdvancedRules = advancedRules) {
    const value = serializeExpandedMenuSettings(entries, nextSelectedKeys, nextAdvancedRules);
    syncedState = `${value}\n${entries.map((entry) => entry.key).join("\n")}`;
    dispatch("changed", { group, key: "allowedEntries", value });
  }

  function setEntryAllowed(entryKey: string, allowed: boolean) {
    const next = new Set(selectedKeys);
    if (allowed) next.add(entryKey);
    else next.delete(entryKey);
    selectedKeys = next;
    persist(next, advancedRules);
  }

  function statusFor(entry: DiscoveredPluginMenuEntry): string {
    if (entry.moduleId) return moduleStates[entry.moduleId] ? labels.moduleEnabled : labels.moduleDisabled;
    return entry.pluginId ? labels.externalPlugin : labels.textMatch;
  }

  function setPlacement(next: PluginMenuPlacement) {
    placement = next;
    dispatch("changed", {
      group,
      key: "pluginMenuPlacement",
      value: serializePluginMenuPlacement(next),
    });
  }

  function placementMode(): string {
    return placement.mode === "native" || placement.mode === "top" ? placement.mode : placement.mode;
  }

  function selectPlacementMode(mode: string) {
    if (mode === "native") setPlacement({ mode: "native" });
    else if (mode === "top") setPlacement({ mode: "top" });
    else if (mode === "before" || mode === "after") {
      const anchorId = placement.mode === "before" || placement.mode === "after"
        ? placement.anchorId
        : anchors[0]?.id;
      if (anchorId) setPlacement({ mode, anchorId });
    }
  }
</script>

<section class="expanded-menu-settings" data-expanded-plugin-menu-settings>
  <header class="expanded-menu-settings__header">
    <div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div>
  </header>

  <div class="expanded-menu-settings__surface">
    <div class="expanded-menu-settings__placement">
      <div>
        <div class="text-sm font-medium">{labels.placementTitle}</div>
        <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">{labels.placementDescription}</p>
      </div>
      <div class="expanded-menu-settings__placement-grid">
        <Select.Root type="single" value={placementMode()} onValueChange={selectPlacementMode}>
          <Select.Trigger class="w-full" aria-label={labels.placementTitle}>
            {placement.mode === "native" ? labels.placementNative : placement.mode === "top" ? labels.placementTop : placement.mode === "before" ? labels.placementBefore : labels.placementAfter}
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="native" label={labels.placementNative} />
            <Select.Item value="top" label={labels.placementTop} />
            <Select.Item value="before" label={labels.placementBefore} />
            <Select.Item value="after" label={labels.placementAfter} />
          </Select.Content>
        </Select.Root>
        {#if placement.mode === "before" || placement.mode === "after"}
          <Select.Root type="single" value={placement.anchorId} onValueChange={(anchorId) => setPlacement({ mode: placement.mode, anchorId })}>
            <Select.Trigger class="w-full" aria-label={labels.placementAnchor}>{labels.placementAnchor}: {anchors.find((anchor) => anchor.id === placement.anchorId)?.label ?? placement.anchorId}</Select.Trigger>
            <Select.Content>
              {#each anchors as anchor (anchor.id)}
                <Select.Item value={anchor.id} label={`${anchor.label} (${anchor.id})`} />
              {/each}
            </Select.Content>
          </Select.Root>
        {/if}
      </div>
      {#if anchors.length === 0}
        <p class="m-0 text-xs text-muted-foreground">{labels.emptyHint}</p>
      {/if}
    </div>

    <div class="expanded-menu-settings__intro">
      <div class="text-sm font-medium">{labels.listTitle}</div>
      <p class="m-0 mt-1 text-xs leading-5 text-muted-foreground">{labels.listDescription}</p>
    </div>

    {#if entries.length === 0}
      <div class="expanded-menu-settings__empty">
        <Puzzle class="size-5" aria-hidden="true" />
        <div>
          <div class="text-sm font-medium">{labels.empty}</div>
          <div class="mt-1 text-xs text-muted-foreground">{labels.emptyHint}</div>
        </div>
      </div>
    {:else}
      <div class="expanded-menu-settings__entries" role="list">
        {#each entries as entry (entry.key)}
          <div class="expanded-menu-settings__entry" role="listitem" data-entry-key={entry.key}>
            <span class="expanded-menu-settings__icon">
              {#if entry.moduleId}<Puzzle class="size-4" aria-hidden="true" />
              {:else}<Plug class="size-4" aria-hidden="true" />{/if}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span class="text-sm font-medium">{entry.label}</span>
                <span class:expanded-menu-settings__status--enabled={Boolean(entry.moduleId && moduleStates[entry.moduleId])} class="expanded-menu-settings__status">{statusFor(entry)}</span>
              </div>
              <dl class="expanded-menu-settings__identity">
                {#if entry.moduleId}<div><dt>{labels.moduleId}</dt><dd>{entry.moduleId}</dd></div>{/if}
                {#if entry.pluginId}<div><dt>{labels.pluginId}</dt><dd>{entry.pluginId}</dd></div>{/if}
                {#if entry.declaration}<div><dt>{labels.declaration}</dt><dd>{entry.declaration}</dd></div>{/if}
              </dl>
            </div>
            <Switch
              checked={selectedKeys.has(entry.key)}
              aria-label={`${labels.allowExpansion}: ${entry.label}`}
              onCheckedChange={(checked) => setEntryAllowed(entry.key, checked)}
            />
          </div>
        {/each}
      </div>
    {/if}

    <details class="expanded-menu-settings__advanced">
      <summary>
        <span>
          <span class="text-sm font-medium">{labels.advanced}</span>
          <span class="mt-0.5 block text-xs text-muted-foreground">{labels.advancedDescription}</span>
        </span>
        <ChevronDown class="size-4 shrink-0 transition-transform" aria-hidden="true" />
      </summary>
      <Textarea class="mt-3 min-h-28 font-mono text-xs" value={advancedRules} placeholder={labels.advancedPlaceholder} aria-label={labels.advanced}
        oninput={(event) => { advancedRules = event.currentTarget.value; }} onchange={() => persist(selectedKeys, advancedRules)} />
    </details>
  </div>
</section>

<style>
  .expanded-menu-settings { display: flex; min-width: 0; flex-direction: column; gap: 20px; }
  .expanded-menu-settings__header { padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .expanded-menu-settings__surface { overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: color-mix(in srgb, var(--card) 72%, transparent); }
  .expanded-menu-settings__placement { display: grid; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
  .expanded-menu-settings__placement-grid { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr); gap: 10px; }
  .expanded-menu-settings__intro { padding: 14px 16px 12px; border-bottom: 1px solid var(--border); }
  .expanded-menu-settings__entries { display: flex; flex-direction: column; }
  .expanded-menu-settings__entry { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; min-height: 68px; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
  .expanded-menu-settings__icon { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border-radius: 6px; background: var(--muted); color: var(--muted-foreground); }
  .expanded-menu-settings__status { display: inline-flex; min-height: 20px; align-items: center; padding-inline: 7px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted-foreground); font-size: 11px; line-height: 18px; }
  .expanded-menu-settings__status--enabled { border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); background: color-mix(in srgb, var(--primary) 9%, transparent); color: var(--primary); }
  .expanded-menu-settings__identity { display: flex; min-width: 0; flex-wrap: wrap; gap: 3px 10px; margin: 4px 0 0; color: var(--muted-foreground); font-size: 11px; }
  .expanded-menu-settings__identity div { display: flex; min-width: 0; gap: 4px; }
  .expanded-menu-settings__identity dt { font-weight: 500; }
  .expanded-menu-settings__identity dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-family: var(--b3-font-family-code, monospace); }
  .expanded-menu-settings__empty { display: flex; align-items: flex-start; gap: 10px; padding: 18px 16px; border-bottom: 1px solid var(--border); color: var(--muted-foreground); }
  .expanded-menu-settings__advanced { padding: 12px 16px; }
  .expanded-menu-settings__advanced summary { display: flex; cursor: pointer; list-style: none; align-items: center; justify-content: space-between; gap: 12px; }
  .expanded-menu-settings__advanced summary::-webkit-details-marker { display: none; }
  .expanded-menu-settings__advanced[open] summary :global(svg) { transform: rotate(180deg); }
  @media (max-width: 640px) {
    .expanded-menu-settings__placement-grid { grid-template-columns: 1fr; }
    .expanded-menu-settings__entry { grid-template-columns: 28px minmax(0, 1fr) auto; gap: 9px; padding-inline: 12px; }
    .expanded-menu-settings__icon { width: 28px; height: 28px; }
  }
</style>
