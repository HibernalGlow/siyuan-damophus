<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { ArrowLeft } from "lucide-svelte";
  import { Button } from "@/components/ui/button";

  export let title: string;
  export let backLabel: string;

  const dispatch = createEventDispatcher<{ back: void }>();
</script>

<header
  class="sticky top-0 z-10 flex min-w-0 items-center gap-1 border-b border-border bg-background/95 px-2 py-2 backdrop-blur"
  data-testid="setting-mobile-titlebar"
>
  <Button
    variant="ghost"
    size="icon"
    class="size-10 shrink-0 touch-manipulation"
    aria-label={backLabel}
    title={backLabel}
    onclick={() => dispatch("back")}
  >
    <ArrowLeft class="size-4 shrink-0" aria-hidden="true" />
  </Button>
  <div class="min-w-0 truncate pr-2 text-base font-semibold" role="heading" aria-level="2">{title}</div>
</header>
