<script lang="ts">
  import { RotateCcw } from "lucide-svelte";
  import { Locale } from "@svar-ui/svelte-core";
  import {
    FilterBuilder,
    Willow,
  } from "@svar-ui/svelte-filter";
  import { Button } from "@/components/ui/button";
  import {
    normalizePracticeFilter,
    practiceFilterToCondition,
    type PracticeFilter,
    type PracticeFilterField,
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
    const next = normalizePracticeFilter(event.value);
    if (typeof next === "string") return;
    editorValue = next;
    sourceFilter = next;
    filter = next;
  }

  function clearFilter(): void {
    const next = practiceFilterToCondition("all");
    editorValue = next;
    sourceFilter = next;
    filter = next;
  }
</script>

<div class="practice-condition-editor" data-testid="practice-condition-editor">
  <div class="condition-editor-actions">
    <Button
      variant="ghost"
      size="icon-sm"
      title={label("clearConditions", "Clear conditions")}
      aria-label={label("clearConditions", "Clear conditions")}
      disabled={!editorValue.rules?.length}
      onclick={clearFilter}
    >
      <RotateCcw aria-hidden="true" />
    </Button>
  </div>
  <Locale {words}>
    <Willow fonts={false}>
      <FilterBuilder
        type="list"
        value={editorValue}
        {fields}
        {options}
        onchange={changeFilter}
      />
    </Willow>
  </Locale>
</div>

<style>
  .practice-condition-editor {
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    background: color-mix(in srgb, var(--b3-theme-surface) 55%, transparent);
  }

  .condition-editor-actions {
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .condition-editor-actions :global(button) {
    width: 28px;
    height: 28px;
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
    .practice-condition-editor {
      padding: 7px;
    }

    .practice-condition-editor :global(.wx-group.wx-inner.wx-list) {
      margin-left: 6px;
      padding-left: 5px;
    }
  }
</style>
