<script lang="ts">
  import type { ValueSelectorProps } from "svelte-querybuilder";
  import * as Select from "@/components/ui/select";
  import { Bookmark, CheckCircle2, Clock3, GitBranch, ListFilter, RefreshCw, XCircle } from "lucide-svelte";
  import Equal from "lucide-svelte/icons/equal";
  import EqualNot from "lucide-svelte/icons/equal-not";

  export let className: ValueSelectorProps["className"] = undefined;
  export let disabled = false;
  export let handleOnChange: ValueSelectorProps["handleOnChange"];
  export let field: string | undefined = undefined;
  export let operator: string | undefined = undefined;
  export let listsAsArrays: ValueSelectorProps["listsAsArrays"] = false;
  export let multiple = false;
  export let options: ValueSelectorProps["options"];
  export let testID: ValueSelectorProps["testID"] = undefined;
  export let title: ValueSelectorProps["title"] = undefined;
  export let value: ValueSelectorProps["value"] = undefined;

  type SelectorOption = { name: string; label?: unknown; disabled?: boolean };
  type SelectorGroup = { label: string; options: SelectorOption[] };

  $: selectedValue = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  $: groupedOptions = Array.isArray(options) && options.every((option) => typeof option === "object" && option !== null && "options" in option)
    ? options as unknown as SelectorGroup[]
    : undefined;
  $: flatOptions = groupedOptions ? [] : options as unknown as SelectorOption[];
  $: selectedOption = [...(groupedOptions?.flatMap((group) => group.options) ?? flatOptions)]
    .find((option) => option.name === selectedValue);
  $: selectedLabel = selectedOption ? optionText(selectedOption) : selectedValue;

  function optionText(option: { label?: unknown; name: unknown }): string {
    return typeof option.label === "string" ? option.label : String(option.name);
  }

  function iconForOption(name: string): typeof ListFilter {
    if (field === undefined && ["attempted", "wrong", "review", "due", "bookmarked"].includes(name)) {
      return ({ attempted: CheckCircle2, wrong: XCircle, review: RefreshCw, due: Clock3, bookmarked: Bookmark } as Record<string, typeof ListFilter>)[name];
    }
    if (operator !== undefined || ["equal", "notEqual"].includes(name)) {
      return name === "notEqual" ? EqualNot : Equal;
    }
    if (["and", "or"].includes(name)) return GitBranch;
    if (field !== undefined) {
      return name === "yes" ? CheckCircle2 : XCircle;
    }
    return ListFilter;
  }

  function change(value: string | undefined): void {
    if (value === undefined) return;
    handleOnChange(multiple && listsAsArrays ? [value] : value);
  }
</script>

<Select.Root type="single" value={selectedValue} onValueChange={change}>
  <Select.Trigger
    class={className}
    data-testid={testID}
    aria-label={title}
    {title}
    {disabled}
  >
    {@const SelectedIcon = iconForOption(selectedValue)}
    <svelte:component this={SelectedIcon} aria-hidden="true" />
    <span>{selectedLabel}</span>
  </Select.Trigger>
  <Select.Content>
    {#if groupedOptions}
      {#each groupedOptions as group (group.label)}
        <Select.Group>
          <Select.Label>{group.label}</Select.Label>
          {#each group.options as option (option.name)}
            <Select.Item value={option.name} label={optionText(option)} disabled={option.disabled}>
              {@const OptionIcon = iconForOption(option.name)}
              <svelte:component this={OptionIcon} aria-hidden="true" />
              <span>{optionText(option)}</span>
            </Select.Item>
          {/each}
        </Select.Group>
      {/each}
    {:else}
      <Select.Group>
        {#each flatOptions as option (option.name)}
          <Select.Item value={option.name} label={optionText(option)} disabled={option.disabled}>
            {@const OptionIcon = iconForOption(option.name)}
            <svelte:component this={OptionIcon} aria-hidden="true" />
            <span>{optionText(option)}</span>
          </Select.Item>
        {/each}
      </Select.Group>
    {/if}
  </Select.Content>
</Select.Root>
