<script lang="ts">
  import { onDestroy } from "svelte";
  import { Layers3, X } from "lucide-svelte";
  import { loadFabPosition, saveFabPosition, type FabPosition } from "./fab-preferences";

  export let label: (key: string, fallback: string) => string;
  export let open = false;
  export let badge = 0;
  export let toggle: () => void;
  export let pin: () => void;

  let fabEl: HTMLButtonElement | undefined;
  let position: FabPosition | null = loadFabPosition();
  let dragging = false;
  let suppressClick = false;
  let startX = 0;
  let startY = 0;
  let startRight = 0;
  let startBottom = 0;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;

  onDestroy(() => clearTimeout(pressTimer));

  function clamp(value: FabPosition): FabPosition {
    const parent = fabEl?.offsetParent as HTMLElement | null;
    if (!parent) return value;
    const width = fabEl?.offsetWidth ?? 0;
    const height = fabEl?.offsetHeight ?? 0;
    const maxRight = Math.max(8, parent.clientWidth - width - 8);
    const maxBottom = Math.max(8, parent.clientHeight - height - 8);
    return {
      right: Math.min(Math.max(value.right, 8), maxRight),
      bottom: Math.min(Math.max(value.bottom, 8), maxBottom),
    };
  }

  // Re-clamp whenever the element (and therefore its container) becomes measurable,
  // e.g. a saved position from a taller screen after rotation.
  $: if (fabEl && position) {
    const next = clamp(position);
    if (next.right !== position.right || next.bottom !== position.bottom) position = next;
  }

  function currentOffset(): FabPosition {
    const rect = fabEl!.getBoundingClientRect();
    const parentRect = (fabEl!.offsetParent as HTMLElement).getBoundingClientRect();
    return position ?? {
      right: parentRect.right - rect.right,
      bottom: parentRect.bottom - rect.bottom,
    };
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!fabEl?.offsetParent) return;
    const offset = currentOffset();
    dragging = true;
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    startRight = offset.right;
    startBottom = offset.bottom;
    try {
      fabEl.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or already-released pointers cannot be captured */
    }
    // Long press pins the bubble back into the title bar.
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (!dragging) return;
      dragging = false;
      suppressClick = true;
      pin();
    }, 420);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!suppressClick && Math.hypot(dx, dy) < 6) return;
    clearTimeout(pressTimer);
    suppressClick = true;
    position = clamp({ right: startRight - dx, bottom: startBottom - dy });
  }

  function onPointerEnd(event: PointerEvent): void {
    clearTimeout(pressTimer);
    if (!dragging) return;
    dragging = false;
    try {
      fabEl?.releasePointerCapture(event.pointerId);
    } catch {
      /* capture may already be gone on cancel */
    }
    if (suppressClick && position) saveFabPosition(position);
  }

  function onClick(): void {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    toggle();
  }

  function onResize(): void {
    if (position) position = clamp(position);
  }
</script>

<svelte:window onresize={onResize} />

<button
  type="button"
  class="workspace-fab"
  class:open
  class:dragging
  aria-expanded={open}
  aria-label={label("fabLabel", "Document & unfinished")}
  title={`${label("fabLabel", "Document & unfinished")} · ${label("fabLongPressPin", "Long-press to pin, drag to move")}`}
  style:right={position ? `${position.right}px` : undefined}
  style:bottom={position ? `${position.bottom}px` : undefined}
  bind:this={fabEl}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerEnd}
  onpointercancel={onPointerEnd}
  onclick={onClick}
>
  {#if open}
    <X size={19} aria-hidden="true" />
  {:else}
    <Layers3 size={19} aria-hidden="true" />
  {/if}
  {#if !open && badge > 0}<em>{badge}</em>{/if}
</button>

<style>
  /* Desktop keeps the document row and the unfinished list inline. */
  .workspace-fab { display: none; }

  
    :global(.question-bank:is([data-ui-width="narrow"], [data-ui-width="tiny"])) .workspace-fab {
      position: absolute;
      right: 14px;
      bottom: calc(120px + env(safe-area-inset-bottom, 0px));
      z-index: 7;
      width: 50px;
      height: 50px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: var(--b3-theme-primary);
      color: #fff;
      box-shadow: 0 8px 22px color-mix(in srgb, var(--b3-theme-primary) 34%, transparent);
      cursor: pointer;
      /* The bubble is drag-movable; touches on it must never scroll the page. */
      touch-action: none;
      user-select: none;
      -webkit-touch-callout: none;
    }


    :global(.question-bank:is([data-ui-width="narrow"], [data-ui-width="tiny"])) .workspace-fab.dragging { cursor: grabbing; }


    :global(.question-bank:is([data-ui-width="narrow"], [data-ui-width="tiny"])) .workspace-fab.open {
      background: var(--b3-theme-surface);
      color: var(--b3-theme-on-background);
      box-shadow: 0 8px 22px rgb(0 0 0 / 18%);
    }


    :global(.question-bank:is([data-ui-width="narrow"], [data-ui-width="tiny"])) .workspace-fab em {
      position: absolute;
      top: -2px;
      right: -2px;
      min-width: 19px;
      height: 19px;
      padding-inline: 5px;
      border-radius: 999px;
      display: inline-grid;
      place-items: center;
      background: var(--b3-theme-error);
      color: #fff;
      font-size: 10.5px;
      font-style: normal;
      font-variant-numeric: tabular-nums;
      box-shadow: 0 0 0 2px var(--b3-theme-background);
    }

  
</style>
