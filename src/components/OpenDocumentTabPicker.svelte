<script lang="ts">
  import { onMount } from "svelte";
  import { FileText, LoaderCircle } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import DocumentPathHighlightEditor from "@/components/DocumentPathHighlightEditor.svelte";
  import type { OpenDocumentTab, OpenDocumentTabLoader } from "@/libs/open-document-tabs";
  import { openDocumentTabParentPath, openDocumentTabTitle } from "@/libs/open-document-tabs";
  import { DEFAULT_DOCUMENT_PATH_HIGHLIGHTS, openDocumentTabMatchesHighlight } from "@/libs/document-path-highlights";

  export let loadTabs: OpenDocumentTabLoader;
  export let selectedDocumentId = "";
  export let onSelect: (documentId: string) => void;
  export let label: (key: string, fallback: string) => string;
  export let highlightPatterns: string[] = [...DEFAULT_DOCUMENT_PATH_HIGHLIGHTS];
  export let onHighlightPatternsChange: (next: string[]) => void = () => {};

  let tabs: OpenDocumentTab[] = [];
  let loading = false;
  let requestVersion = 0;

  async function refresh(): Promise<void> {
    const version = ++requestVersion;
    loading = true;
    try {
      const nextTabs = await loadTabs();
      if (version === requestVersion) tabs = nextTabs;
    } catch {
      if (version === requestVersion) tabs = [];
    } finally {
      if (version === requestVersion) loading = false;
    }
  }

  onMount(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearInterval(timer);
      requestVersion += 1;
    };
  });
</script>

{#if loading && tabs.length === 0}
  <div class="open-document-tab-picker open-document-tab-picker--loading" aria-live="polite">
    <LoaderCircle class="open-document-tab-picker__spinner" size={14} aria-hidden="true" />
    <span>{label("loadingOpenDocumentTabs", "正在读取已打开文档")}</span>
  </div>
{:else if tabs.length > 0}
  <div class="open-document-tab-picker" role="group" aria-label={label("openDocumentTabs", "已打开文档") }>
    <span class="open-document-tab-picker__heading">{label("openDocumentTabs", "已打开文档")}</span>
    <div class="open-document-tab-picker__list">
      {#each tabs as tab (tab.documentId)}
        <Button
          variant={tab.documentId === selectedDocumentId ? "secondary" : "outline"}
          size="sm"
          class={`open-document-tab-badge ${openDocumentTabMatchesHighlight(tab, highlightPatterns) ? "open-document-tab-badge--highlighted" : ""}`}
          aria-pressed={tab.documentId === selectedDocumentId}
          aria-label={`${openDocumentTabTitle(tab)}${openDocumentTabParentPath(tab) ? `，${openDocumentTabParentPath(tab)}` : ""}`}
          title={tab.path?.trim() || openDocumentTabTitle(tab)}
          onclick={() => onSelect(tab.documentId)}
        >
          <FileText size={13} aria-hidden="true" />
          <span class="open-document-tab-badge__copy">
            <strong>{openDocumentTabTitle(tab)}</strong>
            {#if openDocumentTabParentPath(tab)}<small>{openDocumentTabParentPath(tab)}</small>{/if}
          </span>
        </Button>
      {/each}
    </div>
    <DocumentPathHighlightEditor
      highlights={highlightPatterns}
      title={label("documentPathHighlights", "路径高亮")}
      description={label("documentPathHighlightsDescription", "匹配文档可读路径的项目会高亮显示")}
      placeholder={label("documentPathHighlightsPlaceholder", "输入关键词后按回车")}
      onChange={onHighlightPatternsChange}
    />
  </div>
{/if}

<style>
  .open-document-tab-picker {
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 7px 0 1px;
  }
  .open-document-tab-picker__heading {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .open-document-tab-picker__list {
    display: flex;
    flex-wrap: wrap;
    align-items: stretch;
    gap: 6px;
    min-width: 0;
  }
  .open-document-tab-picker--loading {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }
  :global(.open-document-tab-picker__spinner) { animation: open-document-tab-picker-spin 1s linear infinite; }
  :global(.open-document-tab-badge) {
    width: fit-content;
    max-width: min(100%, 360px);
    min-width: 0;
    min-height: 38px;
    height: auto;
    justify-content: flex-start;
    border-radius: 8px;
    gap: 6px;
    padding: 6px 10px;
    text-align: left;
  }
  :global(.open-document-tab-badge--highlighted) {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 72%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 15%, var(--b3-theme-background));
    box-shadow: inset 3px 0 0 var(--b3-theme-primary);
  }
  .open-document-tab-badge__copy {
    display: grid;
    min-width: 0;
    gap: 1px;
    text-align: left;
  }
  .open-document-tab-badge__copy strong {
    max-width: 280px;
    overflow: hidden;
    font-size: 12px;
    font-weight: 650;
    line-height: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .open-document-tab-badge__copy small {
    min-width: 0;
    max-width: 280px;
    overflow: hidden;
    color: var(--b3-theme-on-surface);
    font-size: 10px;
    line-height: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @keyframes open-document-tab-picker-spin { to { transform: rotate(360deg); } }
  @media (max-width: 560px) {
    :global(.open-document-tab-badge) { max-width: 100%; }
    .open-document-tab-badge__copy strong,
    .open-document-tab-badge__copy small { max-width: calc(100vw - 74px); }
  }
</style>
