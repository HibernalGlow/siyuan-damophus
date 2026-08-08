<script lang="ts">
  import { Checkbox as CheckboxPrimitive } from "bits-ui";
  import Check from "lucide-svelte/icons/check";
  import { cn, type WithoutChildrenOrChild } from "@/lib/utils.js";

  let { ref = $bindable(null), class: className, checked = $bindable(false), ...restProps }:
    WithoutChildrenOrChild<CheckboxPrimitive.RootProps> = $props();
</script>

<CheckboxPrimitive.Root
  bind:ref
  bind:checked
  data-slot="checkbox"
  class={cn("size-4 shrink-0 rounded-[4px] border border-input bg-transparent shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50", className)}
  {...restProps}
>
  <Check class="size-3.5" />
</CheckboxPrimitive.Root>
