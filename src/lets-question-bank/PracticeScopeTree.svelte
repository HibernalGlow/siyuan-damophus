<!--
  Scope picker styled after SiYuan's native outline: the scanned headings render
  as a collapsible tree (chevron folds a subtree, tap a row to practice that
  heading) instead of a flat dropdown. Data is the flat document-order forest
  (TopicNode[]); collapsed ids hide their descendants during the walk. The
  panel expands inline below the trigger, which keeps it usable inside the
  mobile workspace where portals/floating layers get clipped.
-->
<script lang="ts">
  import { ChevronDown, ChevronRight, FileText } from "lucide-svelte";
  import type { TopicNode } from "@/question-bank/core/types";

  export let label: (key: string, fallback: string) => string;
  export let topics: TopicNode[] = [];
  export let topicId = "";
  export let onSelect: (id: string) => void;

  let open = false;
  let collapsed = new Set<string>();
  let host: HTMLElement;

  $: currentTitle = topicId
    ? (topics.find((topic) => topic.id === topicId)?.title ?? "")
    : label("entireDocument", "整个文档");

  // Document-order walk that skips the subtrees folded by the chevrons.
  $: visibleTopics = (() => {
    const rows: { topic: TopicNode; depth: number }[] = [];
    let hideBelow: number | null = null;
    for (const topic of topics) {
      if (hideBelow !== null) {
        if (topic.level > hideBelow) continue;
        hideBelow = null;
      }
      rows.push({ topic, depth: Math.max(0, topic.level - 1) });
      if (topic.childIds.length > 0 && collapsed.has(topic.id)) hideBelow = topic.level;
    }
    return rows;
  })();

  function toggle(topic: TopicNode): void {
    const next = new Set(collapsed);
    if (next.has(topic.id)) {
      next.delete(topic.id);
    } else {
      next.add(topic.id);
    }
    collapsed = next;
  }

  function choose(id: string): void {
    open = false;
    onSelect(id);
  }

  function onRowKeydown(event: KeyboardEvent, id: string): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(id);
    }
  }

  function onWindowPointerDown(event: PointerEvent): void {
    if (open && host && !host.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="scope-tree" bind:this={host}>
  <button
    type="button"
    class="scope-tree-trigger"
    data-testid="scope-tree-trigger"
    aria-expanded={open}
    aria-haspopup="tree"
    onclick={() => (open = !open)}
  >
    <FileText size={13} aria-hidden="true" />
    <span class="scope-tree-trigger-label">{currentTitle}</span>
    <ChevronDown size={14} aria-hidden="true" class={open ? "scope-tree-caret open" : "scope-tree-caret"} />
  </button>

  {#if open}
    <div class="scope-tree-panel" role="tree" aria-label={label("scope", "答题范围")}>
      <div
        class="scope-tree-row"
        class:selected={!topicId}
        role="treeitem"
        aria-selected={!topicId}
        tabindex="0"
        onkeydown={(event) => onRowKeydown(event, "")}
        onclick={() => choose("")}
      >
        <span class="scope-tree-toggle" aria-hidden="true"><FileText size={12} /></span>
        <span class="scope-tree-title">{label("entireDocument", "整个文档")}</span>
      </div>
      {#each visibleTopics as entry (entry.topic.id)}
        <div
          class="scope-tree-row"
          class:selected={entry.topic.id === topicId}
          role="treeitem"
          aria-selected={entry.topic.id === topicId}
          aria-level={entry.depth + 1}
          aria-expanded={entry.topic.childIds.length > 0 ? !collapsed.has(entry.topic.id) : undefined}
          style:padding-left={`${14 + entry.depth * 16}px`}
          tabindex="0"
          onkeydown={(event) => onRowKeydown(event, entry.topic.id)}
          onclick={() => choose(entry.topic.id)}
        >
          {#if entry.topic.childIds.length > 0}
            <span
              class="scope-tree-toggle"
              aria-hidden="true"
              onclick={(event) => { event.stopPropagation(); toggle(entry.topic); }}
            >
              <ChevronRight size={12} class={collapsed.has(entry.topic.id) ? "scope-tree-fold folded" : "scope-tree-fold"} />
            </span>
          {:else}
            <span class="scope-tree-toggle" aria-hidden="true"></span>
          {/if}
          <span class="scope-tree-title">{entry.topic.title}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .scope-tree {
    position: relative;
    min-width: 0;
  }

  .scope-tree-trigger {
    width: 100%;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-background);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
    transition: border-color 0.15s ease;
  }

  .scope-tree-trigger:hover {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 40%, var(--b3-border-color));
  }

  .scope-tree-trigger > :global(svg:first-child) {
    flex: 0 0 auto;
    color: var(--b3-theme-primary);
  }

  .scope-tree-trigger-label {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(svg.scope-tree-caret) {
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface);
    transition: transform 0.15s ease;
  }

  :global(svg.scope-tree-caret.open) { transform: rotate(180deg); }

  .scope-tree-panel {
    position: relative;
    z-index: 2;
    max-height: clamp(220px, 42vh, 400px);
    margin-top: 6px;
    padding: 4px;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-surface);
    box-shadow: 0 8px 22px rgb(0 0 0 / 14%);
    display: grid;
    gap: 1px;
    align-items: start;
  }

  .scope-tree-row {
    min-height: 30px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px 14px;
    border-radius: 7px;
    color: var(--b3-theme-on-background);
    font-size: 12.5px;
    cursor: pointer;
    user-select: none;
  }

  .scope-tree-row:hover { background: var(--b3-list-hover); }

  .scope-tree-row:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    outline-offset: -2px;
  }

  .scope-tree-row.selected {
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    font-weight: 600;
  }

  .scope-tree-toggle {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--b3-theme-on-surface);
  }

  .scope-tree-row.selected .scope-tree-toggle { color: inherit; }

  :global(svg.scope-tree-fold) { transition: transform 0.12s ease; }
  :global(svg.scope-tree-fold.folded) { transform: rotate(-90deg); }

  .scope-tree-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @container (max-width: 700px) {
    .scope-tree-trigger {
      min-height: 42px;
      border-radius: 10px;
      font-size: 13px;
    }

    .scope-tree-row {
      min-height: 34px;
      font-size: 13px;
    }
  }
</style>
