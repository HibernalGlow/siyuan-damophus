<script lang="ts">
  import { Star, Trash2, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Textarea } from "@/components/ui/textarea";
  import { Label } from "@/components/ui/label";
  import type { QuestionBookmark } from "@/question-bank/core/types";
  import type { Label as LabelFn } from "./question-bank-display";

  export let open = false;
  export let bookmark: QuestionBookmark | undefined = undefined;
  export let label: LabelFn;
  export let onSave: (tags: string[], note: string) => void;
  export let onRemove: () => void;
  export let onClose: () => void;

  const PRESET_TAGS = [
    { key: "classic", icon: "⭐️", defaultLabel: "经典好题" },
    { key: "trap", icon: "⚠️", defaultLabel: "易混陷阱" },
    { key: "hard", icon: "🔥", defaultLabel: "重难点" },
    { key: "cramming", icon: "📌", defaultLabel: "考前必刷" },
  ] as const;

  let selectedTags: string[] = [];
  let noteText = "";

  $: if (open) {
    selectedTags = bookmark?.tags ? [...bookmark.tags] : [];
    noteText = bookmark?.note ?? "";
  }

  function toggleTag(key: string): void {
    if (selectedTags.includes(key)) {
      selectedTags = selectedTags.filter((t) => t !== key);
    } else {
      selectedTags = [...selectedTags, key];
    }
  }

  function handleSave(): void {
    onSave(selectedTags, noteText.trim());
    onClose();
  }

  function handleRemove(): void {
    onRemove();
    onClose();
  }
</script>

{#if open}
  <div class="bookmark-modal-scrim" onclick={onClose} aria-hidden="true"></div>
  <div class="bookmark-modal" role="dialog" aria-labelledby="bookmark-modal-title" aria-modal="true">
    <header class="bookmark-modal-header">
      <div class="bookmark-modal-title" id="bookmark-modal-title">
        <Star size={18} class="fill-amber-400 text-amber-500" aria-hidden="true" />
        <strong>{label("bookmarkModalTitle", "题目收藏与批注")}</strong>
      </div>
      <Button variant="ghost" size="icon" class="h-7 w-7" onclick={onClose} aria-label={label("close", "Close")}>
        <X size={15} aria-hidden="true" />
      </Button>
    </header>

    <div class="bookmark-modal-body">
      <div class="tag-section">
        <Label class="text-xs font-semibold text-muted-foreground">{label("bookmarkTags", "收藏标签")}</Label>
        <div class="tag-list">
          {#each PRESET_TAGS as tag}
            <button
              type="button"
              class="tag-btn"
              class:tag-btn--active={selectedTags.includes(tag.key)}
              onclick={() => toggleTag(tag.key)}
            >
              <span>{tag.icon}</span>
              <span>{label(`tag_${tag.key}`, tag.defaultLabel)}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="note-section">
        <Label for="bookmark-note-input" class="text-xs font-semibold text-muted-foreground">{label("bookmarkNote", "私人做题批注")}</Label>
        <Textarea
          id="bookmark-note-input"
          bind:value={noteText}
          placeholder={label("bookmarkNotePlaceholder", "记录这道题的考点细节、解题陷阱或个人备忘...")}
          rows={4}
          class="resize-none text-sm"
        />
      </div>
    </div>

    <footer class="bookmark-modal-footer">
      <div>
        {#if bookmark}
          <Button variant="destructive" size="sm" class="gap-1.5" onclick={handleRemove}>
            <Trash2 size={14} aria-hidden="true" />
            <span>{label("unbookmark", "取消收藏")}</span>
          </Button>
        {/if}
      </div>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" onclick={onClose}>{label("cancel", "取消")}</Button>
        <Button size="sm" onclick={handleSave}>{label("save", "保存")}</Button>
      </div>
    </footer>
  </div>
{/if}

<style>
  .bookmark-modal-scrim {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(2px);
  }

  .bookmark-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 440px);
    z-index: 9999;
    background: var(--b3-theme-background);
    border: 1px solid var(--b3-border-color);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .bookmark-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .bookmark-modal-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }

  .bookmark-modal-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .tag-section, .note-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 12px;
    border: 1px solid var(--b3-border-color);
    background: var(--b3-theme-surface);
    color: var(--b3-theme-on-surface);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tag-btn:hover {
    background: color-mix(in srgb, var(--b3-theme-primary) 12%, var(--b3-theme-surface));
    border-color: var(--b3-theme-primary);
  }

  .tag-btn--active {
    background: color-mix(in srgb, var(--b3-theme-primary) 20%, var(--b3-theme-surface));
    border-color: var(--b3-theme-primary);
    color: var(--b3-theme-primary);
    font-weight: 600;
  }

  .bookmark-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-top: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 60%, transparent);
  }
</style>
