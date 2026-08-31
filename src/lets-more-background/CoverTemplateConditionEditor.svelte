<script lang="ts">
  import { Check, GitBranch, ListFilter, RotateCcw, SlidersHorizontal, X } from "lucide-svelte";
  import { QueryBuilder, type Field, type FullCombinator, type FullOperator, type RuleGroupType, type RuleType, type Translations } from "svelte-querybuilder";
  import "svelte-querybuilder/dist/query-builder.css";
  import "@/styles/query-builder-theme.css";
  import { Button } from "@/components/ui/button";
  import ConditionGraph from "@/components/condition-graph/ConditionGraph.svelte";
  import PracticeQueryBuilderAction from "../lets-question-bank/PracticeQueryBuilderAction.svelte";
  import PracticeQueryBuilderShiftActions from "../lets-question-bank/PracticeQueryBuilderShiftActions.svelte";
  import PracticeQueryBuilderUndoRedo from "../lets-question-bank/PracticeQueryBuilderUndoRedo.svelte";
  import PracticeQueryBuilderValueSelector from "../lets-question-bank/PracticeQueryBuilderValueSelector.svelte";
  import { coverConditionToGraph } from "./cover-condition-graph";
  import type { CoverConditionGroup, CoverConditionRule, TagPool } from "./sources";

  export let label: (key: string, fallback: string) => string;
  export let condition: CoverConditionGroup;
  export let tagPools: TagPool[] = [];
  export let onApply: (condition: CoverConditionGroup) => void;
  export const listsAsArrays = false;

  const sites: Array<[string, string]> = [
    ["safebooru.org", "Safebooru.org"], ["yande.re", "Yande.re"], ["konachan.com", "Konachan"], ["gelbooru.com", "Gelbooru"], ["safebooru.donmai.us", "Safebooru (Danbooru mirror)"], ["danbooru.donmai.us", "Danbooru"],
  ];
  // The persisted tree IS the query-builder model, so no conversion adapter is
  // involved; a deep clone just keeps dialog edits discardable until applied.
  type ConditionQuery = RuleGroupType<RuleType<string, string>, string>;
  const cloneCondition = (group: CoverConditionGroup): ConditionQuery => JSON.parse(JSON.stringify(group));
  const countRules = (group: CoverConditionGroup): number =>
    group.rules.reduce<number>((total, entry) => total + ("rules" in entry ? countRules(entry) : 1), 0);

  let sourceCondition = condition;
  let editorQuery: ConditionQuery = cloneCondition(condition);
  let dialogOpen = false;
  let viewMode: "list" | "graph" = "list";
  let fields: Field[] = [];
  let operators: FullOperator[] = [];
  let combinators: FullCombinator[] = [];
  let translations: Partial<Translations> = {};

  // ---- Graph view: click a rule node to edit it in the inspector ----
  type EditorRule = { field: string; operator: string; value: unknown; disabled?: boolean };
  let selectedGraphPath: number[] | undefined;
  let selectedGraphRule: EditorRule | undefined;

  function ruleAt(path: readonly number[] | undefined): EditorRule | undefined {
    if (!path?.length) return undefined;
    let group: ConditionQuery = editorQuery;
    for (let depth = 0; depth < path.length; depth += 1) {
      const entry = group.rules[path[depth]];
      if (!entry || typeof entry !== "object") return undefined;
      if (depth === path.length - 1) return "rules" in entry ? undefined : (entry as unknown as EditorRule);
      group = entry as unknown as ConditionQuery;
    }
    return undefined;
  }

  function updateGraphRule(next: Partial<EditorRule>): void {
    if (!selectedGraphPath?.length) return;
    const rewrite = (group: ConditionQuery, depth: number): ConditionQuery => ({
      ...group,
      rules: group.rules.map((entry, index) => {
        if (index !== selectedGraphPath![depth]) return entry;
        if (depth === selectedGraphPath!.length - 1 && !("rules" in entry)) {
          return { ...(entry as unknown as EditorRule), ...next };
        }
        if ("rules" in entry) return rewrite(entry as unknown as ConditionQuery, depth + 1);
        return entry;
      }),
    });
    editorQuery = rewrite(editorQuery, 0);
  }

  function graphNodeActivate(id: string): void {
    const node = graphModel.nodes.find((candidate) => candidate.id === id);
    const path = node?.meta?.rulePath;
    if (Array.isArray(path) && path.every((item) => typeof item === "number")) {
      selectedGraphPath = path as number[];
    } else {
      selectedGraphPath = undefined;
      viewMode = "list";
    }
  }

  $: selectedGraphRule = ruleAt(selectedGraphPath);
  $: graphLabels = {
    field: Object.fromEntries(fields.map((field) => [field.name, field.label])),
    operator: Object.fromEntries(operators.map((operator) => [operator.name, operator.label])),
    and: label("conditionAnd", "且"),
    result: label("conditionGraphResult", "封面图"),
    empty: label("conditionGraphEmpty", "全部图片"),
  };
  $: graphModel = coverConditionToGraph(editorQuery as unknown as CoverConditionGroup, graphLabels);
  $: selectedGraphField = fields.find((field) => field.name === selectedGraphRule?.field);

  function selectField(name: CoverConditionRule["field"], fieldLabel: string, values: Array<[string, string]>, operator: CoverConditionRule["operator"]): Field {
    return { name, label: fieldLabel, valueEditorType: "select", values: values.map(([value, text]) => ({ name: value, label: text })), defaultOperator: operator, defaultValue: values[0]?.[0] ?? "" };
  }

  // Field values are flexible options (string | {name,label} | group); the
  // inspector only renders scalar options, so flatten defensively.
  function optionValue(option: unknown): string {
    if (typeof option === "object" && option !== null && "name" in option) return String((option as { name: unknown }).name);
    if (typeof option === "object" && option !== null && "options" in option) return "";
    return String(option);
  }

  function optionText(option: unknown): string {
    if (typeof option === "object" && option !== null && "label" in option) return String((option as { label: unknown }).label);
    return optionValue(option);
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
    addRule: { label: label("addRule", "Add filter rule"), title: label("addRule", "Add filter rule") }, addGroup: { label: label("addConditionGroup", "Add group"), title: label("addConditionGroup", "Add filter group") }, removeRule: { label: label("deleteCondition", "Delete"), title: label("deleteCondition", "Delete filter rule") }, removeGroup: { label: label("deleteCondition", "Delete"), title: label("deleteCondition", "Delete filter group") }, cloneRule: { label: label("cloneCondition", "Clone"), title: label("cloneCondition", "Clone filter rule") }, cloneRuleGroup: { label: label("cloneCondition", "Clone"), title: label("cloneCondition", "Clone filter group") }, shiftActions: { shiftUp: label("moveConditionUp", "Move up"), shiftDown: label("moveConditionDown", "Move down") }, undoRedoActions: { undo: label("undoCondition", "Undo"), redo: label("redoCondition", "Redo") },
  };
  $: if (condition !== sourceCondition) { sourceCondition = condition; if (!dialogOpen) editorQuery = cloneCondition(condition); }

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
    <div class="condition-dialog-scrim" onclick={cancelEditor} aria-hidden="true"></div>
    <div class="condition-dialog" role="dialog" aria-modal="true" aria-labelledby="cover-condition-dialog-title">
      <header class="condition-dialog-header"><strong id="cover-condition-dialog-title">{label("builderTitle", "Edit filter rules")}</strong><Button variant="ghost" size="icon" onclick={cancelEditor} aria-label={label("cancel", "Cancel")}><X size={17} aria-hidden="true" /></Button></header>
      <div class="condition-dialog-body">
        <div class="condition-view-switcher" role="group" aria-label={label("conditionViewMode", "Condition view")}>
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" class="condition-view-button" aria-pressed={viewMode === "list"} data-testid="condition-view-list" onclick={() => (viewMode = "list")}><ListFilter size={14} aria-hidden="true" /><span>{label("conditionViewList", "List view")}</span></Button>
          <Button variant={viewMode === "graph" ? "secondary" : "ghost"} size="sm" class="condition-view-button" aria-pressed={viewMode === "graph"} data-testid="condition-view-graph" onclick={() => (viewMode = "graph")}><GitBranch size={14} aria-hidden="true" /><span>{label("conditionViewGraph", "Graph view")}</span></Button>
        </div>
        {#if viewMode === "graph"}
          <ConditionGraph model={graphModel} height={320} onNodeActivate={graphNodeActivate} />
          {#if selectedGraphRule}
            <div class="condition-graph-inspector" data-testid="cover-condition-graph-inspector">
              <strong>{label("conditionEditNode", "Edit condition")}</strong>
              <select aria-label={label("field", "Field")} value={selectedGraphRule.field} onchange={(event) => updateGraphRule({ field: (event.currentTarget as HTMLSelectElement).value })}>
                {#each fields as field}<option value={field.name}>{field.label}</option>{/each}
              </select>
              <select aria-label={label("operator", "Operator")} value={selectedGraphRule.operator} onchange={(event) => updateGraphRule({ operator: (event.currentTarget as HTMLSelectElement).value })}>
                {#each operators as operator}<option value={operator.name}>{operator.label}</option>{/each}
              </select>
              {#if selectedGraphField?.values?.length}
                <select aria-label={label("value", "Value")} value={String(selectedGraphRule.value ?? "")} onchange={(event) => updateGraphRule({ value: (event.currentTarget as HTMLSelectElement).value })}>
                  {#each selectedGraphField.values as option}
                    <option value={optionValue(option)}>{optionText(option)}</option>
                  {/each}
                </select>
              {:else}
                <input type={selectedGraphField?.inputType ?? "text"} value={String(selectedGraphRule.value ?? "")} aria-label={label("value", "Value")} oninput={(event) => updateGraphRule({ value: (event.currentTarget as HTMLInputElement).value })} />
              {/if}
            </div>
          {/if}
        {:else}
          <div class="query-builder-theme cover-query-builder"><QueryBuilder {fields} {operators} {combinators} {translations} bind:query={editorQuery} getDefaultField="aspectRatio" getDefaultOperator={(field) => fields.find((item) => item.name === field)?.defaultOperator as string} getDefaultValue={(rule) => fields.find((item) => item.name === rule.field)?.defaultValue} maxLevels={4} resetOnFieldChange showCombinatorsBetweenRules showCloneButtons showShiftActions showUndoRedo controlElements={{ actionElement: PracticeQueryBuilderAction, addRuleAction: PracticeQueryBuilderAction, addGroupAction: PracticeQueryBuilderAction, combinatorSelector: PracticeQueryBuilderValueSelector, fieldSelector: PracticeQueryBuilderValueSelector, operatorSelector: PracticeQueryBuilderValueSelector, shiftActions: PracticeQueryBuilderShiftActions, undoRedoActions: PracticeQueryBuilderUndoRedo, valueSelector: PracticeQueryBuilderValueSelector }} /></div>
        {/if}
      </div>
      <footer class="condition-dialog-footer"><Button class="condition-clear-button" variant="ghost" size="sm" onclick={clearEditor}><RotateCcw size={14} aria-hidden="true" /><span>{label("clearConditions", "Clear rules")}</span></Button><div class="condition-dialog-footer-actions"><Button class="condition-cancel-button" variant="outline" size="sm" onclick={cancelEditor}>{label("cancel", "Cancel")}</Button><Button class="condition-apply-button" size="sm" onclick={applyEditor}><Check size={14} aria-hidden="true" /><span>{label("apply", "Apply")}</span></Button></div></footer>
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
  .condition-view-switcher { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
  .condition-view-switcher :global(.condition-view-button) { min-height: 28px; padding: 3px 10px; font-size: 11.5px; }
  .condition-graph-inspector { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; margin-top: 10px; padding: 8px 10px; border: 1px solid var(--b3-border-color); border-radius: 7px; background: var(--b3-theme-surface); }
  .condition-graph-inspector strong { margin-right: 3px; font-size: 12px; }
  .condition-graph-inspector select, .condition-graph-inspector input { min-width: 118px; height: 28px; padding: 0 7px; border: 1px solid var(--b3-border-color); border-radius: 5px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); font: inherit; }
  :global(.condition-dialog-footer .condition-clear-button), :global(.condition-dialog-footer .condition-cancel-button) { border: 1px solid var(--b3-border-color) !important; color: var(--b3-theme-on-background) !important; background: var(--b3-theme-surface) !important; }
  :global(.condition-dialog-footer .condition-clear-button:hover), :global(.condition-dialog-footer .condition-cancel-button:hover) { background: var(--b3-list-hover) !important; }
  :global(.condition-dialog-footer .condition-apply-button) { border: 1px solid var(--b3-theme-primary) !important; color: var(--b3-theme-on-primary, #fff) !important; background: var(--b3-theme-primary) !important; }
  :global(.condition-dialog-footer .condition-apply-button:hover) { background: color-mix(in srgb, var(--b3-theme-primary) 84%, black) !important; }
  :global(.condition-dialog-footer button svg) { color: currentColor; }
  :global(.condition-dialog-footer button:focus-visible) { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }
  .cover-query-builder { --rqb-border-color: var(--b3-border-color); --rqb-branch-color: var(--b3-border-color); --rqb-border-radius: 6px; --rqb-spacing: 7px; }
  :global(.cover-query-builder .queryBuilder) { width: 100%; color: var(--b3-theme-on-background); }
  :global(.cover-query-builder .ruleGroup) { border: 1px solid var(--b3-border-color); border-radius: 6px; background: color-mix(in srgb, var(--b3-theme-surface) 55%, var(--b3-theme-background)); }
  :global(.cover-query-builder .ruleGroup-header) { display: flex; align-items: center; gap: 7px; padding: 8px; border-bottom: 1px solid var(--b3-border-color); background: color-mix(in srgb, var(--b3-theme-surface) 75%, var(--b3-theme-background)); }
  :global(.cover-query-builder .ruleGroup-combinators) { display: none; }
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
  :global(.cover-query-builder .ruleGroup-addGroup) { border-style: dashed !important; color: var(--b3-theme-on-surface) !important; background: var(--b3-theme-surface) !important; }
  :global(.cover-query-builder .ruleGroup-addGroup:hover) { color: var(--b3-theme-primary) !important; }
  :global(.cover-query-builder .rule-remove), :global(.cover-query-builder .ruleGroup-remove) { color: var(--b3-theme-error, var(--b3-theme-on-surface)) !important; }
  :global(.cover-query-builder [data-slot="select-trigger"]:focus-visible), :global(.cover-query-builder input:focus-visible), :global(.cover-query-builder button:focus-visible) { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }
  @media (max-width: 600px) { .condition-dialog { width: calc(100vw - 16px); max-height: calc(100vh - 16px); } .condition-dialog-body { padding: 8px; } :global(.query-builder-theme .rule) { flex-wrap: wrap; } }
</style>
