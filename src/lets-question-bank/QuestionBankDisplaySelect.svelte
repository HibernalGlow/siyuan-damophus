<script lang="ts">
  import { FileText, Heading1, ListTree, PanelsTopLeft, Rows3, TextSelect } from "lucide-svelte";
  import * as Select from "@/components/ui/select";
  import { plugin } from "@/utils";

  export let item: ISettingItem;
  export let onChange: (value: string) => void;

  let sourceValue = String(item.value);
  let selectedValue = sourceValue;

  $: nextSourceValue = String(item.value);
  $: if (nextSourceValue !== sourceValue) {
    sourceValue = nextSourceValue;
    selectedValue = nextSourceValue;
  }

  function localized(value: string): string {
    return plugin.i18n[value] || value;
  }

  function displayIcon(value: string) {
    if (item.key === "questionRenderMode") {
      if (value === "html") return TextSelect;
      if (value === "native") return FileText;
      return PanelsTopLeft;
    }
    if (value === "0") return Rows3;
    if (value === "1") return Heading1;
    return ListTree;
  }

  function change(value: string): void {
    if (!value) return;
    selectedValue = value;
    onChange(value);
  }
</script>

<Select.Root type="single" bind:value={selectedValue} onValueChange={change}>
  {@const selectedLabel = localized(item.options[selectedValue] || selectedValue)}
  {@const SelectedIcon = displayIcon(selectedValue)}
  <Select.Trigger id={item.key} class="w-52 max-w-full damophus-setting-select" title={selectedLabel} aria-label={localized(item.title)}>
    <svelte:component this={SelectedIcon} aria-hidden="true" />
    <span>{selectedLabel}</span>
  </Select.Trigger>
  <Select.Content>
    <Select.Group>
      {#each Object.entries(item.options) as [value, option] (value)}
        {@const label = localized(option)}
        {@const Icon = displayIcon(value)}
        <Select.Item {value} {label}>
          <svelte:component this={Icon} aria-hidden="true" />
          <span>{label}</span>
        </Select.Item>
      {/each}
    </Select.Group>
  </Select.Content>
</Select.Root>
