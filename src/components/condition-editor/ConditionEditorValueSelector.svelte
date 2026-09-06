<script lang="ts">
  import type { ValueSelectorProps } from "svelte-querybuilder";
  import * as Select from "@/components/ui/select";
  import {
    Bookmark,
    CalendarClock,
    CheckCircle2,
    CircleCheck,
    CircleEllipsis,
    Clock3,
    GitBranch,
    History,
    ListFilter,
    RefreshCw,
    Repeat,
    RotateCcw,
    Sparkles,
    Star,
    TrendingDown,
    TrendingUp,
    XCircle,
  } from "lucide-svelte";
  import Equal from "lucide-svelte/icons/equal";
  import EqualNot from "lucide-svelte/icons/equal-not";

  export let className: ValueSelectorProps["className"] = undefined;
  export let disabled = false;
  export let handleOnChange: ValueSelectorProps["handleOnChange"];
  export let field: string | undefined = undefined;
  export let listsAsArrays: ValueSelectorProps["listsAsArrays"] = false;
  export let multiple = false;
  export let options: ValueSelectorProps["options"];
  export let testID: ValueSelectorProps["testID"] = undefined;
  export let title: ValueSelectorProps["title"] = undefined;
  export let value: ValueSelectorProps["value"] = undefined;

  type SelectorOption = { name: string; label?: unknown; disabled?: boolean };
  type SelectorGroup = { label: string; options: SelectorOption[] };

  const FIELD_ICONS: Record<string, typeof ListFilter> = {
    attempted: CheckCircle2,
    wrong: XCircle,
    review: RefreshCw,
    due: Clock3,
    bookmarked: Bookmark,
    latest_rating: Star,
    last_result: History,
    wrong_count: TrendingDown,
    attempt_count: Repeat,
    last_answered_days: CalendarClock,
  };

  const OPERATOR_ICONS: Record<string, typeof ListFilter> = {
    greater: TrendingUp,
    less: TrendingDown,
    greaterOrEqual: TrendingUp,
    lessOrEqual: TrendingDown,
  };

  const RATING_VALUE_ICONS: Record<string, typeof ListFilter> = {
    again: RotateCcw,
    hard: CircleEllipsis,
    good: CircleCheck,
    easy: Sparkles,
  };

  const LAST_RESULT_VALUE_ICONS: Record<string, typeof ListFilter> = {
    correct: CheckCircle2,
    wrong: XCircle,
    unattempted: CircleEllipsis,
  };

  $: selectedValue = Array.isArray(value) ? value[0] ?? "" : value ?? "";
  $: groupedOptions = Array.isArray(options) && options.every((option) => typeof option === "object" && option !== null && "options" in option)
    ? options as unknown as SelectorGroup[]
    : undefined;
  $: flatOptions = groupedOptions ? [] : options as unknown as SelectorOption[];
  $: allOptions = [...(groupedOptions?.flatMap((group) => group.options) ?? flatOptions)];
  $: selectedOption = allOptions.find((option) => option.name === selectedValue);
  $: selectedLabel = selectedOption ? optionText(selectedOption) : selectedValue;
  $: selectedValues = multiple
    ? (Array.isArray(value) ? value : typeof value === "string" && value ? value.split(",") : []).filter(
        (item) => allOptions.some((option) => option.name === item),
      )
    : [];
  $: selectedLabels = selectedValues
    .map((item) => allOptions.find((option) => option.name === item))
    .filter((option): option is SelectorOption => Boolean(option))
    .map(optionText)
    .join("、");

  function optionText(option: { label?: unknown; name: unknown }): string {
    return typeof option.label === "string" ? option.label : String(option.name);
  }

  function iconForOption(name: string): typeof ListFilter {
    // Combinator and boolean operator options never collide with field names,
    // so they are matched first for every selector kind.
    if (["and", "or"].includes(name)) return GitBranch;
    if (["equal", "notEqual"].includes(name)) return name === "notEqual" ? EqualNot : Equal;
    if (OPERATOR_ICONS[name]) return OPERATOR_ICONS[name];
    // Remaining field === undefined names come from the field dropdown.
    if (field === undefined && FIELD_ICONS[name]) return FIELD_ICONS[name];
    if (field !== undefined) {
      if (field === "latest_rating" && RATING_VALUE_ICONS[name]) return RATING_VALUE_ICONS[name];
      if (field === "last_result" && LAST_RESULT_VALUE_ICONS[name]) return LAST_RESULT_VALUE_ICONS[name];
      if (name === "yes") return CheckCircle2;
      if (name === "no") return XCircle;
    }
    return ListFilter;
  }

  function change(value: string | undefined): void {
    if (value === undefined) return;
    handleOnChange(multiple && listsAsArrays ? [value] : value);
  }

  function changeMultiple(next: string[]): void {
    handleOnChange(listsAsArrays ? next : next.join(","));
  }
</script>

{#if multiple}
  <Select.Root
    type="multiple"
    value={selectedValues}
    onValueChange={changeMultiple}
  >
    <Select.Trigger
      class={className}
      data-testid={testID}
      aria-label={title}
      {title}
      {disabled}
    >
      <span>{selectedLabels}</span>
    </Select.Trigger>
    <Select.Content>
      <Select.Group>
        {#each allOptions as option (option.name)}
          <Select.Item value={option.name} label={optionText(option)} disabled={option.disabled}>
            {@const OptionIcon = iconForOption(option.name)}
            <svelte:component this={OptionIcon} aria-hidden="true" />
            <span>{optionText(option)}</span>
          </Select.Item>
        {/each}
      </Select.Group>
    </Select.Content>
  </Select.Root>
{:else}
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
{/if}
