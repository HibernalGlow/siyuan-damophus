<script lang="ts">
  import { tick } from "svelte";
  import SearchIcon from "lucide-svelte/icons/search";
  import * as Combobox from "@/components/ui/combobox";
  import { groupCommandOptions, type CommandOption } from "./runtime";

  export interface CommandSelectLabels {
    search: string;
    empty: string;
  }

  interface Props {
    options: CommandOption[];
    value: string;
    labels: CommandSelectLabels;
    onValueChange?: (value: string) => void;
  }

  let { options, value, labels, onValueChange }: Props = $props();

  let searchInput = $state<HTMLInputElement | null>(null);
  let contentElement = $state<HTMLElement | null>(null);
  let open = $state(false);
  // bits-ui's root `inputValue` is one-way only, so the typed query is
  // captured through oninput while the prop resets the input on open.
  let inputValue = $state("");
  let query = $state("");

  const groups = $derived(groupCommandOptions(options));
  const normalizedQuery = $derived(query.trim().toLowerCase());
  const visibleGroups = $derived(
    groups
      .map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          `${option.label} ${option.groupLabel} ${option.value}`
            .toLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.options.length > 0),
  );
  const matchCount = $derived(
    visibleGroups.reduce((count, group) => count + group.options.length, 0),
  );
  const selectedLabel = $derived(options.find((option) => option.value === value)?.label ?? value);

  function handleOpenChange(next: boolean) {
    if (next) {
      inputValue = "";
      query = "";
      void tick().then(() => searchInput?.focus());
    }
  }

  // bits-ui computes the highlighted candidate synchronously inside the input
  // event, before the filtered list re-renders. When the highlighted item was
  // filtered away, replay the input event so bits-ui re-highlights against the
  // freshly rendered list.
  $effect(() => {
    void query;
    if (!open) return;
    void tick().then(() => {
      const input = searchInput;
      const container = contentElement;
      if (!input || !container) return;
      const activeId = input.getAttribute("aria-activedescendant");
      if (activeId && container.querySelector(`#${CSS.escape(activeId)}`)) return;
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
  });
</script>

<Combobox.Root
  type="single"
  {value}
  items={options}
  {inputValue}
  allowDeselect={false}
  bind:open
  onOpenChange={handleOpenChange}
  onValueChange={(next) => onValueChange?.(next)}
>
  <Combobox.Trigger class="w-full min-w-0">
    <span class="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
  </Combobox.Trigger>
  <Combobox.Content bind:ref={contentElement}>
    <div class="sticky top-0 z-10 border-b border-border bg-popover p-2">
      <div class="relative">
        <SearchIcon
          class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Combobox.Input
          bind:ref={searchInput}
          class="pl-8"
          autocomplete="off"
          placeholder={labels.search}
          oninput={(event) => {
            query = event.currentTarget.value;
          }}
        />
      </div>
    </div>

    {#if matchCount === 0}
      <p class="px-2 py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
    {:else}
      {#each visibleGroups as group (group.group)}
        <Combobox.Group>
          <Combobox.GroupHeading>{group.groupLabel}</Combobox.GroupHeading>
          {#each group.options as option (option.value)}
            <Combobox.Item value={option.value} label={option.label}>{option.label}</Combobox.Item>
          {/each}
        </Combobox.Group>
      {/each}
    {/if}
  </Combobox.Content>
</Combobox.Root>
