<script lang="ts">
  import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-svelte";
  import {
    QueryBuilder,
    type Field,
    type FullCombinator,
    type FullOperator,
    type Translations,
  } from "svelte-querybuilder";
  import "svelte-querybuilder/dist/query-builder.css";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import PracticeQueryBuilderAction from "./PracticeQueryBuilderAction.svelte";
  import PracticeQueryBuilderShiftActions from "./PracticeQueryBuilderShiftActions.svelte";
  import PracticeQueryBuilderUndoRedo from "./PracticeQueryBuilderUndoRedo.svelte";
  import {
    practiceFilterToCondition,
    type PracticeFilter,
    type PracticeFilterField,
    type PracticeFilterGroup,
    type PracticeFilterRule,
    type PracticeFilterValue,
  } from "@/question-bank/core/scope";
  import {
    practiceFilterToQuery,
    queryToPracticeFilter,
    type PracticeQueryGroup,
  } from "./practice-querybuilder-adapter";

  export let label: (key: string, fallback: string) => string;
  export let filter: PracticeFilter = "all";

  let sourceFilter: PracticeFilter = filter;
  let editorQuery: PracticeQueryGroup = practiceFilterToQuery(filter);
  let dialogOpen = false;
  let fields: Field[] = [];
  let operators: FullOperator[] = [];
  let combinators: FullCombinator[] = [];
  let translations: Partial<Translations> = {};

  function optionLabel(field: PracticeFilterField, value: unknown): string {
    const yes = value === "yes";
    const labels: Record<PracticeFilterField, [string, string]> = {
      attempted: [label("attemptedStatusYes", "Attempted"), label("attemptedStatusNo", "Unattempted")],
      wrong: [label("wrongStatusYes", "Wrong"), label("wrongStatusNo", "Not wrong")],
      review: [label("reviewStatusYes", "Needs review"), label("reviewStatusNo", "Does not need review")],
      due: [label("dueStatusYes", "Due"), label("dueStatusNo", "Not due")],
      bookmarked: [label("bookmarkedStatusYes", "Bookmarked"), label("bookmarkedStatusNo", "Not bookmarked")],
    };
    return labels[field][yes ? 0 : 1];
  }

  function fieldDefinition(name: PracticeFilterField, fieldLabel: string): Field {
    return {
      name,
      label: fieldLabel,
      valueEditorType: "select",
      values: (["yes", "no"] as PracticeFilterValue[]).map((value) => ({
        name: value,
        label: optionLabel(name, value),
      })),
      defaultOperator: "equal",
      defaultValue: "yes",
    };
  }

  $: fields = [
    fieldDefinition("attempted", label("attemptedStatus", "Attempt status")),
    fieldDefinition("wrong", label("wrongStatus", "Wrong-answer status")),
    fieldDefinition("review", label("reviewStatus", "Review status")),
    fieldDefinition("due", label("dueStatus", "Due status")),
    fieldDefinition("bookmarked", label("bookmarkedStatus", "Bookmark status")),
  ];

  $: operators = [
    { name: "equal", value: "equal", label: label("conditionEqual", "equals") },
    { name: "notEqual", value: "notEqual", label: label("conditionNotEqual", "does not equal") },
  ];

  $: combinators = [
    { name: "and", value: "and", label: label("conditionAnd", "and") },
    { name: "or", value: "or", label: label("conditionOr", "or") },
  ];

  $: translations = {
    fields: { title: label("filter", "Field") },
    operators: { title: label("conditionEqual", "Operator") },
    values: { title: label("selectConditionValue", "Value") },
    value: { title: label("selectConditionValue", "Value") },
    combinators: { title: label("conditionAnd", "Combinator") },
    addRule: {
      label: label("addCondition", "Add condition"),
      title: label("addCondition", "Add condition"),
    },
    addGroup: {
      label: label("addConditionGroup", "Add group"),
      title: label("addConditionGroup", "Add group"),
    },
    removeRule: {
      label: label("deleteCondition", "Delete"),
      title: label("deleteCondition", "Delete condition"),
    },
    removeGroup: {
      label: label("deleteCondition", "Delete"),
      title: label("deleteCondition", "Delete group"),
    },
    cloneRule: { label: label("cloneCondition", "Clone"), title: label("cloneCondition", "Clone condition") },
    cloneRuleGroup: { label: label("cloneConditionGroup", "Clone"), title: label("cloneConditionGroup", "Clone group") },
    lockRule: { label: label("lockCondition", "Lock"), title: label("lockCondition", "Lock condition") },
    lockGroup: { label: label("lockConditionGroup", "Lock"), title: label("lockConditionGroup", "Lock group") },
    lockRuleDisabled: { label: label("unlockCondition", "Unlock"), title: label("unlockCondition", "Unlock condition") },
    lockGroupDisabled: { label: label("unlockConditionGroup", "Unlock"), title: label("unlockConditionGroup", "Unlock group") },
    shiftActions: { shiftUp: label("moveConditionUp", "Move up"), shiftDown: label("moveConditionDown", "Move down") },
    undoRedoActions: { undo: label("undoCondition", "Undo"), redo: label("redoCondition", "Redo") },
  };

  $: if (filter !== sourceFilter) {
    sourceFilter = filter;
    if (!dialogOpen) editorQuery = practiceFilterToQuery(filter);
  }

  function clearFilter(): void {
    editorQuery = practiceFilterToQuery("all");
    if (!dialogOpen) {
      sourceFilter = queryToPracticeFilter(editorQuery);
      filter = sourceFilter;
    }
  }

  function openEditor(): void {
    editorQuery = practiceFilterToQuery(filter);
    dialogOpen = true;
  }

  function cancelEditor(): void {
    editorQuery = practiceFilterToQuery(filter);
    dialogOpen = false;
  }

  function applyEditor(): void {
    const next = queryToPracticeFilter(editorQuery);
    sourceFilter = next;
    filter = next;
    editorQuery = practiceFilterToQuery(next);
    dialogOpen = false;
  }

  function groupEntries(group: PracticeQueryGroup, path = ""): Array<{ path: string; group: PracticeQueryGroup }> {
    const entries = [{ path, group }];
    group.rules.forEach((rule, index) => {
      if (typeof rule === "object" && rule !== null && "rules" in rule) {
        entries.push(...groupEntries(rule, path ? `${path}.${index}` : String(index)));
      }
    });
    return entries;
  }

  function renameGroup(path: string, name: string): void {
    const segments = path ? path.split(".").map(Number) : [];
    const update = (group: PracticeQueryGroup, depth: number): PracticeQueryGroup => {
      if (depth === segments.length) {
        const trimmed = name.trim();
        const { name: _discarded, ...rest } = group;
        return trimmed ? { ...group, name: trimmed } : rest;
      }
      const index = segments[depth];
      return {
        ...group,
        rules: group.rules.map((rule, ruleIndex) =>
          ruleIndex === index && typeof rule === "object" && rule !== null && "rules" in rule ? update(rule, depth + 1) : rule) as PracticeQueryGroup["rules"],
      };
    };
    editorQuery = update(editorQuery, 0);
  }

  function updateGroupNameFromEvent(path: string, event: Event): void {
    renameGroup(path, (event.currentTarget as HTMLInputElement).value);
  }

  function countRules(value: { rules?: unknown[] }): number {
    return (value.rules ?? []).reduce<number>((total, rule) => {
      if (typeof rule !== "object" || rule === null) return total;
      const nested = typeof rule === "object" && rule !== null && "rules" in rule;
      return total + (nested ? countRules(rule as { rules?: unknown[] }) : 1);
    }, 0);
  }

  function operatorLabel(operator: string | undefined): string {
    const labels: Record<string, string> = {
      equal: label("conditionEqual", "equals"),
      notEqual: label("conditionNotEqual", "does not equal"),
      greater: label("conditionGreater", "greater than"),
      greaterOrEqual: label("conditionGreaterOrEqual", "greater than or equal to"),
      less: label("conditionLess", "less than"),
      lessOrEqual: label("conditionLessOrEqual", "less than or equal to"),
    };
    return labels[operator ?? "equal"] ?? labels.equal;
  }

  function formatCondition(node: PracticeFilterRule | PracticeFilterGroup, nested = false): string {
    if ("rules" in node) {
      if (node.name) return node.name;
      if (!node.rules.length) return label("allQuestions", "All questions");
      const connectors = node.rules.slice(0, -1).map((_, index) => node.combinators?.[index] ?? node.glue);
      const text = node.rules.map((rule, index) => {
        const child = formatCondition(rule, true);
        return index === 0 ? child : `${connectors[index - 1] === "or" ? label("conditionOr", "or") : label("conditionAnd", "and")} ${child}`;
      }).join(" ");
      const negated = node.not ? `${label("conditionNot", "not")} (${text})` : text;
      return nested && node.rules.length > 1 ? `(${negated})` : negated;
    }

    const fieldLabel = fields.find((field) => field.name === node.field)?.label ?? node.field;
    const values = node.includes?.length
      ? node.includes.map((value) => optionLabel(node.field, value)).join(", ")
      : node.value === undefined
        ? ""
        : optionLabel(node.field, node.value);
    if (node.includes?.length) return [fieldLabel, label("conditionIn", "in"), values].join(" ");
    if ((node.filter ?? "equal") === "equal" && values) return values;
    return [fieldLabel, operatorLabel(node.filter), values].filter(Boolean).join(" ");
  }

  function filterSummary(value: PracticeFilter): string {
    const condition = practiceFilterToCondition(value);
    return condition.rules.length ? formatCondition(condition) : label("allQuestions", "All questions");
  }
</script>

<div class="practice-condition-editor" data-testid="practice-condition-editor">
  <div class="condition-summary-row">
    <Button variant="ghost" class="condition-summary-trigger" title={filterSummary(filter)} aria-label={filterSummary(filter)} onclick={openEditor}>
      <span class="condition-summary-icon" aria-hidden="true"><SlidersHorizontal size={16} /></span>
      <span class="condition-summary-copy">
        <strong>{countRules(practiceFilterToCondition(filter)) ? label("editCondition", "Edit conditions") : label("addCondition", "Add condition")}</strong>
        <small>{filterSummary(filter)}</small>
      </span>
    </Button>
    <Button
      variant="ghost"
      size="icon-sm"
      title={label("clearConditions", "Clear conditions")}
      aria-label={label("clearConditions", "Clear conditions")}
      disabled={!countRules(practiceFilterToCondition(filter))}
      onclick={clearFilter}
    >
      <RotateCcw aria-hidden="true" />
    </Button>
  </div>

  {#if dialogOpen}
    <div class="condition-dialog-scrim" onclick={cancelEditor} aria-hidden="true"></div>
    <div class="condition-dialog" role="dialog" aria-modal="true" aria-labelledby="condition-dialog-title">
      <header class="condition-dialog-header">
        <div>
          <span class="condition-dialog-kicker">{label("filter", "Question filter")}</span>
          <strong id="condition-dialog-title">{label("conditionDialogTitle", "Edit question conditions")}</strong>
        </div>
        <Button variant="ghost" size="icon" onclick={cancelEditor} aria-label={label("close", "Close")}>
          <X size={17} aria-hidden="true" />
        </Button>
      </header>

      <div class="condition-group-names">
        <div class="condition-group-names-heading">
          <strong>{label("conditionGroupName", "Condition group names")}</strong>
          <small>{label("conditionGroupNameDescription", "Optional names make saved groups easier to recognize")}</small>
        </div>
        {#each groupEntries(editorQuery) as entry, index (`${entry.path}-${index}`)}
          <div class="condition-group-name-row">
            <span>{entry.path ? `${label("conditionGroup", "Group")} ${index}` : label("conditionRootGroup", "All conditions")}</span>
            <Input
              value={entry.group.name ?? ""}
              placeholder={label("conditionGroupNamePlaceholder", "Name this group")}
              aria-label={`${label("conditionGroup", "Group")} ${index} ${label("conditionGroupName", "name")}`}
              oninput={(event) => updateGroupNameFromEvent(entry.path, event)}
            />
          </div>
        {/each}
      </div>

      <div class="condition-dialog-body">
        <div class="query-builder-theme">
          <QueryBuilder
            {fields}
            {operators}
            {combinators}
            {translations}
            bind:query={editorQuery}
            getDefaultField="attempted"
            getDefaultOperator="equal"
            getDefaultValue={() => "yes"}
            maxLevels={4}
            resetOnFieldChange
            controlElements={{
              actionElement: PracticeQueryBuilderAction,
              shiftActions: PracticeQueryBuilderShiftActions,
              undoRedoActions: PracticeQueryBuilderUndoRedo,
            }}
            showNotToggle
            showCloneButtons
            showLockButtons
            showShiftActions
            showUndoRedo
          />
        </div>
      </div>

      <footer class="condition-dialog-footer">
        <Button variant="ghost" size="sm" onclick={clearFilter}>
          <RotateCcw size={14} aria-hidden="true" />
          <span>{label("clearConditions", "Clear conditions")}</span>
        </Button>
        <div class="condition-dialog-footer-actions">
          <Button variant="outline" size="sm" onclick={cancelEditor}>{label("cancel", "Cancel")}</Button>
          <Button size="sm" onclick={applyEditor}>
            <Check size={14} aria-hidden="true" />
            <span>{label("apply", "Apply")}</span>
          </Button>
        </div>
      </footer>
    </div>
  {/if}
</div>

<style>
  .practice-condition-editor {
    min-width: 0;
    padding: 0;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: var(--b3-theme-background);
  }

  .condition-summary-row {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 7px 5px 10px;
  }

  :global(.condition-summary-trigger) {
    min-width: 0;
    flex: 1;
    justify-content: flex-start;
    gap: 9px;
    padding: 5px 7px;
    border: 0;
    border-radius: 5px;
    color: var(--b3-theme-on-background);
    background: transparent;
    text-align: left;
    cursor: pointer;
    white-space: normal;
  }

  :global(.condition-summary-trigger:hover) {
    background: var(--b3-list-hover);
  }

  .condition-summary-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    display: grid;
    place-items: center;
    border-radius: 5px;
    color: var(--b3-theme-primary);
    background: color-mix(in srgb, var(--b3-theme-primary) 13%, var(--b3-theme-background));
  }

  .condition-summary-copy {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .condition-summary-copy strong {
    font-size: 12px;
    font-weight: 600;
  }

  .condition-summary-copy small {
    overflow: hidden;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .condition-summary-row :global(button) {
    flex: 0 0 auto;
  }

  .condition-dialog-scrim {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgb(0 0 0 / 42%);
  }

  .condition-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    width: min(94vw, 760px);
    max-height: min(86vh, 700px);
    overflow: hidden;
    transform: translate(-50%, -50%);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
    box-shadow: var(--b3-dialog-shadow, 0 14px 36px rgb(0 0 0 / 25%));
  }

  .condition-dialog-header,
  .condition-dialog-footer {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 14px;
  }

  .condition-dialog-header {
    border-bottom: 1px solid var(--b3-border-color);
  }

  .condition-dialog-header > div,
  .condition-group-names-heading {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .condition-dialog-kicker {
    color: var(--b3-theme-on-surface);
    font-size: 10px;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .condition-dialog-header strong {
    font-size: 14px;
    font-weight: 650;
  }

  .condition-group-names {
    display: grid;
    gap: 7px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 38%, transparent);
  }

  .condition-group-names-heading strong {
    font-size: 12px;
    font-weight: 650;
  }

  .condition-group-names-heading small,
  .condition-group-name-row {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .condition-group-name-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.32fr) minmax(0, 1fr);
    align-items: center;
    gap: 9px;
  }

  .condition-group-name-row :global(input) {
    min-width: 0;
    height: 30px;
  }

  .condition-dialog-body {
    min-height: 0;
    overflow: auto;
    padding: 12px 14px;
  }

  .condition-dialog-footer {
    flex-wrap: wrap;
    border-top: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 55%, transparent);
  }

  .condition-dialog-footer-actions {
    display: flex;
    gap: 7px;
  }

  .query-builder-theme {
    --rqb-spacing: 7px;
    --rqb-border-width: 1px;
    --rqb-branch-indent: 9px;
    --rqb-branch-width: 1px;
    --rqb-border-color: var(--b3-border-color);
    --rqb-branch-color: var(--b3-border-color);
    --rqb-border-radius: 6px;
    font-family: var(--b3-font-family);
    font-size: 12px;
  }

  .query-builder-theme :global(.queryBuilder) {
    width: 100%;
  }

  .query-builder-theme :global(.ruleGroup) {
    border-style: solid;
    border-color: var(--b3-border-color);
    border-radius: 6px;
    background: color-mix(in srgb, var(--b3-theme-surface) 42%, transparent);
  }

  .query-builder-theme :global(.ruleGroup .ruleGroup) {
    background: var(--b3-theme-background);
  }

  .query-builder-theme :global(.ruleGroup-header),
  .query-builder-theme :global(.rule) {
    min-width: 0;
    flex-wrap: wrap;
  }

  .query-builder-theme :global(.rule) {
    padding: 7px;
    border: 1px solid var(--b3-border-color);
    border-radius: 5px;
    background: var(--b3-theme-background);
  }

  .query-builder-theme :global(select),
  .query-builder-theme :global(input:not([type="checkbox"])),
  .query-builder-theme :global(button) {
    min-height: 30px;
    border: 1px solid var(--b3-border-color);
    border-radius: 5px;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
    font: inherit;
  }

  .query-builder-theme :global(select),
  .query-builder-theme :global(input:not([type="checkbox"])) {
    min-width: 118px;
    padding: 4px 8px;
  }

  .query-builder-theme :global(.rule-fields) {
    flex: 1 1 160px;
  }

  .query-builder-theme :global(.rule-operators) {
    flex: 1 1 140px;
  }

  .query-builder-theme :global(.rule-value) {
    flex: 1 1 130px;
  }

  .query-builder-theme :global(button) {
    padding: 4px 9px;
    cursor: pointer;
  }

  .query-builder-theme :global(button:hover) {
    background: var(--b3-list-hover);
  }

  .query-builder-theme :global(.ruleGroup-addRule),
  .query-builder-theme :global(.ruleGroup-addGroup) {
    color: var(--b3-theme-primary);
    border-color: color-mix(in srgb, var(--b3-theme-primary) 48%, var(--b3-border-color));
  }

  .query-builder-theme :global(.rule-remove),
  .query-builder-theme :global(.ruleGroup-remove) {
    margin-left: auto;
    color: var(--b3-theme-error, #d23f31);
  }

  .query-builder-theme :global(select:focus-visible),
  .query-builder-theme :global(input:focus-visible),
  .query-builder-theme :global(button:focus-visible) {
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    outline-offset: 1px;
  }

  @media (max-width: 620px) {
    .condition-dialog {
      width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
    }

    .condition-dialog-body {
      padding: 8px;
    }

    .condition-group-name-row {
      grid-template-columns: 1fr;
      gap: 4px;
    }

    .query-builder-theme :global(.ruleGroup-body) {
      margin-left: 6px;
    }

    .query-builder-theme :global(.rule-remove) {
      margin-left: 0;
    }
  }
</style>
