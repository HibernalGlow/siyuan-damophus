<script module lang="ts">
  export interface IconPickerLabels {
    search: string;
    empty: string;
  }

  export function collectSiYuanIconIds(): string[] {
    const ids = new Set<string>();
    for (const symbol of document.querySelectorAll("symbol[id]")) {
      if (/^icon/i.test(symbol.id)) ids.add(symbol.id);
    }
    return [...ids].sort();
  }
</script>

<script lang="ts">
  import { Search } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { ScrollArea } from "@/components/ui/scroll-area";

  interface Props {
    labels: IconPickerLabels;
    selected?: string;
    onSelect?: (iconId: string) => void;
  }

  let { labels, selected = "", onSelect }: Props = $props();

  let query = $state("");
  const iconIds = $state(collectSiYuanIconIds());

  const matches = $derived(
    iconIds.filter((iconId) => iconId.toLowerCase().includes(query.trim().toLowerCase())),
  );
</script>

<div class="flex flex-col gap-3">
  <div class="relative">
    <Search
      class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      aria-hidden="true"
    />
    <Input class="pl-8" type="search" autocomplete="off" placeholder={labels.search} bind:value={query} />
  </div>

  {#if matches.length === 0}
    <p class="py-10 text-center text-sm text-muted-foreground">{labels.empty}</p>
  {:else}
    <ScrollArea class="h-[min(52vh,420px)] rounded-md border">
      <div class="grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-1.5 p-2" data-slot="icon-picker-grid">
        {#each matches as iconId (iconId)}
          <Button
            type="button"
            variant="ghost"
            class="h-auto flex-col gap-1 px-1 py-2 {iconId === selected
              ? "bg-primary/10 text-foreground ring-1 ring-primary"
              : "text-muted-foreground"}"
            aria-pressed={iconId === selected}
            title={iconId}
            onclick={() => onSelect?.(iconId)}
          >
            <svg class="size-5" aria-hidden="true"><use href="#{iconId}" xlink:href="#{iconId}"></use></svg>
            <span class="w-full truncate text-center font-normal text-[10px] leading-none">{iconId.replace(/^icon/i, "")}</span>
          </Button>
        {/each}
      </div>
    </ScrollArea>
  {/if}
</div>
