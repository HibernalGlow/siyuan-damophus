<script lang="ts">
  import { onMount } from "svelte";
  import { BookMarked, Check, ChevronRight, FolderOutput, ListFilter, Lock, Save, Trash2 } from "lucide-svelte";
  import { Input } from "@/components/ui/input";
  import * as Select from "@/components/ui/select";
  import * as Collapsible from "@/components/ui/collapsible";
  import { Button } from "@/components/ui/button";
  import ConditionEditorDialog from "@/components/condition-editor/ConditionEditorDialog.svelte";
  import { renameGroupInQuery } from "@/components/condition-editor/rename-group";
  import type { PracticeFilterPreset, PracticeReferenceTemplate } from "./practice-preferences";
  import { PRACTICE_REFERENCE_TEMPLATES } from "./practice-preferences";
  import type { PracticeFilter, PracticeFilterField } from "@/question-bank/core/scope";
  import {
    practiceFilterToQuery,
    queryToPracticeFilter,
    type PracticeQueryGroup,
  } from "./practice-querybuilder-adapter";
  import {
    buildFields,
    buildOperators,
    buildCombinators,
    buildTranslations,
    defaultRuleValue,
  } from "./practice-condition-catalog";

  export let label: (key: string, fallback: string) => string;
  export let filter: PracticeFilter = "all";
  export let presets: PracticeFilterPreset[] = [];
  export let activePresetId: string | undefined = undefined;
  export let referencePresets: PracticeFilterPreset[] = [];

  let sourceFilter: PracticeFilter = filter;
  let editorQuery: PracticeQueryGroup = practiceFilterToQuery(filter);
  let dialogOpen = false;
  let newConditionName = "";
  // Set while the switcher pre-filled the name input: saving then updates that
  // condition (rename + filter) instead of creating a copy.
  let nameUpdateTarget: string | undefined = undefined;

  let hostElement: HTMLElement;
  // Mirrors the shared dialog's compact threshold: the saved-condition library
  // switches to a Select when the host is phone-like or a narrow dock.
  let hostCompact = false;
  function updateHostLayout(): void {
    if (!hostElement) return;
    hostCompact = hostElement.getBoundingClientRect().width < 700;
  }

  onMount(() => {
    const observer = new ResizeObserver(updateHostLayout);
    if (hostElement) observer.observe(hostElement);
    updateHostLayout();
    window.addEventListener("resize", updateHostLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHostLayout);
    };
  });

  $: fields = buildFields(label);

  $: operators = buildOperators(label);

  $: combinators = buildCombinators(label);

  $: translations = buildTranslations(label);

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
    editorQuery = renameGroupInQuery(editorQuery, path, name);
  }

  // ---- Reference presets (staged templates, never rendered as launcher chips) ----

  let referencesOpen = false;

  interface ReferenceEntry {
    id: string;
    name: string;
    filter: PracticeFilter;
    builtin: boolean;
  }

  let referenceEntries: ReferenceEntry[] = [];
  $: referenceEntries = [
    ...PRACTICE_REFERENCE_TEMPLATES.map((template: PracticeReferenceTemplate) => ({
      id: template.id,
      name: label(template.nameKey, template.nameFallback),
      filter: template.filter,
      builtin: true,
    })),
    ...referencePresets.map((preset) => ({ id: preset.id, name: preset.name, filter: preset.filter, builtin: false })),
  ];

  /** Loads a reference into the editor; the name input pre-fills so saving overwrites a same-named preset or creates a new one. */
  function loadReference(entry: ReferenceEntry): void {
    editorQuery = practiceFilterToQuery(entry.filter);
    newConditionName = entry.name;
    nameUpdateTarget = undefined;
  }

  function promotePresetToReference(id: string): void {
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    presets = presets.filter((candidate) => candidate.id !== id);
    referencePresets = [...referencePresets, preset];
    if (activePresetId === id) activePresetId = undefined;
    if (nameUpdateTarget === id) nameUpdateTarget = undefined;
  }

  function demoteReferenceToPreset(id: string): void {
    const reference = referencePresets.find((candidate) => candidate.id === id);
    if (!reference) return;
    referencePresets = referencePresets.filter((candidate) => candidate.id !== id);
    presets = [...presets, reference];
  }

  function deleteReference(id: string): void {
    referencePresets = referencePresets.filter((candidate) => candidate.id !== id);
  }

  /** Saves the editor state into the reference library; a same-named reference is updated in place. */
  function saveReference(): void {
    const name = newConditionName.trim();
    if (!name) return;
    const nextFilter = queryToPracticeFilter(editorQuery);
    const existing = referencePresets.find((candidate) => candidate.name === name);
    if (existing) {
      referencePresets = referencePresets.map((candidate) => (candidate.id === existing.id ? { ...candidate, filter: nextFilter } : candidate));
    } else {
      const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `reference-${Date.now()}`;
      referencePresets = [...referencePresets, { id, name, filter: nextFilter }];
    }
    newConditionName = "";
    nameUpdateTarget = undefined;
  }

  const bypassLabels = {
    ignore: label("bypassCondition", "忽略此条件"),
    restore: label("restoreCondition", "恢复此条件"),
  };

  $: activePresetName = presets.find((preset) => preset.id === activePresetId)?.name;
</script>

<div bind:this={hostElement} class="practice-condition-editor" data-testid="practice-condition-editor">
  {#if dialogOpen}
    <ConditionEditorDialog
      {label}
      title={label("conditionDialogTitle", "Edit question conditions")}
      open={dialogOpen}
      bind:query={editorQuery}
      {fields}
      {operators}
      {combinators}
      {translations}
      context={{
        renameGroupAt,
        groupNamePlaceholder: label("conditionGroupNamePlaceholder", "为这组条件命名"),
        bypassLabels,
      }}
      defaultField="attempted"
      defaultOperator="equal"
      defaultValue={(rule) => defaultRuleValue(rule.field as PracticeFilterField)}
      listsAsArrays
      showNotToggle
      showLockButtons
      showCombinatorsBetweenRules={false}
      dock="host"
      clearLabel={label("clearConditions", "Clear conditions")}
      onApply={applyEditor}
      onCancel={cancelEditor}
      onClear={clearFilter}
    >
      {#snippet library()}
        <div class="condition-library" data-testid="condition-library">
          {#if presets.length === 0}
            <p class="condition-library-empty">{label("filterConditionsEmpty", "还没有保存的条件：先编辑规则，命名保存后即可一键复用。")}</p>
          {/if}
          {#if hostCompact}
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
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="filter-condition-save-reference"
                  disabled={!newConditionName.trim()}
                  title={label("saveAsReference", "存为参考（不占条件位）")}
                  aria-label={label("saveAsReference", "存为参考（不占条件位）")}
                  onclick={saveReference}
                >
                  <BookMarked size={13} aria-hidden="true" />
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
                    title={label("presetToReference", "转为参考（从条件位收起）")}
                    aria-label={`${label("presetToReference", "转为参考（从条件位收起）")} ${preset.name}`}
                    onclick={() => promotePresetToReference(preset.id)}
                  ><BookMarked size={12} aria-hidden="true" /></button>
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
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="filter-condition-save-reference"
                  disabled={!newConditionName.trim()}
                  title={label("saveAsReference", "存为参考（不占条件位）")}
                  aria-label={label("saveAsReference", "存为参考（不占条件位）")}
                  onclick={saveReference}
                >
                  <BookMarked size={13} aria-hidden="true" />
                </Button>
              </span>
            </div>
          {/if}
          <Collapsible.Root bind:open={referencesOpen} class="condition-references">
            <Collapsible.Trigger
              class="condition-references-toggle"
              data-testid="condition-references-toggle"
              title={label("conditionReferencesHint", "参考条件只做草稿底子：载入后改名保存即可变成自己的条件")}
            >
              <ChevronRight size={12} aria-hidden="true" class="condition-references-chevron {referencesOpen ? 'open' : ''}" />
              <span>{label("conditionReferences", "参考条件")}</span>
              <span class="condition-references-count" data-testid="condition-references-count">{referenceEntries.length}</span>
            </Collapsible.Trigger>
            <Collapsible.Content>
              <div class="condition-references-content" data-testid="condition-references">
                {#each referenceEntries as entry (entry.id)}
                  <span class="condition-library-chip condition-reference-chip" data-testid="condition-reference-row">
                    <button
                      type="button"
                      class="condition-library-select"
                      title={label("loadReference", "载入到编辑器")}
                      aria-label={`${label("loadReference", "载入到编辑器")} ${entry.name}`}
                      onclick={() => loadReference(entry)}
                    >
                      <ListFilter size={12} aria-hidden="true" />
                    </button>
                    <span class="condition-reference-name">{entry.name}</span>
                    {#if entry.builtin}
                      <span class="condition-reference-lock" title={label("builtinReference", "内置参考")}><Lock size={11} aria-hidden="true" /></span>
                    {:else}
                      <button
                        type="button"
                        class="condition-library-delete"
                        title={label("referenceToPreset", "转回条件位")}
                        aria-label={`${label("referenceToPreset", "转回条件位")} ${entry.name}`}
                        onclick={() => demoteReferenceToPreset(entry.id)}
                      ><FolderOutput size={12} aria-hidden="true" /></button>
                      <button
                        type="button"
                        class="condition-library-delete"
                        title={label("deleteFilterPreset", "删除筛选预设")}
                        aria-label={`${label("deleteFilterPreset", "删除筛选预设")} ${entry.name}`}
                        onclick={() => deleteReference(entry.id)}
                      ><Trash2 size={12} aria-hidden="true" /></button>
                    {/if}
                  </span>
                {:else}
                  <p class="condition-references-empty">{label("conditionReferencesEmpty", "还没有参考条件：保存时选「存为参考」，或把常用条件转为参考收起。")}</p>
                {/each}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        </div>
      {/snippet}
    </ConditionEditorDialog>
  {/if}
</div>

<style>
  /* The editor renders only its launcher-adjacent shell; the dialog itself lives
     in the shared ConditionEditorDialog. */
  .practice-condition-editor {
    min-width: 0;
    padding: 0;
    border: 0;
    background: transparent;
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

  /* Reference presets: a collapsed staging row inside the editor library —
     never rendered among the launcher's condition chips. The Root/Trigger
     classes land on bits-ui elements, so they need :global under the scoped
     library ancestor. */
  .condition-library :global(.condition-references) {
    min-width: 0;
  }

  .condition-library :global(.condition-references-toggle) {
    width: 100%;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    border: 0;
    background: transparent;
    color: var(--b3-theme-on-surface);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .condition-library :global(.condition-references-toggle:hover) { color: var(--b3-theme-primary); }

  .condition-library :global(.condition-references-chevron) {
    flex: 0 0 auto;
    transition: transform 120ms ease;
  }

  .condition-library :global(.condition-references-chevron.open) { transform: rotate(90deg); }

  .condition-references-count {
    min-width: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--b3-theme-primary) 10%, transparent);
    color: var(--b3-theme-primary);
    font-size: 10px;
    line-height: 14px;
    text-align: center;
  }

  .condition-references-content {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    padding: 5px 0 2px;
  }

  .condition-reference-chip .condition-reference-name {
    min-width: 0;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--b3-theme-on-surface);
    font-size: 12px;
  }

  .condition-reference-lock {
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--b3-theme-on-surface);
    opacity: 0.6;
  }

  .condition-references-empty {
    margin: 0;
    color: var(--b3-theme-on-surface);
    font-size: 11px;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .condition-library {
      padding: 7px 9px;
    }
  }
</style>
