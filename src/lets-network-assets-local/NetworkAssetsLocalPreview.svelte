<script lang="ts">
  import { Check, Download, RefreshCw, XCircle } from "lucide-svelte";
  import {
    convertDocumentTreeNetworkAssets,
    previewDocumentTreeNetworkAssets,
    type NetworkAssetPreviewDocument,
  } from "./network-assets-local";

  let { documentId, labels }: { documentId: string; labels: Record<string, string> } = $props();
  let documents = $state<NetworkAssetPreviewDocument[]>([]);
  let loading = $state(true);
  let running = $state(false);
  let error = $state("");
  let completed = $state(false);
  let progress = $state("");

  let resourceCount = $derived(documents.reduce((total, document) => total + document.urls.length, 0));
  let matchedDocuments = $derived(documents.filter((document) => document.urls.length > 0));

  async function refresh(): Promise<void> {
    loading = true;
    error = "";
    completed = false;
    try {
      documents = await previewDocumentTreeNetworkAssets(documentId);
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
      });
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
    <button class="b3-button b3-button--outline" type="button" title={labels.refresh} aria-label={labels.refresh} disabled={loading || running} onclick={() => void refresh()}>
      <RefreshCw size={16} />
    </button>
  </header>

  {#if loading}
    <p class="damophus-network-assets-local__status">{labels.scanning}</p>
  {:else if error}
    <section class="damophus-network-assets-local__status damophus-network-assets-local__status--error"><XCircle size={16} /> {error}</section>
  {:else}
    <section class="damophus-network-assets-local__summary">
      <strong>{labels.summary.replace("{documents}", String(documents.length)).replace("{resources}", String(resourceCount))}</strong>
      <span>{labels.scope}</span>
    </section>

    {#if completed}
      <section class="damophus-network-assets-local__status damophus-network-assets-local__status--success"><Check size={16} /> {labels.completed}</section>
    {/if}

    {#if matchedDocuments.length === 0}
      <p class="damophus-network-assets-local__status">{labels.empty}</p>
    {:else}
      <section class="damophus-network-assets-local__documents" aria-label={labels.documents}>
        {#each matchedDocuments as document (document.id)}
          <article>
            <div>
              <strong>{document.hpath}</strong>
              <span>{labels.resourceCount.replace("{count}", String(document.urls.length))}</span>
            </div>
            <ul>
              {#each document.urls as url (url)}
                <li title={url}>{url}</li>
              {/each}
            </ul>
          </article>
        {/each}
      </section>
    {/if}

    <footer>
      {#if progress}<span>{progress}</span>{/if}
      <button class="b3-button b3-button--primary" type="button" disabled={running || resourceCount === 0} onclick={() => void convert()}>
        <Download size={16} /> {running ? labels.running : labels.convert}
      </button>
    </footer>
  {/if}
</main>

<style>
  .damophus-network-assets-local { box-sizing: border-box; display: flex; min-height: 100%; flex-direction: column; gap: 16px; padding: 20px; color: var(--b3-theme-on-surface); }
  .damophus-network-assets-local__header, .damophus-network-assets-local__header > div, .damophus-network-assets-local__summary, .damophus-network-assets-local__documents article > div, .damophus-network-assets-local footer { display: flex; align-items: center; gap: 12px; }
  .damophus-network-assets-local__header { justify-content: space-between; }
  h1 { margin: 0; font-size: 18px; line-height: 28px; }
  p { margin: 4px 0 0; color: var(--b3-theme-on-surface-light); font-size: 13px; line-height: 20px; }
  .damophus-network-assets-local__summary, .damophus-network-assets-local__status { box-sizing: border-box; border: 1px solid var(--b3-border-color); padding: 12px; }
  .damophus-network-assets-local__summary { justify-content: space-between; }
  .damophus-network-assets-local__summary span, .damophus-network-assets-local__documents span, footer span { color: var(--b3-theme-on-surface-light); font-size: 12px; }
  .damophus-network-assets-local__documents { display: flex; flex-direction: column; gap: 8px; }
  .damophus-network-assets-local__documents article { border: 1px solid var(--b3-border-color); padding: 12px; }
  .damophus-network-assets-local__documents article > div { justify-content: space-between; }
  ul { margin: 8px 0 0; padding-left: 20px; color: var(--b3-theme-on-surface-light); font-size: 12px; line-height: 20px; }
  li { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .damophus-network-assets-local__status { display: flex; align-items: center; gap: 8px; }
  .damophus-network-assets-local__status--error { color: var(--b3-theme-error); }
  .damophus-network-assets-local__status--success { color: var(--b3-theme-success); }
  footer { justify-content: space-between; margin-top: auto; }
  @media (max-width: 600px) { .damophus-network-assets-local { padding: 14px; } .damophus-network-assets-local__header { align-items: flex-start; } }
</style>
