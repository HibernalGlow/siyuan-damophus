<script lang="ts">
  import { onDestroy } from "svelte";
  import { GripHorizontal, Pin, PinOff, X } from "lucide-svelte";
  import type { MobileAgentDropdownBarLabels } from "./mobile-dropdown-types";

  export let labels: MobileAgentDropdownBarLabels;
  export let initialPinned = true;
  export let initialHeightDvh = 80;
  export let onPinnedChange: (pinned: boolean) => void;
  export let onHeightChange: (heightDvh: number) => void;
  export let onClose: () => void;

  const MIN_HEIGHT_DVH = 40;
  const MAX_HEIGHT_DVH = 95;
  let pinned = initialPinned;
  let heightDvh = initialHeightDvh;
  let resizing = false;

  function clampHeight(value: number): number {
    return Math.min(MAX_HEIGHT_DVH, Math.max(MIN_HEIGHT_DVH, value));
  }

  function setHeight(value: number): void {
    heightDvh = clampHeight(value);
    onHeightChange(heightDvh);
  }

  function resizeFromPointer(event: PointerEvent): void {
    setHeight(((window.innerHeight - event.clientY) / window.innerHeight) * 100);
  }

  function stopResize(): void {
    if (!resizing) return;
    resizing = false;
    window.removeEventListener("pointermove", resizeFromPointer, true);
    window.removeEventListener("pointerup", stopResize, true);
    window.removeEventListener("pointercancel", stopResize, true);
  }

  function startResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    resizing = true;
    resizeFromPointer(event);
    window.addEventListener("pointermove", resizeFromPointer, true);
    window.addEventListener("pointerup", stopResize, true);
    window.addEventListener("pointercancel", stopResize, true);
  }

  function resizeFromKeyboard(event: KeyboardEvent): void {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHeight(heightDvh + 5);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHeight(heightDvh - 5);
    }
  }

  function togglePinned(): void {
    pinned = !pinned;
    onPinnedChange(pinned);
  }

  onDestroy(stopResize);
</script>

<div class="damophus-agent-dropdown-bar">
  <button
    type="button"
    class="damophus-agent-dropdown-resize"
    class:is-resizing={resizing}
    role="slider"
    aria-label={labels.resize}
    aria-orientation="vertical"
    aria-valuemin={MIN_HEIGHT_DVH}
    aria-valuemax={MAX_HEIGHT_DVH}
    aria-valuenow={Math.round(heightDvh)}
    title={labels.resize}
    onpointerdown={startResize}
    onkeydown={resizeFromKeyboard}
  >
    <GripHorizontal size={22} strokeWidth={2.2} aria-hidden="true" />
  </button>

  <div class="damophus-agent-dropdown-actions">
    <button
      type="button"
      class="damophus-agent-dropdown-action"
      class:is-active={pinned}
      aria-label={pinned ? labels.unpin : labels.pin}
      aria-pressed={pinned}
      title={pinned ? labels.unpin : labels.pin}
      onclick={togglePinned}
    >
      {#if pinned}
        <Pin size={17} aria-hidden="true" />
      {:else}
        <PinOff size={17} aria-hidden="true" />
      {/if}
    </button>
    <button
      type="button"
      class="damophus-agent-dropdown-action"
      aria-label={labels.close}
      title={labels.close}
      onclick={onClose}
    >
      <X size={18} aria-hidden="true" />
    </button>
  </div>
</div>
