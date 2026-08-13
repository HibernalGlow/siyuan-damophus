<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import Check from "lucide-svelte/icons/check";
  import Search from "lucide-svelte/icons/search";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import {
    normalizeSiyuanBlockTypes,
    siyuanBlockTypeOptions,
    type SiyuanBlockTypeGroup,
    type SiyuanBlockTypeOption,
  } from "./siyuan-block-types";

  export let value: unknown = [];
  export let labels: Record<string, string> = {};

  const dispatch = createEventDispatcher<{ value: string[] }>();
  const groups: SiyuanBlockTypeGroup[] = ["text", "structure", "embed"];
  let query = "";

  $: selected = normalizeSiyuanBlockTypes(value);
  $: normalizedQuery = query.trim().toLocaleLowerCase();

  function t(key: string, fallback: string): string {
    return labels[key] || fallback;
  }

  function optionLabel(option: SiyuanBlockTypeOption): string {
    return t(option.label, option.value.replace(/^Node/u, ""));
  }

  function visibleOptions(group: SiyuanBlockTypeGroup, filter = normalizedQuery): readonly SiyuanBlockTypeOption[] {
    const options = siyuanBlockTypeOptions(group);
    if (!filter) return options;
    return options.filter((option) =>
      `${optionLabel(option)} ${option.value}`.toLocaleLowerCase().includes(filter),
    );
  }

  function update(next: string[]): void {
    const normalized = normalizeSiyuanBlockTypes(next);
    value = normalized;
    dispatch("value", normalized);
  }

  function toggle(blockType: string): void {
    const next = new Set(selected);
    if (next.has(blockType)) next.delete(blockType);
    else next.add(blockType);
    update([...next]);
  }
</script>

<div class="damophus-block-type-selector grid gap-3" data-testid="block-type-selector">
  <div class="flex flex-wrap items-center gap-2">
    <label class="relative min-w-[180px] flex-1">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        class="pl-8"
        type="search"
        bind:value={query}
        oninput={(event) => { query = (event.target as HTMLInputElement).value; }}
        placeholder={t("settings.blockType.search", "Search block types")}
        aria-label={t("settings.blockType.search", "Search block types")}
      />
    </label>
    <span class="text-xs tabular-nums text-muted-foreground" aria-live="polite">
      {t("settings.blockType.selected", "Selected")} {selected.length}
    </span>
    <Button variant="ghost" size="sm" onclick={() => update(siyuanBlockTypeOptions("text").concat(siyuanBlockTypeOptions("structure"), siyuanBlockTypeOptions("embed")).map((option) => option.value))}>
      {t("settings.blockType.selectAll", "Select all")}
    </Button>
    <Button variant="ghost" size="sm" disabled={selected.length === 0} onclick={() => update([])}>
      {t("settings.blockType.clear", "Clear")}
    </Button>
  </div>

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {#each groups as group}
      {@const options = visibleOptions(group, normalizedQuery)}
      {#if options.length > 0}
        <section class="min-w-0" aria-labelledby={`block-type-group-${group}`}>
          <h4 id={`block-type-group-${group}`} class="mb-1.5 text-xs font-medium text-muted-foreground">
            {t(`settings.blockType.group.${group}`, group)}
          </h4>
          <div class="grid gap-1">
            {#each options as option (option.value)}
              {@const checked = selected.includes(option.value)}
              <button
                type="button"
                class="damophus-block-type-option grid min-h-9 w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                class:selected={checked}
                aria-pressed={checked}
                data-selected={checked ? "true" : "false"}
                data-slot="button"
                aria-label={`${optionLabel(option)} (${option.value})`}
                data-block-type={option.value}
                onclick={() => toggle(option.value)}
              >
                <svg class="size-4 text-muted-foreground" aria-hidden="true"><use href={`#${option.icon}`}></use></svg>
                <span class="min-w-0 truncate text-sm">{optionLabel(option)}</span>
                <span class="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                  {option.value.replace(/^Node/u, "")}
                  {#if checked}<Check class="size-3.5 text-primary" aria-hidden="true" />{/if}
                </span>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  </div>

  {#if normalizedQuery && groups.every((group) => visibleOptions(group, normalizedQuery).length === 0)}
    <p class="m-0 py-3 text-center text-sm text-muted-foreground">{t("settings.blockType.noResults", "No matching block types")}</p>
  {/if}
</div>

<style>
  .damophus-block-type-option {
    appearance: none;
    border-color: var(--border);
    background: var(--background);
    color: var(--foreground);
    font: inherit;
  }

  .damophus-block-type-option:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .damophus-block-type-option[data-selected="true"] {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 5%, var(--background));
  }
</style>
