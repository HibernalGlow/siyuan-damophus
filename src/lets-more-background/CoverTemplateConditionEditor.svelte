<script lang="ts">
  import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-svelte";
  import { QueryBuilder, type Field, type FullCombinator, type FullOperator, type Translations } from "svelte-querybuilder";
  import "svelte-querybuilder/dist/query-builder.css";
  import { Button } from "@/components/ui/button";
  import PracticeQueryBuilderShiftActions from "../lets-question-bank/PracticeQueryBuilderShiftActions.svelte";
  import PracticeQueryBuilderUndoRedo from "../lets-question-bank/PracticeQueryBuilderUndoRedo.svelte";
  import PracticeQueryBuilderValueSelector from "../lets-question-bank/PracticeQueryBuilderValueSelector.svelte";
  import CoverTemplateQueryBuilderAction from "./CoverTemplateQueryBuilderAction.svelte";
  import type { FilterRule, TagPool } from "./sources";
  import { coverRulesToQuery, queryToCoverRules, type CoverQueryGroup } from "./cover-querybuilder-adapter";

  export let label: (key: string, fallback: string) => string;
  export let rules: FilterRule[] = [];
  export let tagPools: TagPool[] = [];
  export let onApply: (rules: FilterRule[]) => void;
  export const listsAsArrays = false;

  const sites: Array<[string, string]> = [
    ["safebooru.org", "Safebooru.org"], ["yande.re", "Yande.re"], ["konachan.com", "Konachan"], ["gelbooru.com", "Gelbooru"], ["safebooru.donmai.us", "Safebooru (Danbooru mirror)"], ["danbooru.donmai.us", "Danbooru"],
  ];
  let sourceRules = rules;
  let editorQuery: CoverQueryGroup = coverRulesToQuery(rules);
  let dialogOpen = false;
  let fields: Field[] = [];
  let operators: FullOperator[] = [];
  let combinators: FullCombinator[] = [];
  let translations: Partial<Translations> = {};

  function selectField(name: FilterRule["field"], fieldLabel: string, values: Array<[string, string]>, operator: FilterRule["operator"]): Field {
    return { name, label: fieldLabel, valueEditorType: "select", values: values.map(([value, text]) => ({ name: value, label: text })), defaultOperator: operator, defaultValue: values[0]?.[0] ?? "" };
  }

  $: fields = [
    selectField("aspectRatio", label("fieldRatio", "Aspect ratio"), [["landscape", label("ratioLandscape", "Landscape")], ["wide", label("ratioWide", "Wide")], ["portrait", label("ratioPortrait", "Portrait")], ["any", label("ratioAny", "Any ratio")]], "equals"),
    selectField("site", label("fieldSite", "Booru site"), sites, "equals"),
    selectField("rating", label("fieldRating", "Safety rating"), [["safe", label("ratingSafe", "Safe")], ["general", label("ratingGeneral", "General")], ["questionable", label("ratingQuestionable", "Questionable")], ["all", label("ratingAll", "All")]], "equals"),
    { name: "tags", label: label("fieldTags", "Fixed tags"), defaultOperator: "contains", defaultValue: "wallpaper" },
    { name: "minScore", label: label("fieldMinScore", "Minimum score"), inputType: "number", defaultOperator: "gte", defaultValue: 5 },
    { name: "timeRange", label: label("fieldTimeRange", "Time range"), defaultOperator: "equals", defaultValue: "30d" },
    selectField("tagPool", label("fieldTagPool", "Tag or artist pool"), tagPools.map((pool) => [pool.id, pool.name]), "randomIn"),
    selectField("excludeTagPool", label("fieldExcludeTagPool", "Excluded tag pool"), tagPools.map((pool) => [pool.id, pool.name]), "excludeAllIn"),
    selectField("imageQuality", label("fieldImageQuality", "Image quality"), [["original", label("qualityOriginal", "Original")], ["sample", label("qualitySample", "Sample")], ["preview", label("qualityPreview", "Preview")]], "equals"),
    { name: "blacklist", label: label("fieldBlacklist", "Excluded tags"), defaultOperator: "containsNone", defaultValue: "" },
  ];
  $: operators = [
    { name: "equals", value: "equals", label: label("opEquals", "is") }, { name: "contains", value: "contains", label: label("opContains", "contains") }, { name: "gte", value: "gte", label: label("opGte", "is at least") }, { name: "randomIn", value: "randomIn", label: label("opRandomIn", "random in") }, { name: "excludeAllIn", value: "excludeAllIn", label: label("opExcludeAllIn", "excludes every entry in") }, { name: "containsNone", value: "containsNone", label: label("opContainsNone", "excludes tags") },
  ];
  $: combinators = [{ name: "and", value: "and", label: label("conditionAnd", "and") }];
  $: translations = {
    fields: { title: label("field", "Field") }, operators: { title: label("operator", "Operator") }, values: { title: label("value", "Value") }, value: { title: label("value", "Value") }, combinators: { title: label("conditionAnd", "and") },
    addRule: { label: label("addRule", "Add filter rule"), title: label("addRule", "Add filter rule") }, removeRule: { label: label("deleteCondition", "Delete"), title: label("deleteCondition", "Delete filter rule") }, cloneRule: { label: label("cloneCondition", "Clone"), title: label("cloneCondition", "Clone filter rule") }, shiftActions: { shiftUp: label("moveConditionUp", "Move up"), shiftDown: label("moveConditionDown", "Move down") }, undoRedoActions: { undo: label("undoCondition", "Undo"), redo: label("redoCondition", "Redo") },
  };
  $: if (rules !== sourceRules) { sourceRules = rules; if (!dialogOpen) editorQuery = coverRulesToQuery(rules); }

  function openEditor(): void { editorQuery = coverRulesToQuery(rules); dialogOpen = true; }
  function cancelEditor(): void { editorQuery = coverRulesToQuery(rules); dialogOpen = false; }
  function applyEditor(): void { const next = queryToCoverRules(editorQuery); onApply(next); sourceRules = next; editorQuery = coverRulesToQuery(next); dialogOpen = false; }
  function clearEditor(): void { editorQuery = coverRulesToQuery([]); }
</script>

<div class="cover-condition-editor" data-testid="cover-condition-editor">
  <div class="condition-summary-row">
    <Button variant="ghost" class="condition-summary-trigger" onclick={openEditor} aria-label={label("builderTitle", "Edit filter rules")}>
      <span class="condition-summary-icon" aria-hidden="true"><SlidersHorizontal size={16} /></span>
      <span class="condition-summary-copy"><strong>{label("builderTitle", "Edit filter rules")}</strong><small>{rules.length ? label("ruleCount", `${rules.length} rules`).replace("{count}", String(rules.length)) : label("noRules", "No filter rules")}</small></span>
    </Button>
    <Button variant="ghost" size="icon-sm" title={label("clearConditions", "Clear rules")} aria-label={label("clearConditions", "Clear rules")} disabled={!rules.length} onclick={() => onApply([])}><RotateCcw aria-hidden="true" /></Button>
  </div>
  {#if dialogOpen}
    <div class="condition-dialog-scrim" onclick={cancelEditor} aria-hidden="true"></div>
    <div class="condition-dialog" role="dialog" aria-modal="true" aria-labelledby="cover-condition-dialog-title">
      <header class="condition-dialog-header"><strong id="cover-condition-dialog-title">{label("builderTitle", "Edit filter rules")}</strong><Button variant="ghost" size="icon" onclick={cancelEditor} aria-label={label("cancel", "Cancel")}><X size={17} aria-hidden="true" /></Button></header>
      <div class="condition-dialog-body"><div class="query-builder-theme cover-query-builder"><QueryBuilder {fields} {operators} {combinators} {translations} bind:query={editorQuery} getDefaultField="aspectRatio" getDefaultOperator={(field) => fields.find((item) => item.name === field)?.defaultOperator as string} getDefaultValue={(rule) => fields.find((item) => item.name === rule.field)?.defaultValue} maxLevels={1} resetOnFieldChange showCombinatorsBetweenRules showCloneButtons showShiftActions showUndoRedo controlElements={{ actionElement: CoverTemplateQueryBuilderAction, addRuleAction: CoverTemplateQueryBuilderAction, combinatorSelector: PracticeQueryBuilderValueSelector, fieldSelector: PracticeQueryBuilderValueSelector, operatorSelector: PracticeQueryBuilderValueSelector, shiftActions: PracticeQueryBuilderShiftActions, undoRedoActions: PracticeQueryBuilderUndoRedo, valueSelector: PracticeQueryBuilderValueSelector }} /></div></div>
      <footer class="condition-dialog-footer"><Button variant="ghost" size="sm" onclick={clearEditor}><RotateCcw size={14} aria-hidden="true" /><span>{label("clearConditions", "Clear rules")}</span></Button><div class="condition-dialog-footer-actions"><Button variant="outline" size="sm" onclick={cancelEditor}>{label("cancel", "Cancel")}</Button><Button size="sm" onclick={applyEditor}><Check size={14} aria-hidden="true" /><span>{label("apply", "Apply")}</span></Button></div></footer>
    </div>
  {/if}
</div>

<style>
  .cover-condition-editor { border: 1px solid var(--b3-border-color); border-radius: 6px; background: var(--b3-theme-background); }
  .condition-summary-row, .condition-dialog-header, .condition-dialog-footer { display: flex; align-items: center; gap: 8px; padding: 8px 10px; }
  :global(.condition-summary-trigger) { min-width: 0; flex: 1; justify-content: flex-start; gap: 9px; text-align: left; white-space: normal; }
  .condition-summary-icon { display: grid; width: 28px; height: 28px; flex: 0 0 28px; place-items: center; border-radius: 5px; color: var(--b3-theme-primary); background: color-mix(in srgb, var(--b3-theme-primary) 13%, var(--b3-theme-background)); }
  .condition-summary-copy { min-width: 0; display: grid; gap: 1px; } .condition-summary-copy strong { font-size: 12px; } .condition-summary-copy small { overflow: hidden; color: var(--b3-theme-on-surface); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .condition-dialog-scrim { position: fixed; inset: 0; z-index: 9998; background: rgb(0 0 0 / 42%); }
  .condition-dialog { position: fixed; top: 50%; left: 50%; z-index: 9999; display: flex; flex-direction: column; width: min(94vw, 760px); max-height: min(86vh, 700px); overflow: hidden; transform: translate(-50%, -50%); border: 1px solid var(--b3-border-color); border-radius: 8px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); box-shadow: var(--b3-dialog-shadow, 0 14px 36px rgb(0 0 0 / 25%)); }
  .condition-dialog-header { justify-content: space-between; border-bottom: 1px solid var(--b3-border-color); } .condition-dialog-body { min-height: 0; overflow: auto; padding: 12px; } .condition-dialog-footer { justify-content: space-between; border-top: 1px solid var(--b3-border-color); } .condition-dialog-footer-actions { display: flex; gap: 8px; }
  .cover-query-builder { --rqb-border-color: var(--b3-border-color); --rqb-branch-color: var(--b3-border-color); --rqb-border-radius: 6px; --rqb-spacing: 7px; }
  :global(.cover-query-builder .queryBuilder) { width: 100%; color: var(--b3-theme-on-background); }
  :global(.cover-query-builder .ruleGroup) { border: 1px solid var(--b3-border-color); border-radius: 6px; background: color-mix(in srgb, var(--b3-theme-surface) 55%, var(--b3-theme-background)); }
  :global(.cover-query-builder .ruleGroup-header) { display: flex; align-items: center; gap: 7px; padding: 8px; border-bottom: 1px solid var(--b3-border-color); background: color-mix(in srgb, var(--b3-theme-surface) 75%, var(--b3-theme-background)); }
  :global(.cover-query-builder .ruleGroup-combinators) { display: none; }
  :global(.cover-query-builder .ruleGroup-addGroup) { display: none !important; }
  :global(.cover-query-builder .rule) { align-items: center; padding: 7px; border: 1px solid var(--b3-border-color); border-radius: 5px; background: color-mix(in srgb, var(--b3-theme-background) 88%, var(--b3-theme-surface)); }
  :global(.cover-query-builder [data-slot="select-trigger"]), :global(.cover-query-builder input:not([type="checkbox"])), :global(.cover-query-builder button) { min-height: 30px; border: 1px solid var(--b3-border-color) !important; border-radius: 5px; color: var(--b3-theme-on-background) !important; background: var(--b3-theme-surface) !important; font: inherit; box-shadow: none !important; }
  :global(.cover-query-builder [data-slot="select-trigger"]) { min-width: 0; gap: 6px; padding: 4px 8px; text-align: left; }
  :global(.cover-query-builder [data-slot="select-trigger"] > svg:first-child) { flex: 0 0 auto; color: var(--b3-theme-primary); }
  :global(.cover-query-builder [data-slot="select-trigger"] > span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  :global(.cover-query-builder .rule-fields) { flex: 1 1 160px; min-width: 0; } :global(.cover-query-builder .rule-operators) { flex: 1 1 132px; min-width: 0; } :global(.cover-query-builder .rule-value) { flex: 1 1 130px; min-width: 0; }
  :global(.cover-query-builder button) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 4px 8px; cursor: pointer; }
  :global(.cover-query-builder button:hover) { background: var(--b3-list-hover) !important; }
  :global(.cover-query-builder .ruleGroup-addRule) { padding: 5px 10px; border-color: var(--b3-theme-primary) !important; color: var(--b3-theme-on-primary, white) !important; background: var(--b3-theme-primary) !important; font-weight: 600; }
  :global(.cover-query-builder .ruleGroup-addRule:hover) { background: color-mix(in srgb, var(--b3-theme-primary) 84%, black) !important; }
  :global(.cover-query-builder .rule-remove), :global(.cover-query-builder .ruleGroup-remove) { color: var(--b3-theme-error, var(--b3-theme-on-surface)) !important; }
  :global(.cover-query-builder [data-slot="select-trigger"]:focus-visible), :global(.cover-query-builder input:focus-visible), :global(.cover-query-builder button:focus-visible) { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }
  @media (max-width: 600px) { .condition-dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); } .condition-dialog-body { padding: 8px; } :global(.query-builder-theme .rule) { flex-wrap: wrap; } }
</style>
