<!--
  Scope picker mirroring SiYuan's native outline panel: the scanned headings
  render with the same DOM contract as the dock outline (ul.b3-list--background >
  li.b3-list-item[data-subtype="h1..h6"] with b3-list-item__toggle/__graphic/
  __text and the #iconH1..#iconH6 block icons), so whatever colors the theme
  paints onto outline headings applies here unchanged. Data is the flat
  document-order forest (TopicNode[]); the chevron folds a subtree, tapping a
  row practices that heading. The panel expands inline below the trigger, which
  keeps it usable inside the mobile workspace where portals get clipped.
-->
<script lang="ts">
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

  $: topicById = new Map(topics.map((topic) => [topic.id, topic]));
  $: rootTopics = topics.filter((topic) => !topic.parentId || !topicById.has(topic.parentId));
  $: childrenByParent = (() => {
    const map = new Map<string, TopicNode[]>();
    for (const topic of topics) {
      if (!topic.parentId || !topicById.has(topic.parentId)) continue;
      const siblings = map.get(topic.parentId) ?? [];
      siblings.push(topic);
      map.set(topic.parentId, siblings);
    }
    return map;
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
    <svg class="scope-tree-trigger-icon" aria-hidden="true"><use xlink:href="#iconFile" /></svg>
    <span class="scope-tree-trigger-label">{currentTitle}</span>
    <svg class="scope-tree-caret" class:open aria-hidden="true"><use xlink:href="#iconRight" /></svg>
  </button>

  {#if open}
    <ul class="b3-list b3-list--background scope-tree-list" role="tree" aria-label={label("scope", "答题范围")}>
      <li
        class="b3-list-item scope-tree-row"
        class:selected={!topicId}
        role="treeitem"
        aria-selected={!topicId}
        tabindex="0"
        onkeydown={(event) => onRowKeydown(event, "")}
        onclick={() => choose("")}
      >
        <span class="scope-tree-toggle-ghost" aria-hidden="true"></span>
        <svg class="b3-list-item__graphic" aria-hidden="true"><use xlink:href="#iconFile" /></svg>
        <span class="b3-list-item__text">{label("entireDocument", "整个文档")}</span>
      </li>
      {#snippet topicRows(list: TopicNode[], depth: number)}
        {#each list as topic (topic.id)}
          {@const children = childrenByParent.get(topic.id) ?? []}
          {@const level = Math.min(6, Math.max(1, topic.level))}
          {@const folded = collapsed.has(topic.id)}
          <li
            class="b3-list-item scope-tree-row"
            class:selected={topic.id === topicId}
            role="treeitem"
            aria-selected={topic.id === topicId}
            aria-level={depth + 1}
            aria-expanded={children.length > 0 ? !folded : undefined}
            data-subtype={`h${level}`}
            data-node-id={topic.id}
            style:padding-left={`${depth * 16}px`}
            tabindex="0"
            onkeydown={(event) => onRowKeydown(event, topic.id)}
            onclick={() => choose(topic.id)}
          >
            {#if children.length > 0}
              <span
                class="b3-list-item__toggle b3-list-item__toggle--hl scope-tree-toggle"
                aria-hidden="true"
                onclick={(event) => { event.stopPropagation(); toggle(topic); }}
              >
                <svg class={folded ? "b3-list-item__arrow" : "b3-list-item__arrow b3-list-item__arrow--open"} aria-hidden="true"><use xlink:href="#iconRight" /></svg>
              </span>
            {:else}
              <span class="scope-tree-toggle-ghost" aria-hidden="true"></span>
            {/if}
            <svg class="b3-list-item__graphic" aria-hidden="true"><use xlink:href={`#iconH${level}`} /></svg>
            <span class="b3-list-item__text">{topic.title}</span>
          </li>
          {#if children.length > 0 && !folded}
            <ul class="scope-tree-branch" role="group">
              {@render topicRows(children, depth + 1)}
            </ul>
          {/if}
        {/each}
      {/snippet}
      {@render topicRows(rootTopics, 0)}
    </ul>
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

  .scope-tree-trigger-icon {
    width: 14px;
    height: 14px;
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

  .scope-tree-caret {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface);
    transition: transform 0.15s ease;
  }

  .scope-tree-caret.open { transform: rotate(90deg); }

  .scope-tree-list {
    position: relative;
    z-index: 2;
    max-height: clamp(220px, 42vh, 400px);
    margin: 6px 0 0;
    padding: 4px;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    background: var(--b3-theme-surface);
    box-shadow: 0 8px 22px rgb(0 0 0 / 14%);
  }

  .scope-tree-branch {
    margin: 0;
    padding: 0;
  }

  .scope-tree-row:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    outline-offset: -2px;
  }

  .scope-tree-row.selected {
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent);
    font-weight: 600;
  }

  /* Leaf rows keep a ghost toggle so graphics align with parent rows. */
  .scope-tree-toggle-ghost {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    visibility: hidden;
  }

  .scope-tree-row :global(.b3-list-item__text) {
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

    .scope-tree-list :global(.b3-list-item) {
      min-height: 34px;
    }
  }
</style>
