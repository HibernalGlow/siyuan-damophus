<script lang="ts">
  import SettingOverview, { type OverviewCategory } from "./setting-overview.svelte";

  export let categories: OverviewCategory[] = [];
  export let reorderHint = "Drag to reorder";
  export let compact = false;

  let mode: "overview" | "navigation" = "overview";
  let activeSelectId = "";

  function selectModule(event: CustomEvent<string>) {
    activeSelectId = event.detail;
    mode = "navigation";
  }
</script>

<SettingOverview
  {categories}
  {mode}
  {activeSelectId}
  {compact}
  {reorderHint}
  on:select={selectModule}
  on:overview={() => mode = "overview"}
/>
