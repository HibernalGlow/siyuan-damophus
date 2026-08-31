<script lang="ts">
  import { onMount } from "svelte";
  import { Check, GitBranch, ListFilter, RotateCcw, Save, Trash2, X } from "lucide-svelte";
  import {
    QueryBuilder,
    type Field,
    type FullCombinator,
    type FullOperator,
    type Translations,
  } from "svelte-querybuilder";
  import "svelte-querybuilder/dist/query-builder.css";
  import "@/styles/query-builder-theme.css";
  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import * as Select from "@/components/ui/select";
  import PracticeQueryBuilderAction from "./PracticeQueryBuilderAction.svelte";
  import PracticeQueryBuilderShiftActions from "./PracticeQueryBuilderShiftActions.svelte";
  import PracticeQueryBuilderUndoRedo from "./PracticeQueryBuilderUndoRedo.svelte";
  import PracticeQueryBuilderValueSelector from "./PracticeQueryBuilderValueSelector.svelte";
  import PracticeRuleGroup from "./PracticeRuleGroup.svelte";
  import ConditionGraph from "@/components/condition-graph/ConditionGraph.svelte";
  import type { PracticeFilterPreset } from "./practice-preferences";
  import type { PracticeFilter, PracticeFilterField, PracticeFilterGroup, PracticeFilterRule, PracticeFilterOperator, PracticeFilterValue } from "@/question-bank/core/scope";
  import {
    practiceFilterToQuery,
    queryToPracticeFilter,
    type PracticeQueryGroup,
  } from "./practice-querybuilder-adapter";
  import { practiceFilterToGraph } from "./practice-condition-graph";

  export let label: (key: string, fallback: string) => string;
  export let filter: PracticeFilter = "all";
  export let presets: PracticeFilterPreset[] = [];
  export let activePresetId: string | undefined = undefined;

  let sourceFilter: PracticeFilter = filter;
  let editorQuery: PracticeQueryGroup = practiceFilterToQuery(filter);
  let dialogOpen = false;
  let newConditionName = "";
  // Set while the switcher pre-filled the name input: saving then updates that
  // condition (rename + filter) instead of creating a copy.
  let nameUpdateTarget: string | undefined = undefined;
  let fields: Field[] = [];
  let operators: FullOperator[] = [];
  let combinators: FullCombinator[] = [];
  let translations: Partial<Translations> = {};
  let hostElement: HTMLElement;
  let dockCompact = false;
  let dockDialogStyle = "";
  let viewMode: "list" | "graph" = "list";
  let selectedGraphPath: number[] | undefined;
  let selectedGraphRule: PracticeFilterRule | undefined;

  function graphRuleAt(path: readonly number[] | undefined): PracticeFilterRule | undefined {
    if (!path) return undefined;
    let group: PracticeFilterGroup = queryToPracticeFilter(editorQuery);
    for (let index = 0; index < path.length; index += 1) {
      const entry = group.rules[path[index]];
      if (!entry) return undefined;
      if (index === path.length - 1) return "rules" in entry ? undefined : entry;
      if (!("rules" in entry)) return undefined;
      group = entry;
    }
    return undefined;
  }

  function updateGraphRule(next: Partial<PracticeFilterRule>): void {
    if (!selectedGraphPath) return;
    const current = queryToPracticeFilter(editorQuery);
    const updateGroup = (group: PracticeFilterGroup, depth: number): PracticeFilterGroup => {
      const index = selectedGraphPath![depth];
      return {
        ...group,
        rules: group.rules.map((entry, entryIndex) => {
          if (entryIndex !== index) return entry;
          if (depth === selectedGraphPath!.length - 1 && !('rules' in entry)) return { ...entry, ...next };
          if ('rules' in entry) return updateGroup(entry, depth + 1);
          return entry;
        }),
      };
    };
    editorQuery = practiceFilterToQuery(updateGroup(current, 0));
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

  $: selectedGraphRule = graphRuleAt(selectedGraphPath);

  $: graphModel = practiceFilterToGraph(queryToPracticeFilter(editorQuery), {
    field: {
      attempted: label("attemptedStatus", "Attempt status"),
      wrong: label("wrongStatus", "Wrong-answer status"),
      review: label("reviewStatus", "Review status"),
      due: label("dueStatus", "Due status"),
      bookmarked: label("bookmarkedStatus", "Bookmark status"),
    },
    operator: {
      equal: label("conditionEqual", "equals"),
      notEqual: label("conditionNotEqual", "does not equal"),
    },
    value: {
      ...Object.fromEntries(([
        ["attempted", "attemptedStatus"],
        ["wrong", "wrongStatus"],
        ["review", "reviewStatus"],
        ["due", "dueStatus"],
        ["bookmarked", "bookmarkedStatus"],
      ] as const).flatMap(([field]) => [
        [`${field}:yes`, optionLabel(field, "yes")],
        [`${field}:no`, optionLabel(field, "no")],
      ])),
      yes: label("yes", "Yes"),
      no: label("no", "No"),
      any: label("allQuestions", "All questions"),
    },
    and: label("conditionAnd", "AND"),
    or: label("conditionOr", "OR"),
    not: label("conditionNot", "NOT"),
    result: label("conditionGraphResult", "Questions"),
    empty: label("conditionGraphEmpty", "All questions"),
  });

  function updateDockLayout(): void {
    if (!hostElement) return;
    const rect = hostElement.getBoundingClientRect();
    // Narrow hosts mean phone-like widths: the dialog docks instead of floating
    // centered. When the host spans the window (a phone viewport) it goes full
    // bleed; inside a narrow DESKTOP dock it must stay inside the panel rect
    // instead of covering the whole app window.
    dockCompact = rect.width < 700;
    if (!dockCompact) {
      dockDialogStyle = "";
      return;
    }
    const spansViewport = window.innerWidth - rect.width < 60;
    if (spansViewport) {
      dockDialogStyle = "left: 0px; top: 0px; width: 100vw; max-height: 100dvh; transform: none;";
      return;
    }
    const top = Math.round(Math.max(0, rect.top));
    dockDialogStyle = `left: ${Math.round(rect.left)}px; top: ${top}px; width: ${Math.round(rect.width)}px; max-height: ${top > 0 ? `calc(100dvh - ${top}px)` : "100dvh"}; transform: none;`;
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
      values: [
        { name: "any", label: label("allQuestions", "全部题") },
        { name: "yes", label: optionLabel(name, "yes") },
        { name: "no", label: optionLabel(name, "no") },
      ],
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

  /** Clears the active filter; also invoked by the launcher's inline reset button. */
  export function clearFilter(): void {
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
    nameUpdateTarget = undefined;
    openEditor();
  }

  /** Entry point for a launcher chip's edit pencil: load the saved rules without applying them. */
  export function openCondition(id: string): void {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    editorQuery = practiceFilterToQuery(preset.filter);
    newConditionName = "";
    nameUpdateTarget = undefined;
    dialogOpen = true;
  }

  /** Visible width (in input "size" units) so name inputs hug their content instead of filling the row. */
  function inputSize(name: string): number {
    let units = 0;
    for (const character of name) units += (character.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
    return Math.min(24, Math.max(4, units + 1));
  }

  function cancelEditor(): void {
    editorQuery = practiceFilterToQuery(filter);
    newConditionName = "";
    nameUpdateTarget = undefined;
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
    if (nameUpdateTarget === id) nameUpdateTarget = undefined;
  }

  function saveCondition(): void {
    const name = newConditionName.trim();
    if (!name) return;
    const nextFilter = queryToPracticeFilter(editorQuery);
    // With a switcher-selected target (mobile), saving renames/updates that
    // condition; otherwise an existing name is updated in place.
    let target = nameUpdateTarget ? presets.find((preset) => preset.id === nameUpdateTarget) : undefined;
    if (!target) target = presets.find((preset) => preset.name === name);
    if (target) {
      presets = presets.map((preset) => (preset.id === target!.id ? { ...preset, name, filter: nextFilter } : preset));
      activePresetId = target.id;
    } else {
      const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `preset-${Date.now()}`;
      presets = [...presets, { id, name, filter: nextFilter }];
      activePresetId = id;
    }
    sourceFilter = nextFilter;
    filter = nextFilter;
    newConditionName = "";
    nameUpdateTarget = undefined;
  }

  /** Switcher pick on compact hosts: apply the condition and aim the name input at it. */
  function selectFromSwitcher(id: string): void {
    selectCondition(id);
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    newConditionName = preset.name;
    nameUpdateTarget = preset.id;
  }

  function onNameInput(event: Event): void {
    newConditionName = (event.currentTarget as HTMLInputElement).value;
    // Clearing the name drops the rename target: the next save starts fresh.
    if (!newConditionName.trim()) nameUpdateTarget = undefined;
  }

  function renameGroupAt(path: readonly number[], name: string): void {
    renameGroup(path.join("."), name);
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

  $: activePresetName = presets.find((preset) => preset.id === activePresetId)?.name;
</script>

<div bind:this={hostElement} class:condition-editor-compact={dockCompact} class="practice-condition-editor" data-testid="practice-condition-editor">
  {#if dialogOpen}
    <div class="condition-dialog-scrim" onclick={cancelEditor} aria-hidden="true"></div>
    <div class="condition-dialog" style={dockDialogStyle} role="dialog" aria-modal="true" aria-labelledby="condition-dialog-title">
      <header class="condition-dialog-header">
        <strong id="condition-dialog-title">{label("conditionDialogTitle", "Edit question conditions")}</strong>
        <Button variant="ghost" size="icon" onclick={cancelEditor} aria-label={label("close", "Close")}>
          <X size={17} aria-hidden="true" />
        </Button>
      </header>

      <div class="condition-library" data-testid="condition-library">
        {#if presets.length === 0}
          <p class="condition-library-empty">{label("filterConditionsEmpty", "还没有保存的条件：先编辑规则，命名保存后即可一键复用。")}</p>
        {/if}
        {#if dockCompact}
          <div class="condition-library-compact">
            <div class="condition-switcher-row">
              <Select.Root
                type="single"
                value={activePresetId ?? ""}
                onValueChange={(value) => { if (value) selectFromSwitcher(value); }}
              >
                <Select.Trigger
                  class="condition-switcher-trigger"
                  data-testid="filter-condition-switcher"
                  aria-label={label("selectFilterCondition", "切换条件")}
                >
                  <span>{activePresetName ?? label("selectFilterCondition", "切换条件")}</span>
                </Select.Trigger>
                <Select.Content portalProps={{ disabled: true }}>
                  {#each presets as preset (preset.id)}
                    <Select.Item value={preset.id} label={preset.name}>{preset.name}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={!activePresetId}
                title={label("deleteFilterPreset", "删除筛选预设")}
                aria-label={label("deleteFilterPreset", "删除筛选预设")}
                onclick={() => { if (activePresetId) deleteCondition(activePresetId); }}
              ><Trash2 size={14} aria-hidden="true" /></Button>
            </div>
            <div class="condition-library-save">
              <Input
                data-testid="filter-condition-new-name"
                value={newConditionName}
                placeholder={label("filterConditionNamePlaceholder", "命名当前条件")}
                aria-label={label("filterConditionNamePlaceholder", "命名当前条件")}
                oninput={onNameInput}
              />
              <Button
                variant="outline"
                size="sm"
                data-testid="filter-condition-save"
                disabled={!newConditionName.trim()}
                onclick={saveCondition}
              >
                <Save size={13} aria-hidden="true" />
                <span>{label("saveFilterCondition", "保存条件")}</span>
              </Button>
            </div>
          </div>
        {:else}
          <div class="condition-library-chips">
            {#each presets as preset (preset.id)}
              <span class="condition-library-chip" class:active={preset.id === activePresetId} data-testid="filter-condition-row">
                <button
                  type="button"
                  class="condition-library-select"
                  aria-pressed={preset.id === activePresetId}
                  title={label("apply", "应用")}
                  aria-label={`${label("apply", "应用")} ${preset.name}`}
                  onclick={() => selectCondition(preset.id)}
                >
                  {#if preset.id === activePresetId}
                    <Check size={12} aria-hidden="true" />
                  {:else}
                    <span class="condition-library-dot" aria-hidden="true"></span>
                  {/if}
                </button>
                <input
                  data-testid="filter-condition-name"
                  value={preset.name}
                  size={inputSize(preset.name)}
                  placeholder={label("filterConditionNamePlaceholder", "条件名称")}
                  aria-label={`${label("renameFilterCondition", "重命名条件")} ${preset.name}`}
                  onfocus={() => selectCondition(preset.id)}
                  oninput={(event) => renameCondition(preset.id, (event.currentTarget as HTMLInputElement).value)}
                />
                <button
                  type="button"
                  class="condition-library-delete"
                  title={label("deleteFilterPreset", "删除筛选预设")}
                  aria-label={`${label("deleteFilterPreset", "删除筛选预设")} ${preset.name}`}
                  onclick={() => deleteCondition(preset.id)}
                ><Trash2 size={12} aria-hidden="true" /></button>
              </span>
            {/each}
            <span class="condition-library-save">
              <Input
                data-testid="filter-condition-new-name"
                value={newConditionName}
                placeholder={label("filterConditionNamePlaceholder", "命名当前条件")}
                aria-label={label("filterConditionNamePlaceholder", "命名当前条件")}
                oninput={onNameInput}
              />
              <Button
                variant="outline"
                size="sm"
                data-testid="filter-condition-save"
                disabled={!newConditionName.trim()}
                onclick={saveCondition}
              >
                <Save size={13} aria-hidden="true" />
                <span>{label("saveFilterCondition", "保存条件")}</span>
              </Button>
            </span>
          </div>
        {/if}
      </div>

      <div class="condition-dialog-body">
        <div class="condition-view-switcher" role="group" aria-label={label("conditionViewMode", "Condition view") }>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            class="condition-view-button"
            aria-pressed={viewMode === "list"}
            data-testid="condition-view-list"
            onclick={() => viewMode = "list"}
          ><ListFilter size={14} aria-hidden="true" /><span>{label("conditionViewList", "List view")}</span></Button>
          <Button
            variant={viewMode === "graph" ? "secondary" : "ghost"}
            size="sm"
            class="condition-view-button"
            aria-pressed={viewMode === "graph"}
            data-testid="condition-view-graph"
            onclick={() => viewMode = "graph"}
          ><GitBranch size={14} aria-hidden="true" /><span>{label("conditionViewGraph", "Graph view")}</span></Button>
        </div>
        {#if viewMode === "graph"}
          <ConditionGraph model={graphModel} height={360} onNodeActivate={graphNodeActivate} />
          {#if selectedGraphRule}
            <div class="condition-graph-inspector" data-testid="condition-graph-inspector">
              <strong>{label("conditionEditNode", "Edit condition")}</strong>
              <select aria-label={label("filter", "Field")} value={selectedGraphRule.field} onchange={(event) => updateGraphRule({ field: (event.currentTarget as HTMLSelectElement).value as PracticeFilterField })}>
                {#each fields as field}<option value={field.name}>{field.label}</option>{/each}
              </select>
              <select aria-label={label("conditionEqual", "Operator")} value={selectedGraphRule.filter ?? "equal"} onchange={(event) => updateGraphRule({ filter: (event.currentTarget as HTMLSelectElement).value as PracticeFilterOperator })}>
                {#each operators as operator}<option value={operator.name}>{operator.label}</option>{/each}
              </select>
              <select aria-label={label("selectConditionValue", "Value")} value={selectedGraphRule.value ?? "yes"} onchange={(event) => updateGraphRule({ value: (event.currentTarget as HTMLSelectElement).value as PracticeFilterValue })}>
                <option value="yes">{label("yes", "Yes")}</option>
                <option value="no">{label("no", "No")}</option>
              </select>
            </div>
          {/if}
        {:else}
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
            context={{
              renameGroupAt,
              groupNamePlaceholder: label("conditionGroupNamePlaceholder", "为这组条件命名"),
            }}
            controlElements={{
              actionElement: PracticeQueryBuilderAction,
              combinatorSelector: PracticeQueryBuilderValueSelector,
              fieldSelector: PracticeQueryBuilderValueSelector,
              operatorSelector: PracticeQueryBuilderValueSelector,
              ruleGroup: PracticeRuleGroup,
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
        {/if}
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
  /* The editor renders only its dialog; state lives in the launcher's chips. */
  .practice-condition-editor {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
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
    border-radius: 0;
  }

  .condition-dialog-header,
  .condition-dialog-footer {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
  }

  .condition-dialog-header {
    border-bottom: 1px solid var(--b3-border-color);
  }

  .condition-dialog-header strong {
    min-width: 0;
    overflow: hidden;
    font-size: 14px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .condition-library {
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 38%, transparent);
  }

  .condition-library-empty {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    line-height: 1.5;
  }

  /* Compact hosts (phones, narrow desktop docks): saved conditions switch via a
     Select instead of a growing chip pile. */
  .condition-library-compact {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .condition-switcher-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .condition-switcher-row :global([data-slot="select-trigger"]) {
    min-width: 0;
    flex: 1 1 auto;
    height: 30px;
  }

  .condition-switcher-row > :global(button:last-child) {
    flex: 0 0 auto;
    color: var(--b3-theme-on-surface);
  }

  .condition-switcher-row > :global(button:last-child:hover) {
    color: var(--b3-theme-error, #d23f31);
  }

  .condition-library-chips {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
  }

  .condition-library-chip {
    min-width: 0;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 1px 2px;
    border: 1px solid var(--b3-border-color);
    border-radius: 999px;
    background: var(--b3-theme-background);
  }

  .condition-library-chip.active {
    border-color: color-mix(in srgb, var(--b3-theme-primary) 52%, var(--b3-border-color));
    background: color-mix(in srgb, var(--b3-theme-primary) 8%, var(--b3-theme-background));
  }

  .condition-library-select {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--b3-theme-primary);
    cursor: pointer;
  }

  .condition-library-select:hover { background: var(--b3-list-hover); }

  .condition-library-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--b3-border-color);
  }

  .condition-library-chip.active .condition-library-dot { border-color: var(--b3-theme-primary); }

  .condition-library-chip input {
    min-width: 44px;
    max-width: 100%;
    width: auto;
    height: 24px;
    padding: 0 2px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
  }

  .condition-library-chip input:focus-visible {
    outline: 1px solid color-mix(in srgb, var(--b3-theme-primary) 45%, transparent);
  }

  .condition-library-delete {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--b3-theme-on-surface);
    cursor: pointer;
  }

  .condition-library-delete:hover {
    color: var(--b3-theme-error, #d23f31);
    background: var(--b3-list-hover);
  }

  .condition-library-save {
    min-width: 150px;
    flex: 1 1 180px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .condition-library-save :global(input) {
    min-width: 0;
    flex: 1 1 auto;
    height: 28px;
  }

  .condition-library-save :global(button) {
    flex: 0 0 auto;
    min-height: 28px;
  }

  .condition-dialog-body {
    min-height: 0;
    overflow: auto;
    padding: 10px 12px;
  }

  .condition-view-switcher {
    display: flex;
    gap: 4px;
    margin-bottom: 8px;
    padding: 3px;
    width: fit-content;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: var(--b3-theme-surface);
  }

  .condition-graph-inspector {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 7px;
    margin-top: 8px;
    padding: 8px 10px;
    border: 1px solid var(--b3-border-color);
    border-radius: 7px;
    background: var(--b3-theme-surface);
  }

  .condition-graph-inspector strong { margin-right: 3px; font-size: 12px; }
  .condition-graph-inspector select { min-width: 118px; height: 28px; padding: 0 7px; border: 1px solid var(--b3-border-color); border-radius: 5px; color: var(--b3-theme-on-background); background: var(--b3-theme-background); }


  .condition-dialog-footer {
    flex-wrap: wrap;
    border-top: 1px solid var(--b3-border-color);
    background: color-mix(in srgb, var(--b3-theme-surface) 55%, transparent);
  }

  .condition-dialog-footer-actions {
    display: flex;
    gap: 7px;
  }

  /* Query-builder visuals live in the shared src/styles/query-builder-theme.css,
     so every condition editor in the plugin renders identically. */

  @media (max-width: 640px) {
    .condition-dialog-body {
      padding: 8px 9px;
    }

    .condition-library {
      padding: 7px 9px;
    }
  }
</style>
