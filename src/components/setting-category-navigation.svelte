<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { Dialog } from "bits-ui";
  import { Check, ChevronDown, X } from "lucide-svelte";
  import { Button } from "@/components/ui/button";

  export let groups: string[] = [];
  export let focusGroup = "";
  export let getGroupLabel: (group: string) => string = (group) => group;
  export let categoryLabel = "Setting categories";
  export let categoryDescription = "Choose which settings to display.";
  export let preferencesLabel = "Preferences";
  export let closeLabel = "Close";

  const dispatch = createEventDispatcher<{ select: string }>();
  let open = false;

  function selectGroup(group: string) {
    dispatch("select", group);
    open = false;
  }
</script>

<nav
  class="w-48 shrink-0 overflow-y-auto border-r border-border bg-muted/30 p-3 max-[768px]:hidden"
  aria-label={categoryLabel}
>
  <div class="mb-3 border-b border-border px-2 pb-3">
    <strong class="block text-sm font-semibold">Damophus</strong>
    <span class="text-xs text-muted-foreground">{preferencesLabel}</span>
  </div>
  <ul class="b3-list b3-list--background m-0 list-none p-0">
    {#each groups as group}
      <li>
        <button
          type="button"
          class="b3-list-item my-1 min-h-11 w-full touch-manipulation"
          class:b3-list-item--focus={group === focusGroup}
          aria-current={group === focusGroup ? "page" : undefined}
          onclick={() => selectGroup(group)}
        >
          <span class="b3-list-item__text min-w-0 truncate">{getGroupLabel(group)}</span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

<Dialog.Root bind:open>
  <Button
    class="mx-3 mt-3 mb-2 hidden min-h-11 w-auto touch-manipulation justify-between rounded-lg max-[768px]:flex"
    variant="outline"
    aria-label={categoryLabel}
    onclick={() => (open = true)}
  >
    <span class="min-w-0 truncate">{getGroupLabel(focusGroup)}</span>
    <ChevronDown data-icon="inline-end" />
  </Button>

  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[9999] bg-black/45" />
    <Dialog.Content class="damophus-theme-root damophus-question-bank-theme fixed inset-x-0 bottom-0 z-[9999] flex max-h-[min(72dvh,34rem)] flex-col overflow-hidden rounded-t-xl border-t border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-lg">
      <div class="mx-auto mt-3 h-1 w-20 rounded-full bg-muted" aria-hidden="true"></div>
      <div class="flex items-start justify-between border-b border-border px-5 pb-3 pt-3">
        <div>
          <Dialog.Title class="text-base font-medium text-foreground">{categoryLabel}</Dialog.Title>
          <Dialog.Description class="sr-only">{categoryDescription}</Dialog.Description>
        </div>
        <Dialog.Close class="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={closeLabel} title={closeLabel}>
          <X />
        </Dialog.Close>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-2">
        <nav class="flex flex-col gap-1" aria-label={categoryLabel}>
          {#each groups as group}
            <button
              type="button"
              class="flex min-h-11 w-full touch-manipulation items-center justify-between rounded-md px-3 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent"
              class:bg-accent={group === focusGroup}
              class:text-accent-foreground={group === focusGroup}
              aria-current={group === focusGroup ? "page" : undefined}
              onclick={() => selectGroup(group)}
            >
              <span class="min-w-0 truncate">{getGroupLabel(group)}</span>
              {#if group === focusGroup}
                <Check data-icon="inline-end" />
              {/if}
            </button>
          {/each}
        </nav>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
