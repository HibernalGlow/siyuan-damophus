<script lang="ts">
  import { RotateCcw, SlidersHorizontal } from "lucide-svelte";
  import { Button } from "@/components/ui/button";
  import ConditionEditorDialog from "@/components/condition-editor/ConditionEditorDialog.svelte";
  import { renameGroupInQuery } from "@/components/condition-editor/rename-group";
  import type { CoverConditionGroup, TagPool } from "./sources";
  import { buildCombinators, buildFields, buildOperators, buildTranslations } from "./cover-condition-catalog";

  export let label: (key: string, fallback: string) => string;
  export let condition: CoverConditionGroup;
  export let tagPools: TagPool[] = [];
  export let onApply: (condition: CoverConditionGroup) => void;
  export const listsAsArrays = false;

  // The persisted tree IS the query-builder model, so no conversion adapter is
  // involved; a deep clone just keeps dialog edits discardable until applied.
  type ConditionQuery = CoverConditionGroup & { id?: string };
  const cloneCondition = (group: CoverConditionGroup): ConditionQuery => JSON.parse(JSON.stringify(group));
  const countRules = (group: CoverConditionGroup): number =>
    group.rules.reduce<number>((total, entry) => total + ("rules" in entry ? countRules(entry) : 1), 0);

  let sourceCondition = condition;
  let editorQuery: ConditionQuery = cloneCondition(condition);
  let dialogOpen = false;

  $: fields = buildFields(label, tagPools);
  $: operators = buildOperators(label);
  $: combinators = buildCombinators(label);
  $: translations = buildTranslations(label);
  $: if (condition !== sourceCondition) { sourceCondition = condition; if (!dialogOpen) editorQuery = cloneCondition(condition); }

  function renameGroupAt(path: readonly number[], name: string): void {
    editorQuery = renameGroupInQuery(editorQuery, path, name);
  }

  function openEditor(): void { editorQuery = cloneCondition(condition); dialogOpen = true; }
  function cancelEditor(): void { editorQuery = cloneCondition(condition); dialogOpen = false; }
  function applyEditor(): void {
    const next = JSON.parse(JSON.stringify(editorQuery)) as CoverConditionGroup;
    onApply(next);
    sourceCondition = next;
    editorQuery = cloneCondition(next);
    dialogOpen = false;
  }
  function clearEditor(): void { editorQuery = { combinator: "and", rules: [] }; }
</script>

<div class="cover-condition-editor" data-testid="cover-condition-editor">
  <div class="condition-summary-row">
    <Button variant="ghost" class="condition-summary-trigger" onclick={openEditor} aria-label={label("builderTitle", "Edit filter rules")}>
      <span class="condition-summary-icon" aria-hidden="true"><SlidersHorizontal size={16} /></span>
      <span class="condition-summary-copy"><strong>{label("builderTitle", "Edit filter rules")}</strong><small>{countRules(condition) ? label("ruleCount", `${countRules(condition)} rules`).replace("{count}", String(countRules(condition))) : label("noRules", "No filter rules")}</small></span>
    </Button>
    <Button variant="ghost" size="icon-sm" title={label("clearConditions", "Clear rules")} aria-label={label("clearConditions", "Clear rules")} disabled={!countRules(condition)} onclick={() => onApply({ combinator: "and", rules: [] })}><RotateCcw aria-hidden="true" /></Button>
  </div>
  {#if dialogOpen}
    <ConditionEditorDialog
      {label}
      title={label("builderTitle", "Edit filter rules")}
      open={dialogOpen}
      bind:query={editorQuery}
      {fields}
      {operators}
      {combinators}
      {translations}
      context={{
        renameGroupAt,
        groupNamePlaceholder: label("conditionGroupNamePlaceholder", "Name this group"),
      }}
      defaultField="aspectRatio"
      defaultOperator={(field: string) => (fields.find((item) => item.name === field)?.defaultOperator as string)}
      defaultValue={(rule: { field: string }) => fields.find((item) => item.name === rule.field)?.defaultValue}
      showNotToggle
      showLockButtons
      dock="fixed"
      clearLabel={label("clearConditions", "Clear rules")}
      onApply={applyEditor}
      onCancel={cancelEditor}
      onClear={clearEditor}
    />
  {/if}
</div>

<style>
  .cover-condition-editor { border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-background); }
  .condition-summary-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
  :global(.condition-summary-trigger) { min-width: 0; flex: 1; justify-content: flex-start; gap: 9px; text-align: left; white-space: normal; }
  .condition-summary-icon { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 5px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 13%, var(--b3-theme-background)); }
  .condition-summary-copy { min-width: 0; display: grid; gap: 1px; } .condition-summary-copy strong { font-size: 12px; } .condition-summary-copy small { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
</style>
