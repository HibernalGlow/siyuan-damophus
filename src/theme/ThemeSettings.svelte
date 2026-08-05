<script lang="ts" module>
  export interface ThemeSettingsLabels {
    builtin: string;
    custom: string;
    import: string;
    export: string;
    apply: string;
    applied: string;
    reset: string;
    remove: string;
    empty: string;
    importConfirm: string;
    importSummary: string;
    invalidFile: string;
  }
</script>

<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Check, Download, FileUp, RotateCcw, Trash2 } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import * as Tabs from "@/components/ui/tabs";
  import { cn } from "@/lib/utils";
  import type { ColorMode } from "./runtime";
  import type { DamophusTheme, ThemeImportReport } from "./schema";
  import { importThemesUtf8 } from "./schema";
  import { exportCustomThemes } from "./library";
  import { themeId } from "./themes";

  export let builtinThemes: readonly DamophusTheme[];
  export let customThemes: readonly DamophusTheme[];
  export let selectedId: string;
  export let savedId: string;
  export let mode: ColorMode;
  export let labels: ThemeSettingsLabels;

  const dispatch = createEventDispatcher<{
    select: { id: string };
    apply: { id: string };
    import: { themes: DamophusTheme[] };
    remove: { name: string };
    reset: void;
  }>();

  let view = "builtin";
  let fileInput: HTMLInputElement;
  let pendingReport: ThemeImportReport | undefined;

  function selectTheme(theme: DamophusTheme, source: "builtin" | "custom") {
    dispatch("select", { id: themeId(theme, source) });
  }

  async function readThemeFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    pendingReport = importThemesUtf8(new Uint8Array(await file.arrayBuffer()));
  }

  function confirmImport() {
    if (!pendingReport?.themes.length) return;
    dispatch("import", { themes: pendingReport.themes });
    pendingReport = undefined;
    view = "custom";
  }

  function exportThemes() {
    if (customThemes.length === 0) return;
    const url = URL.createObjectURL(new Blob([exportCustomThemes(customThemes)], {
      type: "application/json;charset=utf-8",
    }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "damophus-themes.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function swatches(theme: DamophusTheme) {
    const vars = theme.cssVars[mode];
    return [vars.primary, vars.secondary, vars.accent, vars.background].filter(Boolean) as string[];
  }
</script>

<section class="flex min-w-0 flex-col gap-4" aria-label={labels.builtin}>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <Tabs.Root bind:value={view} class="min-w-0">
      <Tabs.List>
        <Tabs.Trigger value="builtin">{labels.builtin}</Tabs.Trigger>
        <Tabs.Trigger value="custom">{labels.custom}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <div class="flex items-center gap-2">
      <input
        class="sr-only"
        bind:this={fileInput}
        type="file"
        accept="application/json,.json"
        on:change={readThemeFile}
      />
      <Button variant="outline" size="sm" onclick={() => fileInput.click()}>
        <FileUp data-icon="inline-start" />
        {labels.import}
      </Button>
      <Button variant="outline" size="icon-sm" disabled={customThemes.length === 0} onclick={exportThemes} title={labels.export}>
        <Download />
        <span class="sr-only">{labels.export}</span>
      </Button>
    </div>
  </div>

  {#if pendingReport}
    <div class="flex flex-wrap items-center justify-between gap-3 border-y border-border bg-muted/45 px-3 py-2 text-sm" role="status">
      <span>
        {pendingReport.themes.length > 0
          ? labels.importSummary.replace("{count}", String(pendingReport.themes.length))
          : labels.invalidFile}
        {#if pendingReport.errors.length > 0}
          · {pendingReport.errors[0].message}
        {/if}
      </span>
      {#if pendingReport.themes.length > 0}
        <Button size="sm" onclick={confirmImport}>
          <Check data-icon="inline-start" />
          {labels.importConfirm}
        </Button>
      {/if}
    </div>
  {/if}

  <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
    {#each (view === "builtin" ? builtinThemes : customThemes) as theme (theme.name)}
      {@const source = view === "builtin" ? "builtin" : "custom"}
      {@const id = themeId(theme, source)}
      <article
        class={cn(
          "group relative flex min-h-24 flex-col justify-between gap-3 overflow-hidden rounded-lg border bg-card p-3 text-card-foreground transition-colors",
          selectedId === id && "border-primary ring-2 ring-primary/20",
        )}
      >
        <button
          class="absolute inset-0 z-0 rounded-lg bg-transparent outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-label={theme.name}
          aria-pressed={selectedId === id}
          on:click={() => selectTheme(theme, source)}
        ></button>
        <div class="pointer-events-none relative z-[1] flex items-start justify-between gap-2">
          <div class="min-w-0">
            <strong class="block truncate text-sm font-semibold">{theme.name}</strong>
            {#if theme.description}
              <span class="mt-0.5 block truncate text-xs text-muted-foreground">{theme.description}</span>
            {/if}
          </div>
          {#if selectedId === id}
            <Check class="text-primary" aria-hidden="true" />
          {/if}
        </div>
        <div class="pointer-events-none relative z-[1] flex h-5 overflow-hidden rounded-md border border-border">
          {#each swatches(theme) as color}
            <span class="flex-1" style={`background:${color}`}></span>
          {/each}
        </div>
        {#if source === "custom"}
          <Button
            class="absolute bottom-2 right-2 z-[2] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            variant="ghost"
            size="icon-sm"
            title={labels.remove}
            onclick={(event) => {
              event.stopPropagation();
              dispatch("remove", { name: theme.name });
            }}
          >
            <Trash2 />
            <span class="sr-only">{labels.remove}</span>
          </Button>
        {/if}
      </article>
    {:else}
      <p class="col-span-full py-8 text-center text-sm text-muted-foreground">{labels.empty}</p>
    {/each}
  </div>

  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
    <Button variant="ghost" size="sm" onclick={() => dispatch("reset")}>
      <RotateCcw data-icon="inline-start" />
      {labels.reset}
    </Button>
    <Button disabled={selectedId === savedId} onclick={() => dispatch("apply", { id: selectedId })}>
      <Check data-icon="inline-start" />
      {selectedId === savedId ? labels.applied : labels.apply}
    </Button>
  </div>
</section>
