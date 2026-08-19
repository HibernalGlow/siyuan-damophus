<script lang="ts">
  import { Check, ChevronDown, Download, ExternalLink, FileImage, Globe2, LocateFixed, RefreshCw, SlidersHorizontal, Trash2, XCircle } from "lucide-svelte";
  import {
    convertDocumentTreeNetworkAssets,
    previewDocumentTreeNetworkAssets,
    type NetworkAssetPreviewDocument,
  } from "./network-assets-local";

  let {
    documentId,
    labels,
    onDocumentOpen,
    onDocumentLocate,
    onDocumentDelete,
    blockTypes,
    defaultExcludedPattern,
  }: {
    documentId: string;
    labels: Record<string, string>;
    onDocumentOpen: (id: string) => void;
    onDocumentLocate: (id: string) => void;
    onDocumentDelete: (id: string) => Promise<void>;
    blockTypes: string[];
    defaultExcludedPattern: string;
  } = $props();
  let documents = $state<NetworkAssetPreviewDocument[]>([]);
  let loading = $state(true);
  let running = $state(false);
  let error = $state("");
  let completed = $state(false);
  let progress = $state("");
  let excludedPattern = $state("");
  let selectedUrls = $state<Set<string>>(new Set());
  let skippedUrls = $state<Set<string>>(new Set());
  let filtersOpen = $state(false);

  let resourceCount = $derived(documents.reduce((total, document) => total + document.urls.filter((url) => !isExcluded(url)).length, 0));
  let matchedDocuments = $derived(documents.filter((document) => document.urls.length > 0));

  function pattern(): RegExp | undefined {
    if (!excludedPattern.trim()) return undefined;
    try { return new RegExp(excludedPattern, "iu"); } catch { return undefined; }
  }

  function isExcluded(url: string): boolean {
    return skippedUrls.has(url) || Boolean(pattern()?.test(url));
  }

  function toggleSelected(url: string): void {
    const next = new Set(selectedUrls);
    if (next.has(url)) next.delete(url); else next.add(url);
    selectedUrls = next;
  }

  function skipSelected(): void {
    if (selectedUrls.size === 0) return;
    skippedUrls = new Set([...skippedUrls, ...selectedUrls]);
    selectedUrls = new Set();
  }

  function convertableUrls(): Set<string> {
    return new Set(documents.flatMap((document) => document.urls).filter((url) => !isExcluded(url)));
  }

  function resourceKind(url: string): "file" | "network" {
    return /^file:\/\//iu.test(url) ? "file" : "network";
  }

  $effect(() => {
    if (excludedPattern === "" && defaultExcludedPattern) excludedPattern = defaultExcludedPattern;
  });

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    completed = false;
    try {
      documents = await previewDocumentTreeNetworkAssets(documentId, new Set(blockTypes));
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading = false;
    }
  }

  async function convert(): Promise<void> {
    if (running || resourceCount === 0) return;
    running = true;
    error = "";
    completed = false;
    try {
      await convertDocumentTreeNetworkAssets(documentId, (current, total) => {
        progress = labels.progress.replace("{current}", String(current + 1)).replace("{total}", String(total));
      }, { skippedUrls, excludedPattern, blockTypes: new Set(blockTypes) });
      completed = true;
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      running = false;
      progress = "";
    }
  }

  void refresh();
</script>

<main class="damophus-network-assets-local">
  <header class="damophus-network-assets-local__header">
    <div>
      <h1>{labels.title}</h1>
      <p>{labels.description}</p>
    </div>
    <button class="b3-button b3-button--outline damophus-network-assets-local__icon-button" type="button" title={labels.refresh} aria-label={labels.refresh} disabled={loading || running} onclick={() => void refresh()}>
      <RefreshCw size={16} />
    </button>
  </header>

  {#if loading}
    <p class="damophus-network-assets-local__status">{labels.scanning}</p>
  {:else if error}
    <section class="damophus-network-assets-local__status damophus-network-assets-local__status--error"><XCircle size={16} /> {error}</section>
  {:else}
    <section class="damophus-network-assets-local__command-bar">
      <div class="damophus-network-assets-local__scope">
        <strong>{labels.summary.replace("{documents}", String(documents.length)).replace("{resources}", String(resourceCount))}</strong>
        <span>{labels.scope}</span>
      </div>
      <div class="damophus-network-assets-local__commands">
        {#if progress}<span class="damophus-network-assets-local__progress">{progress}</span>{/if}
        <button class="b3-button b3-button--outline" type="button" aria-expanded={filtersOpen} disabled={running} onclick={() => filtersOpen = !filtersOpen}>
          <SlidersHorizontal size={15} /> {labels.filters} <ChevronDown size={14} style={filtersOpen ? "transform: rotate(180deg)" : ""} />
        </button>
        <button class="b3-button b3-button--primary" type="button" disabled={running || convertableUrls().size === 0} onclick={() => void convert()}>
          <Download size={16} /> {running ? labels.running : labels.convert}
        </button>
      </div>
    </section>

    {#if filtersOpen}
      <section class="damophus-network-assets-local__filters">
        <label>
          <span>{labels.regex}</span>
          <input class="b3-text-field" bind:value={excludedPattern} placeholder={labels.regexPlaceholder} disabled={running} />
        </label>
      </section>
    {/if}

    {#if completed}
      <section class="damophus-network-assets-local__status damophus-network-assets-local__status--success"><Check size={16} /> {labels.completed}</section>
    {/if}

    {#if matchedDocuments.length === 0}
      <p class="damophus-network-assets-local__status">{labels.empty}</p>
    {:else}
      <section class="damophus-network-assets-local__documents" aria-label={labels.documents}>
        <div class="damophus-network-assets-local__list-heading">
          <span>{labels.documents}</span>
          <button class="b3-button b3-button--outline" type="button" disabled={running || selectedUrls.size === 0} onclick={skipSelected}>
            {labels.skipSelected}{selectedUrls.size > 0 ? ` (${selectedUrls.size})` : ""}
          </button>
        </div>
        {#each matchedDocuments as document (document.id)}
          <article>
            <header>
              <div class="damophus-network-assets-local__document-identity">
                <strong class="damophus-network-assets-local__document-title" title={document.hpath}>{document.hpath}</strong>
                <span>{labels.resourceCount.replace("{count}", String(document.urls.length))}</span>
              </div>
              <div class="damophus-network-assets-local__document-actions">
              <button class="b3-button b3-button--outline" type="button" title={labels.openDocument} aria-label={labels.openDocument} onclick={() => onDocumentOpen(document.id)}><ExternalLink size={14} /></button>
              <button class="b3-button b3-button--outline" type="button" title={labels.locateDocument} aria-label={labels.locateDocument} onclick={() => onDocumentLocate(document.id)}><LocateFixed size={14} /></button>
              <button class="b3-button b3-button--outline" type="button" title={labels.deleteDocument} aria-label={labels.deleteDocument} onclick={() => void onDocumentDelete(document.id)}><Trash2 size={14} /></button>
              </div>
            </header>
            <ul>
              {#each document.urls as url (url)}
                <li class:damophus-network-assets-local__skipped={isExcluded(url)} title={url}>
                  <label><input type="checkbox" checked={selectedUrls.has(url)} onchange={() => toggleSelected(url)} disabled={running || isExcluded(url)} />
                    {#if resourceKind(url) === "file"}<FileImage size={15} />{:else}<Globe2 size={15} />{/if}
                    <span>{url}</span>
                  </label>
                </li>
              {/each}
            </ul>
          </article>
        {/each}
      </section>
    {/if}

  {/if}
</main>

<style>
  .damophus-network-assets-local { box-sizing: border-box; display: flex; min-height: 100%; flex-direction: column; gap: 14px; padding: 20px; color: var(--b3-theme-on-surface); }
  .damophus-network-assets-local__header, .damophus-network-assets-local__header > div, .damophus-network-assets-local__command-bar, .damophus-network-assets-local__commands, .damophus-network-assets-local__scope, .damophus-network-assets-local__documents article header, .damophus-network-assets-local__document-identity, .damophus-network-assets-local__list-heading { display: flex; align-items: center; gap: 10px; }
  .damophus-network-assets-local__header { justify-content: space-between; }
  h1 { margin: 0; font-size: 17px; font-weight: 650; line-height: 24px; }
  p { margin: 4px 0 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 20px; }
  .damophus-network-assets-local__icon-button { width: 34px; min-width: 34px; padding: 0; }
  .damophus-network-assets-local__command-bar { justify-content: space-between; border: 1px solid var(--b3-border-color); padding: 10px 12px; background: color-mix(in srgb, var(--b3-theme-primary) 4%, transparent); }
  .damophus-network-assets-local__scope { min-width: 0; }
  .damophus-network-assets-local__scope strong { font-size: 14px; font-weight: 600; }
  .damophus-network-assets-local__scope span, .damophus-network-assets-local__documents span { color: var(--b3-theme-on-surface-light); font-size: 12px; }
  .damophus-network-assets-local__progress { color: var(--b3-theme-on-surface-light); font-size: 12px; }
  .damophus-network-assets-local__filters { border-left: 2px solid var(--b3-theme-primary); padding: 0 0 0 10px; }
  .damophus-network-assets-local__filters label { display: grid; grid-template-columns: 112px minmax(0, 1fr); align-items: center; gap: 10px; }
  .damophus-network-assets-local__filters label span { color: var(--b3-theme-on-surface-light); font-size: 12px; }
  .damophus-network-assets-local__documents { display: flex; flex-direction: column; gap: 8px; }
  .damophus-network-assets-local__list-heading { justify-content: space-between; min-height: 32px; color: var(--b3-theme-on-surface-light); font-size: 12px; }
  .damophus-network-assets-local__documents article { border: 1px solid var(--b3-border-color); padding: 10px 12px; }
  .damophus-network-assets-local__documents article header { justify-content: space-between; }
  .damophus-network-assets-local__document-identity { min-width: 0; }
  .damophus-network-assets-local__document-actions { flex: 0 0 auto; }
  .damophus-network-assets-local__document-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  ul { margin: 8px 0 0; padding: 0; list-style: none; color: var(--b3-theme-on-surface-light); font-size: 12px; }
  li { overflow: hidden; border-top: 1px solid color-mix(in srgb, var(--b3-border-color) 72%, transparent); }
  li label { display: flex; align-items: center; min-height: 32px; gap: 7px; overflow: hidden; }
  li label span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .damophus-network-assets-local__skipped { opacity: 0.5; text-decoration: line-through; }
  .damophus-network-assets-local__status { display: flex; align-items: center; gap: 8px; }
  .damophus-network-assets-local__status--error { color: var(--b3-theme-error); }
  .damophus-network-assets-local__status--success { color: var(--b3-theme-success); }
  @media (max-width: 600px) {
    .damophus-network-assets-local { padding: 14px; }
    .damophus-network-assets-local__header, .damophus-network-assets-local__command-bar { align-items: flex-start; }
    .damophus-network-assets-local__command-bar { flex-direction: column; }
    .damophus-network-assets-local__commands { width: 100%; justify-content: space-between; }
    .damophus-network-assets-local__filters label { grid-template-columns: 1fr; gap: 5px; }
  }
</style>
