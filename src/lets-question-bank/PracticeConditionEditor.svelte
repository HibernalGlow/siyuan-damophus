<script lang="ts">
  import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-svelte";
  import { Locale } from "@svar-ui/svelte-core";
  import {
    FilterBuilder,
    Willow,
  } from "@svar-ui/svelte-filter";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import {
    normalizePracticeFilter,
    practiceFilterToCondition,
    type PracticeFilter,
    type PracticeFilterField,
    type PracticeFilterGroup,
    type PracticeFilterRule,
    type PracticeFilterValue,
  } from "@/question-bank/core/scope";

  export let label: (key: string, fallback: string) => string;
  export let filter: PracticeFilter = "all";

  const options: Record<PracticeFilterField, PracticeFilterValue[]> = {
    attempted: ["yes", "no"],
    wrong: ["yes", "no"],
    review: ["yes", "no"],
    due: ["yes", "no"],
    bookmarked: ["yes", "no"],
  };

  let sourceFilter: PracticeFilter = filter;
  let editorValue = practiceFilterToCondition(filter);
  let groupEditorValue = practiceFilterToCondition(filter);
  let dialogOpen = false;
  let filterApi: { getValue: () => unknown } | undefined;
  let fields: Array<{
    id: PracticeFilterField;
    label: string;
    type: "tuple";
    format: (value: string | number | Date) => string;
  }> = [];
  let words: Record<string, unknown> = {};

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

  $: fields = [
    { id: "attempted", label: label("attemptedStatus", "Attempt status"), type: "tuple", format: (value) => optionLabel("attempted", value) },
    { id: "wrong", label: label("wrongStatus", "Wrong-answer status"), type: "tuple", format: (value) => optionLabel("wrong", value) },
    { id: "review", label: label("reviewStatus", "Review status"), type: "tuple", format: (value) => optionLabel("review", value) },
    { id: "due", label: label("dueStatus", "Due status"), type: "tuple", format: (value) => optionLabel("due", value) },
    { id: "bookmarked", label: label("bookmarkedStatus", "Bookmark status"), type: "tuple", format: (value) => optionLabel("bookmarked", value) },
  ];

  $: words = {
    filter: {
      "Add filter": label("addCondition", "Add condition"),
      "Add group": label("addConditionGroup", "Add group"),
      Edit: label("editCondition", "Edit"),
      Delete: label("deleteCondition", "Delete"),
      "Select all": label("selectAll", "Select all"),
      "Unselect all": label("clearSelection", "Clear selection"),
      Cancel: label("cancel", "Cancel"),
      Apply: label("apply", "Apply"),
      and: label("conditionAnd", "and"),
      or: label("conditionOr", "or"),
      in: label("conditionIn", "in"),
      equal: label("conditionEqual", "equals"),
      "not equal": label("conditionNotEqual", "does not equal"),
      greater: label("conditionGreater", "greater than"),
      "greater or equal": label("conditionGreaterOrEqual", "greater than or equal to"),
      less: label("conditionLess", "less than"),
      "less or equal": label("conditionLessOrEqual", "less than or equal to"),
      "Click to select": label("selectConditionValue", "Select a value"),
      None: label("none", "None"),
    },
  };

  $: if (filter !== sourceFilter) {
    sourceFilter = filter;
    editorValue = practiceFilterToCondition(filter);
  }

  function changeFilter(event: { value: unknown }): void {
    // The SVAR store remains authoritative while the dialog is open. Read it on apply
    // so editing a rule does not reinitialize the builder and close its panel.
    void event;
  }

  // SVAR's add button passes the click event as its action payload under Svelte 5.
  // Seed the new rule with a valid field before DataStore normalizes it.
  function initFilter(api: {
    intercept: (
      action: string,
      callback: (params: {
        rule?: {
          field?: PracticeFilterField;
          type?: string;
          filter?: string;
          value?: unknown;
        };
      }) => void,
    ) => void;
    getValue: () => unknown;
    on: (action: string, callback: () => void) => void;
  }): void {
    filterApi = api;

    const syncGroupEditor = () => {
      const next = normalizePracticeFilter(api.getValue());
      if (typeof next !== "string") groupEditorValue = mergeGroupNames(groupEditorValue, next);
    };

    api.intercept("add-rule", (params) => {
      params.rule ??= {};
      const field = params.rule.field ?? fields[0]?.id ?? "attempted";
      params.rule.field = field;
      if (!params.rule.type || params.rule.type === "click") params.rule.type = "tuple";
      if (!params.rule.filter) params.rule.filter = "equal";
      if (params.rule.value === undefined) params.rule.value = options[field][0] ?? "yes";
    });
    api.on("add-group", syncGroupEditor);
    api.on("delete-rule", syncGroupEditor);
  }

  function clearFilter(): void {
    const next = practiceFilterToCondition("all");
    editorValue = next;
    if (!dialogOpen) {
      sourceFilter = next;
      filter = next;
    }
  }

  function openEditor(): void {
    editorValue = practiceFilterToCondition(filter);
    groupEditorValue = editorValue;
    dialogOpen = true;
  }

  function cancelEditor(): void {
    editorValue = practiceFilterToCondition(filter);
    groupEditorValue = editorValue;
    dialogOpen = false;
  }

  function applyEditor(): void {
    const next = normalizePracticeFilter(filterApi?.getValue() ?? editorValue);
    if (typeof next === "string") return;
    const named = mergeGroupNames(groupEditorValue, next);
    sourceFilter = named;
    filter = named;
    editorValue = named;
    dialogOpen = false;
  }

  function mergeGroupNames(source: PracticeFilterGroup, target: PracticeFilterGroup): PracticeFilterGroup {
    return {
      glue: target.glue,
      ...(source.name ? { name: source.name } : {}),
      rules: target.rules.map((rule, index) => {
        const sourceRule = source.rules[index];
        if (!("rules" in rule) || !sourceRule || !("rules" in sourceRule)) return rule;
        return mergeGroupNames(sourceRule, rule);
      }),
    };
  }

  function groupEntries(group: PracticeFilterGroup, path = ""): Array<{ path: string; group: PracticeFilterGroup }> {
    const entries = [{ path, group }];
    group.rules.forEach((rule, index) => {
      if ("rules" in rule) entries.push(...groupEntries(rule, path ? `${path}.${index}` : String(index)));
    });
    return entries;
  }

  function renameGroup(path: string, name: string): void {
    const segments = path ? path.split(".").map(Number) : [];
    const update = (group: PracticeFilterGroup, depth: number): PracticeFilterGroup => {
      if (depth === segments.length) {
        const trimmed = name.trim();
        return trimmed ? { ...group, name: trimmed } : Object.fromEntries(Object.entries(group).filter(([key]) => key !== "name")) as PracticeFilterGroup;
      }
      const index = segments[depth];
      return {
        ...group,
        rules: group.rules.map((rule, ruleIndex) => ruleIndex === index && "rules" in rule ? update(rule, depth + 1) : rule),
      };
    };
    groupEditorValue = update(groupEditorValue, 0);
  }

  function updateGroupNameFromEvent(path: string, event: Event): void {
    renameGroup(path, (event.currentTarget as HTMLInputElement).value);
  }

  function countRules(value: { rules?: unknown[] }): number {
    return (value.rules ?? []).reduce<number>((total, rule) => {
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
      const text = node.rules.map((rule) => formatCondition(rule, true)).join(` ${node.glue === "or" ? label("conditionOr", "or") : label("conditionAnd", "and")} `);
      return nested && node.rules.length > 1 ? `(${text})` : text;
    }

    const fieldLabel = fields.find((field) => field.id === node.field)?.label ?? node.field;
    const values = node.includes?.length
      ? node.includes.map((value) => optionLabel(node.field, value)).join(", ")
      : node.value === undefined
        ? ""
        : optionLabel(node.field, node.value);
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
        {#each groupEntries(groupEditorValue) as entry, index (`${entry.path}-${index}`)}
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
        <Locale {words}>
          <Willow fonts={false}>
            <FilterBuilder
              type="list"
              value={editorValue}
              {fields}
              {options}
              init={initFilter}
              onchange={changeFilter}
            />
          </Willow>
        </Locale>
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
    width: min(94vw, 720px);
    max-height: min(86vh, 680px);
    overflow: hidden;
    transform: translate(-50%, -50%);
    border: 1px solid var(--b3-border-color);
    border-radius: 8px;
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

  .condition-dialog-header > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .condition-dialog-kicker {
    color: var(--b3-theme-on-surface);
    font-size: 10px;
    letter-spacing: 0.04em;
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

  .condition-group-names-heading {
    display: grid;
    gap: 1px;
  }

  .condition-group-names-heading strong {
    font-size: 12px;
    font-weight: 650;
  }

  .condition-group-names-heading small {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .condition-group-name-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.32fr) minmax(0, 1fr);
    align-items: center;
    gap: 9px;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .condition-group-name-row :global(input) {
    min-width: 0;
    height: 30px;
  }

  .condition-dialog-body {
    min-height: 0;
    overflow: auto;
    padding: 10px 14px;
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

  .practice-condition-editor :global(.wx-willow-theme) {
    height: auto !important;
    color: var(--b3-theme-on-background);
    background: transparent;
    --wx-color-primary: var(--b3-theme-primary);
    --wx-color-primary-font: var(--b3-theme-on-primary);
    --wx-color-secondary-font: var(--b3-theme-primary);
    --wx-color-secondary-border: var(--b3-theme-primary);
    --wx-color-font: var(--b3-theme-on-background);
    --wx-color-font-alt: var(--b3-theme-on-surface);
    --wx-background: var(--b3-theme-background);
    --wx-background-alt: var(--b3-theme-surface);
    --wx-background-hover: var(--b3-list-hover);
    --wx-border-color: var(--b3-border-color);
    --wx-font-family: var(--b3-font-family);
    --wx-font-size: 12px;
    --wx-line-height: 18px;
    --wx-button-font-size: 12px;
    --wx-button-height: 30px;
    --wx-button-padding: 4px 10px;
    --wx-input-height: 30px;
    --wx-border-radius: 6px;
    --wx-border: 1px solid var(--b3-border-color);
    --wx-popup-z-index: 10000;
    --wx-filter-value-color: var(--b3-theme-primary);
    --wx-filter-and-background: color-mix(in srgb, var(--b3-theme-primary) 28%, var(--b3-theme-background));
    --wx-filter-or-background: color-mix(in srgb, var(--b3-theme-secondary) 32%, var(--b3-theme-background));
    --wx-filter-and-font-color: var(--b3-theme-on-background);
    --wx-filter-or-font-color: var(--b3-theme-on-background);
  }

  .practice-condition-editor :global(.wx-filter-builder.wx-list) {
    width: 100%;
    max-width: none;
    background: transparent;
  }

  .practice-condition-editor :global(.wx-toolbar.wx-list) {
    display: flex;
    justify-content: flex-start;
  }

  .practice-condition-editor :global(.wx-rule.wx-list) {
    min-height: 40px;
    margin: 7px 0;
    padding: 9px 8px;
    border: 1px solid var(--b3-border-color);
  }

  .practice-condition-editor :global(.wx-group.wx-inner.wx-list) {
    margin-left: 14px;
  }

  .practice-condition-editor :global(.wxi-dots-v::before) {
    content: "\22ee";
    font-size: 18px;
  }

  @container (max-width: 620px) {
    .practice-condition-editor :global(.wx-group.wx-inner.wx-list) {
      margin-left: 6px;
      padding-left: 5px;
    }

    .condition-dialog {
      width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
    }

    .condition-dialog-body {
      padding: 8px;
    }
  }
</style>
