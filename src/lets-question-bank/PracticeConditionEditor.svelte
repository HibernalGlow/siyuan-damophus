<script lang="ts">
  import { onMount } from "svelte";
  import { Check, RotateCcw, Save, SlidersHorizontal, Trash2, X } from "lucide-svelte";
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
  import PracticeQueryBuilderValueSelector from "./PracticeQueryBuilderValueSelector.svelte";
  import type { PracticeFilterPreset } from "./practice-preferences";
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
  export let presets: PracticeFilterPreset[] = [];
  export let activePresetId: string | undefined = undefined;

  let sourceFilter: PracticeFilter = filter;
  let editorQuery: PracticeQueryGroup = practiceFilterToQuery(filter);
  let dialogOpen = false;
  let newConditionName = "";
  let fields: Field[] = [];
  let operators: FullOperator[] = [];
  let combinators: FullCombinator[] = [];
  let translations: Partial<Translations> = {};
  let hostElement: HTMLElement;
  let dockCompact = false;
  let dockDialogStyle = "";

  function updateDockLayout(): void {
    if (!hostElement) return;
    const rect = hostElement.getBoundingClientRect();
    dockCompact = rect.width < 620;
    dockDialogStyle = dockCompact
      ? `left: ${Math.max(8, rect.left + 8)}px; top: 8px; width: ${Math.max(280, rect.width - 16)}px; max-height: calc(100dvh - 16px); transform: none;`
      : "";
  }

  onMount(() => {
    const observer = new ResizeObserver(updateDockLayout);
    if (hostElement) observer.observe(hostElement);
    updateDockLayout();
    window.addEventListener("resize", updateDockLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateDockLayout);
    };
  });

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
    activePresetId = undefined;
    if (!dialogOpen) {
      sourceFilter = queryToPracticeFilter(editorQuery);
      filter = sourceFilter;
    }
  }

  function openEditor(): void {
    editorQuery = practiceFilterToQuery(filter);
    dialogOpen = true;
  }

  /** Entry point for the launcher's "new condition" chip. */
  export function openNewCondition(): void {
    newConditionName = "";
    openEditor();
  }

  function cancelEditor(): void {
    editorQuery = practiceFilterToQuery(filter);
    newConditionName = "";
    dialogOpen = false;
  }

  function applyEditor(): void {
    const next = queryToPracticeFilter(editorQuery);
    sourceFilter = next;
    filter = next;
    editorQuery = practiceFilterToQuery(next);
    newConditionName = "";
    dialogOpen = false;
  }

  // ---- Named condition library (saved filter presets) ----

  function selectCondition(id: string): void {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    activePresetId = preset.id;
    filter = preset.filter;
    sourceFilter = preset.filter;
    editorQuery = practiceFilterToQuery(preset.filter);
  }

  function renameCondition(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    presets = presets.map((preset) => (preset.id === id ? { ...preset, name: trimmed } : preset));
  }

  function deleteCondition(id: string): void {
    presets = presets.filter((preset) => preset.id !== id);
    if (activePresetId === id) activePresetId = undefined;
  }

  function saveCondition(): void {
    const name = newConditionName.trim();
    if (!name) return;
    const nextFilter = queryToPracticeFilter(editorQuery);
    // Saving an existing name updates that condition instead of duplicating it.
    const existing = presets.find((preset) => preset.name === name);
    if (existing) {
      presets = presets.map((preset) => (preset.id === existing.id ? { ...preset, filter: nextFilter } : preset));
      activePresetId = existing.id;
    } else {
      const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `preset-${Date.now()}`;
      presets = [...presets, { id, name, filter: nextFilter }];
      activePresetId = id;
    }
    sourceFilter = nextFilter;
    filter = nextFilter;
    newConditionName = "";
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

  $: activePresetName = presets.find((preset) => preset.id === activePresetId)?.name;
  $: hasConditionRules = countRules(practiceFilterToCondition(filter)) > 0;
  $: summaryTitle = activePresetName
    ?? (hasConditionRules ? label("editCondition", "编辑条件") : label("addCondition", "添加条件"));
</script>

<div bind:this={hostElement} class:condition-editor-compact={dockCompact} class="practice-condition-editor" data-testid="practice-condition-editor">
  <div class="condition-summary-row">
    <Button variant="ghost" class="condition-summary-trigger" title={filterSummary(filter)} aria-label={filterSummary(filter)} onclick={openEditor}>
      <span class="condition-summary-icon" aria-hidden="true"><SlidersHorizontal size={16} /></span>
      <span class="condition-summary-copy">
        <strong data-testid="condition-summary-title">{summaryTitle}</strong>
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
    <div class="condition-dialog" style={dockDialogStyle} role="dialog" aria-modal="true" aria-labelledby="condition-dialog-title">
      <header class="condition-dialog-header">
        <div>
          <span class="condition-dialog-kicker">{label("filter", "Question filter")}</span>
          <strong id="condition-dialog-title">{label("conditionDialogTitle", "Edit question conditions")}</strong>
        </div>
        <Button variant="ghost" size="icon" onclick={cancelEditor} aria-label={label("close", "Close")}>
          <X size={17} aria-hidden="true" />
        </Button>
      </header>

      <div class="condition-library" data-testid="condition-library">
        <div class="condition-library-head">
          <strong>{label("filterConditions", "筛选条件")}</strong>
          <small>{label("filterConditionsHint", "点击应用；名称可直接修改，不需要的可删除")}</small>
        </div>
        {#if presets.length === 0}
          <p class="condition-library-empty">{label("filterConditionsEmpty", "还没有保存的条件：先编辑规则，命名保存后即可一键复用。")}</p>
        {/if}
        {#each presets as preset (preset.id)}
          <div class="condition-library-row" class:active={preset.id === activePresetId} data-testid="filter-condition-row">
            <button
              type="button"
              class="condition-library-select"
              aria-pressed={preset.id === activePresetId}
              title={label("apply", "应用")}
              aria-label={`${label("apply", "应用")} ${preset.name}`}
              onclick={() => selectCondition(preset.id)}
            >
              {#if preset.id === activePresetId}
                <Check size={14} aria-hidden="true" />
              {:else}
                <span class="condition-library-dot" aria-hidden="true"></span>
              {/if}
            </button>
            <Input
              data-testid="filter-condition-name"
              value={preset.name}
              placeholder={label("filterConditionNamePlaceholder", "条件名称")}
              aria-label={`${label("renameFilterCondition", "重命名条件")} ${preset.name}`}
              onfocus={() => selectCondition(preset.id)}
              oninput={(event) => renameCondition(preset.id, (event.currentTarget as HTMLInputElement).value)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              title={label("deleteFilterPreset", "删除筛选预设")}
              aria-label={`${label("deleteFilterPreset", "删除筛选预设")} ${preset.name}`}
              onclick={() => deleteCondition(preset.id)}
            ><Trash2 size={14} aria-hidden="true" /></Button>
          </div>
        {/each}
        <div class="condition-library-save">
          <Input
            data-testid="filter-condition-new-name"
            bind:value={newConditionName}
            placeholder={label("filterConditionNamePlaceholder", "命名当前条件")}
            aria-label={label("filterConditionNamePlaceholder", "命名当前条件")}
          />
          <Button
            variant="outline"
            size="sm"
            data-testid="filter-condition-save"
            disabled={!newConditionName.trim()}
            onclick={saveCondition}
          >
            <Save size={14} aria-hidden="true" />
            <span>{label("saveFilterCondition", "保存条件")}</span>
          </Button>
        </div>
      </div>

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
              combinatorSelector: PracticeQueryBuilderValueSelector,
              fieldSelector: PracticeQueryBuilderValueSelector,
              operatorSelector: PracticeQueryBuilderValueSelector,
              shiftActions: PracticeQueryBuilderShiftActions,
              undoRedoActions: PracticeQueryBuilderUndoRedo,
              valueSourceSelector: PracticeQueryBuilderValueSelector,
              valueSelector: PracticeQueryBuilderValueSelector,
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

  .condition-editor-compact .condition-dialog {
    border-radius: 6px;
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

  .condition-library {
    display: grid;
    gap: 7px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 38%, transparent);
  }

  .condition-library-head {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .condition-library-head strong {
    font-size: 12px;
    font-weight: 650;
  }

  .condition-library-head small {
    color: var(--b3-theme-on-surface);
    font-size: 11px;
  }

  .condition-library-empty {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    line-height: 1.5;
  }

  .condition-library-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 5px;
    padding: 3px 4px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: var(--b3-theme-background);
  }

  .condition-library-row.active {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 52%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
  }

  .condition-library-select {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--b3-theme-primary);
    cursor: pointer;
  }

  .condition-library-select:hover { background: var(--b3-list-hover); }

  .condition-library-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid var(--b3-border-color);
  }

  .condition-library-row.active .condition-library-dot { border-color: var(--b3-theme-primary); }

  .condition-library-row :global(input) {
    min-width: 0;
    height: 30px;
  }

  .condition-library-row > :global(button:last-child) { color: var(--b3-theme-on-surface); }
  .condition-library-row > :global(button:last-child:hover) { color: var(--b3-theme-error, #d23f31); }

  .condition-library-save {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .condition-library-save :global(input) {
    min-width: 0;
    flex: 1 1 auto;
    height: 32px;
  }

  .condition-library-save :global(button) { flex: 0 0 auto; }

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

  .query-builder-theme :global([data-slot="select-trigger"]),
  .query-builder-theme :global(input:not([type="checkbox"])),
  .query-builder-theme :global(button) {
    min-height: 30px;
    border: 1px solid var(--b3-border-color);
    border-radius: 5px;
    color: var(--b3-theme-on-background);
    background: var(--b3-theme-background);
    font: inherit;
  }

  .query-builder-theme :global([data-slot="select-trigger"]) {
    min-width: 0;
    gap: 6px;
    padding-right: 7px;
    text-align: left;
  }

  .query-builder-theme :global([data-slot="select-trigger"] > span) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .query-builder-theme :global([data-slot="select-trigger"] > svg:first-child) {
    flex: 0 0 auto;
    color: var(--b3-theme-primary);
  }

  .query-builder-theme :global([data-slot="select-item"] > span) {
    min-width: 0;
  }

  .query-builder-theme :global([data-slot="select-trigger"]),
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

  .query-builder-theme :global(.rule-fields),
  .query-builder-theme :global(.rule-operators),
  .query-builder-theme :global(.rule-value) {
    min-width: 0;
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

  .query-builder-theme :global([data-slot="select-trigger"]:focus-visible),
  .query-builder-theme :global(input:focus-visible),
  .query-builder-theme :global(button:focus-visible) {
    outline: 2px solid color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
    outline-offset: 1px;
  }

  @container (max-width: 700px) {
    .practice-condition-editor {
      border-radius: 10px;
    }

    .condition-summary-row {
      min-height: 52px;
    }
  }

  @media (max-width: 640px) {
    .condition-dialog {
      width: calc(100vw - 20px);
      max-height: calc(100dvh - 20px);
      border-radius: 7px;
    }

    .condition-dialog-body {
      padding: 9px;
    }

    .query-builder-theme :global(.rule) {
      display: grid;
      grid-template-columns: 28px minmax(0, 1fr) 28px;
      gap: 6px;
      align-items: stretch;
    }

    .query-builder-theme :global(.rule-fields),
    .query-builder-theme :global(.rule-operators),
    .query-builder-theme :global(.rule-value) {
      width: 100%;
      min-height: 34px;
    }

    .query-builder-theme :global(.rule-fields) {
      grid-column: 2 / 4;
    }

    .query-builder-theme :global(.rule-operators) {
      grid-column: 2;
    }

    .query-builder-theme :global(.rule-value) {
      grid-column: 2 / 4;
    }

    .query-builder-theme :global(.rule-cloneRule),
    .query-builder-theme :global(.rule-lock),
    .query-builder-theme :global(.rule-remove) {
      min-height: 32px;
      padding: 4px;
    }

    .query-builder-theme :global(.shiftActions) {
      grid-column: 1;
      grid-row: 1 / span 2;
      display: flex;
      flex-direction: column;
    }

    .query-builder-theme :global(.rule-cloneRule) {
      grid-column: 1;
      grid-row: 3;
    }

    .query-builder-theme :global(.rule-lock) {
      grid-column: 2;
      grid-row: 3;
      width: 100%;
    }

    .query-builder-theme :global(.rule-remove) {
      grid-column: 3;
      grid-row: 3;
    }
  }

  @media (max-width: 620px) {
    .condition-dialog {
      width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
    }

    .condition-dialog-body {
      padding: 8px;
    }

    .condition-library {
      gap: 6px;
      padding: 9px 10px;
    }

    .condition-library-save :global(button) { padding-inline: 10px; }

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
