<script lang="ts">
  import type { FlashcardBlockRow, FlashcardRoot } from "@/flashcard/types";
  import type { DueCardsData } from "@/flashcard/siyuan-adapter";

  export let title: string;
  export let rows: FlashcardBlockRow[];
  export let roots: FlashcardRoot[];
  export let due: DueCardsData | undefined;
  export let filtered = false;
  export let onReview: () => void;
  export let onRegister: () => void | Promise<void>;

  const rootIds = new Set(roots.map((root) => root.blockId));
  const rootById = new Map(roots.map((root) => [root.blockId, root]));
  $: displayRows = filtered
    ? roots.map((root) => ({
        id: root.blockId,
        content: root.content,
        type: root.renderer,
      }))
    : rows;
</script>

<div class="flashcard-results" data-testid="flashcard-results">
  <header>
    <div>
      <h2>{title}</h2>
      <p>{filtered ? `${rows.length} 个 SQL 命中，${displayRows.length} 个去重后闪卡根块` : `${rows.length} 个 SQL 结果，${roots.length} 个闪卡根块`}{due ? `，${due.cards.length} 个到期卡` : ""}{#if due && due.candidateCount && due.registeredCount !== undefined && due.registeredCount < due.candidateCount}，{due.candidateCount - due.registeredCount} 个待制卡{/if}</p>
    </div>
    <div class="actions">
      {#if roots.length > 0}<button class="b3-button" on:click={onRegister}>一键制卡并登记</button>{/if}
      {#if filtered && roots.length > 0}<button class="b3-button" on:click={onReview}>复习过滤结果</button>{/if}
    </div>
  </header>
  <div class="result-list">
    {#each displayRows as row (row.id)}
      <div class:root={rootIds.has(row.id)} class="result-row">
        <code>{row.id}</code>
        <span>{row.content || row.type || "block"}</span>
        {#if rootIds.has(row.id)}
          {@const root = rootById.get(row.id)}
          <b>{root?.renderer ?? "unknown"} · {root?.kind ?? "unknown"}</b>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .flashcard-results { display: flex; flex-direction: column; gap: 12px; padding: 18px; max-height: 70vh; overflow: auto; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  h2, p { margin: 0; }
  p { margin-top: 5px; color: var(--b3-theme-on-surface-light); }
  .result-list { display: flex; flex-direction: column; border: 1px solid var(--b3-border-color); border-radius: 5px; }
  .result-row { display: grid; grid-template-columns: 180px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--b3-border-color); }
  .result-row:last-child { border-bottom: 0; }
  .result-row.root { background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent); }
  code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 700px) { header { flex-direction: column; } .result-row { grid-template-columns: 1fr; } }
</style>
