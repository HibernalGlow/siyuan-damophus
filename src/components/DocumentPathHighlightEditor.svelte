<script lang="ts">
  import { Plus, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import {
    DEFAULT_DOCUMENT_PATH_HIGHLIGHTS,
    normalizeDocumentPathHighlights,
  } from "@/libs/document-path-highlights";

  export let highlights: string[] = [...DEFAULT_DOCUMENT_PATH_HIGHLIGHTS];
  export let title = "路径高亮";
  export let description = "匹配文档可读路径的项目会优先显示";
  export let placeholder = "输入关键词后按回车";
  export let onChange: (next: string[]) => void = () => {};

  let input = "";

  function update(next: string[]): void {
    highlights = normalizeDocumentPathHighlights(next);
    onChange(highlights);
  }

  function add(): void {
    const value = input.trim();
    if (!value) return;
    update([...highlights, value]);
    input = "";
  }

  function remove(value: string): void {
    update(highlights.filter((item) => item !== value));
  }
</script>

<div class="document-path-highlight-editor" data-testid="document-path-highlight-editor">
  <div class="document-path-highlight-editor__copy">
    <strong>{title}</strong>
    <small>{description}</small>
  </div>
  <div class="document-path-highlight-editor__controls">
    <div class="document-path-highlight-editor__chips" aria-label={title}>
      {#each highlights as highlight (highlight)}
        <span class="document-path-highlight-chip">
          <span>{highlight}</span>
          <Button variant="ghost" size="icon-sm" title={`移除 ${highlight}`} aria-label={`移除 ${highlight}`} onclick={() => remove(highlight)}>
            <X aria-hidden="true" />
          </Button>
        </span>
      {/each}
    </div>
    <form class="document-path-highlight-editor__form" onsubmit={(event) => { event.preventDefault(); add(); }}>
      <Input bind:value={input} placeholder={placeholder} aria-label={placeholder} />
      <Button type="submit" variant="outline" size="icon" title="添加路径关键词" aria-label="添加路径关键词" disabled={!input.trim()}>
        <Plus aria-hidden="true" />
      </Button>
    </form>
  </div>
</div>

<style>
  .document-path-highlight-editor { display: grid; gap: 8px; min-width: 0; padding: 7px 0 1px; }
  .document-path-highlight-editor__copy { display: grid; gap: 2px; }
  .document-path-highlight-editor__copy strong { color: var(--b3-theme-on-background); font-size: 11px; }
  .document-path-highlight-editor__copy small { color: var(--b3-theme-on-surface); font-size: 10px; }
  .document-path-highlight-editor__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
  .document-path-highlight-editor__chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
  .document-path-highlight-chip { display: inline-flex; min-height: 28px; align-items: center; gap: 2px; padding-left: 8px; border: 1px solid color-mix(in srgb, var(--b3-theme-primary) 36%, var(--b3-border-color)); border-radius: 999px; background: color-mix(in srgb, var(--b3-theme-primary) 12%, transparent); color: var(--b3-theme-primary); font-size: 11px; }
  .document-path-highlight-chip :global(button) { width: 23px; height: 23px; padding: 3px; }
  .document-path-highlight-chip :global(svg) { width: 13px; height: 13px; }
  .document-path-highlight-editor__form { display: flex; min-width: 190px; max-width: 280px; flex: 1 1 190px; gap: 5px; }
  .document-path-highlight-editor__form :global(input) { min-width: 0; height: 30px; font-size: 11px; }
  .document-path-highlight-editor__form :global(button) { flex: 0 0 30px; }
</style>
