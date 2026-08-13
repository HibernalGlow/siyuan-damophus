<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { Pencil, Plus, RefreshCw, Save, Search, Trash2, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Switch } from "@/components/ui/switch";
  import { Textarea } from "@/components/ui/textarea";
  import { plugin } from "@/utils";
  import SnippetVisualPreview from "./SnippetVisualPreview.svelte";
  import { deleteSnippet, getAllSnippets, getSnippetGlobalSettings, saveSnippet, setSnippetEnabled, setSnippetTypeEnabled } from "./snippet-api";
  import { analyzeSnippet, type SiyuanSnippet, type SnippetPreviewScene } from "./snippet-audit";

  export let title: string;
  let snippets: SiyuanSnippet[] = [];
  let selectedId = "";
  let query = "";
  let type: "all" | "css" | "js" = "all";
  let enabled: "all" | "enabled" | "disabled" = "all";
  let loading = false;
  let failed = false;
  let mutationError = "";
  let savingIds = new Set<string>();
  let globalSettings = { enabledCSS: true, enabledJS: true };
  let savingGlobal = false;
  let editing = false;
  let creating = false;
  let savingEditor = false;
  let draft: SiyuanSnippet | null = null;
  let themeVariables: Record<string, string> = {};
  let themeObserver: MutationObserver | undefined;
  const t = (key: string, fallback: string) => plugin?.i18n?.[`lets-snippet-audit.${key}`] || fallback;

  $: filtered = snippets.filter((item) => {
    const matchesQuery = !query || `${item.name}\n${item.content}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (type === "all" || item.type === type) && (enabled === "all" || item.enabled === (enabled === "enabled"));
  });
  $: selected = snippets.find((item) => item.id === selectedId) ?? filtered[0];
  $: displayed = editing && draft ? draft : selected;
  $: analysis = displayed ? analyzeSnippet(displayed) : null;
  $: previewCss = displayed?.type === "css" && displayed.enabled && globalSettings.enabledCSS ? displayed.content : "";

  async function refresh() {
    loading = true;
    failed = false;
    try {
      snippets = await getAllSnippets();
      globalSettings = getSnippetGlobalSettings();
      if (!snippets.some((item) => item.id === selectedId)) selectedId = snippets[0]?.id ?? "";
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }
  onMount(() => void refresh());
  function readThemeVariables() {
    if (typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>(".damophus-theme-root") ?? document.documentElement;
    const computed = getComputedStyle(root);
    const names = Array.from(computed).filter((name) => name.startsWith("--b3-") || ["--background", "--foreground", "--border", "--muted", "--accent", "--accent-foreground"].includes(name));
    themeVariables = Object.fromEntries(names.map((name) => [name, computed.getPropertyValue(name).trim()]).filter(([, value]) => value));
  }
  onMount(() => {
    readThemeVariables();
    themeObserver = new MutationObserver(readThemeVariables);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme-mode", "style"] });
  });
  onDestroy(() => themeObserver?.disconnect());
  const sceneLabel = (scene: SnippetPreviewScene) => t(`scene.${scene}`, scene);

  async function toggleSnippet(item: SiyuanSnippet, checked: boolean) {
    mutationError = "";
    const previousSnippets = snippets;
    snippets = snippets.map((snippet) => snippet.id === item.id ? { ...snippet, enabled: checked } : snippet);
    savingIds = new Set(savingIds).add(item.id);
    try {
      snippets = await setSnippetEnabled(item.id, checked);
    } catch (error) {
      mutationError = error instanceof Error ? error.message : t("saveFailed", "Could not save the snippet state.");
      snippets = previousSnippets;
    } finally {
      const next = new Set(savingIds);
      next.delete(item.id);
      savingIds = next;
    }
  }

  async function toggleGlobal(snippetType: "css" | "js", checked: boolean) {
    mutationError = "";
    const previousSettings = globalSettings;
    globalSettings = {
      ...globalSettings,
      [snippetType === "css" ? "enabledCSS" : "enabledJS"]: checked,
    };
    savingGlobal = true;
    try {
      globalSettings = await setSnippetTypeEnabled(snippetType, checked);
    } catch (error) {
      mutationError = error instanceof Error ? error.message : t("saveFailed", "Could not save the snippet state.");
      globalSettings = previousSettings;
    } finally {
      savingGlobal = false;
    }
  }

  function startEdit(item: SiyuanSnippet) {
    selectedId = item.id;
    draft = structuredClone(item);
    creating = false;
    editing = true;
  }

  function startCreate() {
    const stamp = new Date().toISOString().replace(/\D/gu, "").slice(0, 14);
    draft = { id: `${stamp}-${crypto.randomUUID().slice(0, 7)}`, name: "", type: type === "js" ? "js" : "css", enabled: false, disabledInPublish: false, content: "" };
    creating = true;
    editing = true;
  }

  function cancelEdit() {
    draft = null;
    editing = false;
    creating = false;
  }

  async function persistDraft() {
    if (!draft || !draft.name.trim()) return;
    savingEditor = true;
    mutationError = "";
    try {
      const savedId = draft.id;
      snippets = await saveSnippet({ ...draft, name: draft.name.trim() }, creating);
      selectedId = savedId;
      cancelEdit();
    } catch (error) {
      mutationError = error instanceof Error ? error.message : t("saveFailed", "Could not save the snippet.");
    } finally {
      savingEditor = false;
    }
  }

  function confirmDelete(item: SiyuanSnippet) {
    selectedId = item.id;
    if (window.confirm(`${t("deleteConfirm", "Delete this snippet? This cannot be undone.")}\n\n${item.name}`)) {
      void removeSnippet(item.id);
    }
  }

  async function removeSnippet(id: string) {
    mutationError = "";
    savingEditor = true;
    try {
      snippets = await deleteSnippet(id);
      selectedId = snippets[0]?.id ?? "";
      cancelEdit();
    } catch (error) {
      mutationError = error instanceof Error ? error.message : t("deleteFailed", "Could not delete the snippet.");
    } finally {
      savingEditor = false;
    }
  }
</script>

<section class="space-y-4 min-w-0" aria-label={title}>
  <header class="flex items-start justify-between gap-3 border-b border-border pb-4">
    <div><div class="text-lg font-semibold" role="heading" aria-level="2">{title}</div><p class="mt-1 text-xs text-muted-foreground">{t("readOnly", "Read-only analysis. Snippets are never changed.")}</p></div>
    <div class="flex gap-2"><Button variant="outline" size="sm" onclick={startCreate}><Plus />{t("new", "New")}</Button><Button variant="outline" size="sm" onclick={() => void refresh()} disabled={loading}><RefreshCw class={loading ? "animate-spin" : ""} />{t("refresh", "Refresh")}</Button></div>
  </header>

  <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
    <label class="relative"><Search class="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" /><Input class="pl-8" bind:value={query} placeholder={t("search", "Search name or code")} /></label>
    <select class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={type} aria-label={t("type", "Type")}><option value="all">{t("allTypes", "CSS + JS")}</option><option value="css">CSS</option><option value="js">JS</option></select>
    <select class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={enabled} aria-label={t("status", "Status")}><option value="all">{t("allStatuses", "All statuses")}</option><option value="enabled">{t("enabled", "Enabled")}</option><option value="disabled">{t("disabled", "Disabled")}</option></select>
  </div>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border px-3 py-2 text-xs">
    <span class="text-muted-foreground">{t("globalSwitches", "Global snippet switches")}</span>
    <label class="inline-flex cursor-pointer items-center gap-2"><Switch size="sm" checked={globalSettings.enabledCSS} disabled={savingGlobal} aria-label={t("enableAllCss", "Enable all CSS snippets")} onCheckedChange={(checked) => void toggleGlobal("css", checked)} /><span>CSS</span></label>
    <label class="inline-flex cursor-pointer items-center gap-2"><Switch size="sm" checked={globalSettings.enabledJS} disabled={savingGlobal} aria-label={t("enableAllJs", "Enable all JS snippets")} onCheckedChange={(checked) => void toggleGlobal("js", checked)} /><span>JS</span></label>
  </div>
  {#if mutationError}<p class="m-0 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">{mutationError}</p>{/if}

  {#if failed}<p class="text-sm text-destructive">{t("loadFailed", "Could not read SiYuan snippets.")}</p>{:else if loading && snippets.length === 0}<p class="text-sm text-muted-foreground">{t("loading", "Loading snippets...")}</p>{:else}
    <div class="snippet-audit-grid min-h-0 overflow-hidden border-y border-border">
      <div class="snippet-list overflow-y-auto border-r border-border" aria-label={t("list", "Snippet list")}>
        {#each filtered as item (item.id)}
          <div class:active={selected?.id === item.id} class="snippet-row" role="button" tabindex="0" onclick={() => selectedId = item.id} onkeydown={(event) => { if (event.key === "Enter" || event.key === " ") selectedId = item.id; }}>
            <span class="min-w-0 flex-1 truncate text-left text-sm">{item.name || t("untitled", "Untitled")}</span>
            <span class="text-[10px] uppercase text-muted-foreground">{item.type}</span>
            <Button variant="ghost" size="icon-sm" title={t("edit", "Edit")} aria-label={`${t("edit", "Edit")}: ${item.name}`} onclick={(event) => { event.stopPropagation(); startEdit(item); }}><Pencil /></Button>
            <Button variant="ghost" size="icon-sm" class="text-destructive" title={t("delete", "Delete")} aria-label={`${t("delete", "Delete")}: ${item.name}`} onclick={(event) => { event.stopPropagation(); confirmDelete(item); }}><Trash2 /></Button>
            <Switch size="sm" checked={item.enabled} disabled={savingIds.has(item.id)} aria-label={`${item.name}: ${item.enabled ? t("enabled", "Enabled") : t("disabled", "Disabled")}`} onCheckedChange={(checked) => void toggleSnippet(item, checked)} onclick={(event) => event.stopPropagation()} />
          </div>
        {/each}
      </div>
      {#if displayed && analysis}
        <article class="min-w-0 overflow-y-auto p-4">
          {#if editing && draft}
            <div class="grid gap-3 border-b border-border pb-4">
              <div class="flex flex-wrap items-center gap-2"><Input class="min-w-48 flex-1" bind:value={draft.name} placeholder={t("name", "Snippet name")} /><select class="h-9 rounded-md border border-border bg-background px-2 text-sm" bind:value={draft.type}><option value="css">CSS</option><option value="js">JS</option></select><label class="inline-flex items-center gap-2 text-xs"><Switch size="sm" bind:checked={draft.enabled} />{t("enabled", "Enabled")}</label></div>
              <Textarea class="min-h-64 resize-y font-mono text-xs leading-5" bind:value={draft.content} placeholder={t("code", "Code")} />
              <div class="flex justify-end gap-2"><Button variant="ghost" size="sm" onclick={cancelEdit}><X />{t("cancel", "Cancel")}</Button><Button size="sm" onclick={() => void persistDraft()} disabled={savingEditor || !draft.name.trim()}><Save />{t("save", "Save")}</Button></div>
            </div>
          {:else}
            <div class="flex flex-wrap items-center gap-2"><h3 class="min-w-0 flex-1 text-base font-semibold">{displayed.name}</h3><span class="badge">{displayed.type.toUpperCase()}</span><span class="badge">{displayed.enabled ? t("enabled", "Enabled") : t("disabled", "Disabled")}</span><span class="badge risk-{analysis.risk}">{t(`risk.${analysis.risk}`, analysis.risk)}</span></div>
          {/if}
          {#if displayed.type === "css" && analysis.previewScenes.length > 0}
            <div class="-mx-4 mt-4">
              <SnippetVisualPreview
                css={previewCss}
                scenes={analysis.previewScenes}
                title={t("visualPreview", "Automatic visual preview")}
                description={t("visualPreviewDescription", "The original CSS is isolated inside each matching SiYuan scene and uses the current theme.")}
                {themeVariables}
                {sceneLabel}
              />
            </div>
          {:else if displayed.type === "css"}
            <p class="mt-4 rounded-md border border-border p-3 text-xs text-muted-foreground">{t("noVisualPreview", "No matching visual scene was recognized for this CSS yet.")}</p>
          {:else}
            <p class="mt-4 rounded-md border border-border p-3 text-xs text-muted-foreground">{t("jsNoPreview", "JavaScript is not executed in preview for safety.")}</p>
          {/if}
          <dl class="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt class="text-xs text-muted-foreground">{t("purpose", "Likely purpose")}</dt><dd class="mt-1">{t(`purpose.${analysis.purposeKey}`, analysis.purposeKey)}</dd></div><div><dt class="text-xs text-muted-foreground">{t("destination", "Recommended destination")}</dt><dd class="mt-1">{t(`destination.${analysis.destinationKey}`, analysis.destinationKey)}</dd></div></dl>
          <div class="mt-3"><div class="text-xs text-muted-foreground">{t("signals", "Review signals")}</div><div class="mt-1 flex flex-wrap gap-1">{#each analysis.reasonKeys as reason}<span class="badge">{t(`reason.${reason}`, reason)}</span>{/each}</div></div>
          {#if !editing}<details class="mt-4 rounded-md border border-border bg-muted/40" open><summary class="cursor-pointer px-3 py-2 text-xs font-medium">{t("sourceCode", "Source code")}</summary><pre class="max-h-[70vh] overflow-auto border-t border-border p-3 text-xs leading-5"><code>{displayed.content}</code></pre></details>{/if}
        </article>
      {:else}<p class="p-4 text-sm text-muted-foreground">{t("empty", "No matching snippets.")}</p>{/if}
    </div>
  {/if}
</section>

<style>
  .snippet-audit-grid { display: grid; grid-template-columns: minmax(180px, 32%) minmax(0, 1fr); height: min(68vh, 680px); }
  .snippet-row { display:flex; width:100%; min-height:42px; align-items:center; gap:8px; padding:7px 10px; border:0; border-bottom:1px solid var(--border); background:transparent; color:inherit; cursor:pointer; }
  .snippet-row:hover,.snippet-row.active { background:var(--accent); color:var(--accent-foreground); }
  .badge { display:inline-flex; align-items:center; min-height:20px; border-radius:4px; background:var(--muted); padding:2px 6px; font-size:11px; color:var(--muted-foreground); }
  .risk-high { color:var(--destructive); }.risk-medium { color:var(--b3-theme-warning, #9a6700); }
  pre,code { white-space:pre; font-family:var(--b3-font-family-code, monospace); }
  @media (max-width: 640px) { .snippet-audit-grid { grid-template-columns:1fr; height:auto; }.snippet-list { max-height:240px; border-right:0; border-bottom:1px solid var(--border); } article { max-height:none; } }
</style>
