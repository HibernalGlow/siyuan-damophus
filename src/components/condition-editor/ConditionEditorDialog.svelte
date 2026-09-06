<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { Check, RotateCcw, X } from "lucide-svelte";
  import {
    QueryBuilder,
    type Field,
    type FullCombinator,
    type FullOperator,
    type RuleGroupTypeAny,
    type Translations,
  } from "svelte-querybuilder";
  import "svelte-querybuilder/dist/query-builder.css";
  import "@/styles/query-builder-theme.css";
  import { Button } from "@/components/ui/button";
  import ConditionEditorAction from "./ConditionEditorAction.svelte";
  import ConditionEditorRule from "./ConditionEditorRule.svelte";
  import ConditionEditorRuleGroup from "./ConditionEditorRuleGroup.svelte";
  import ConditionEditorShiftActions from "./ConditionEditorShiftActions.svelte";
  import ConditionEditorUndoRedo from "./ConditionEditorUndoRedo.svelte";
  import ConditionEditorValueSelector from "./ConditionEditorValueSelector.svelte";

  export let label: (key: string, fallback: string) => string;
  export let title: string;
  export let open = false;
  // Two-way bound with the owner's editing state; the owner converts and
  // persists the tree in onApply — this dialog only edits the builder model.
  export let query: RuleGroupTypeAny = { combinator: "and", rules: [] };
  export let fields: Field[] = [];
  export let operators: FullOperator[] = [];
  export let combinators: FullCombinator[] = [];
  export let translations: Partial<Translations> = {};
  export let context: Record<string, unknown> | undefined = undefined;
  export let defaultField: string | undefined = undefined;
  export let defaultOperator: string | ((field: string) => string) | undefined = undefined;
  export let defaultValue: ((rule: { field: string }) => unknown) | undefined = undefined;
  export let showNotToggle = false;
  export let showLockButtons = false;
  export let showCombinatorsBetweenRules = true;
  /** Emit multi-select values as arrays instead of comma-joined strings. */
  export let listsAsArrays = false;
  /** Optional saved-conditions section rendered between header and body. */
  export let library: Snippet | undefined = undefined;
  /** "host" docks into the nearest positioned ancestor (dock panels); "fixed" floats centered in the viewport. */
  export let dock: "host" | "fixed" = "fixed";
  export let clearLabel = "";
  export let onApply: (query: RuleGroupTypeAny) => void = () => {};
  export let onCancel: () => void = () => {};
  export let onClear: (() => void) | undefined = undefined;

  const titleId = `condition-dialog-title-${Math.random().toString(36).slice(2, 8)}`;

  let hostElement: HTMLElement;
  let dockCompact = false;
  let dockDialogStyle = "";
  function updateDockLayout(): void {
    if (dock !== "host" || !hostElement) return;
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
    // Anchored to the nearest positioned ancestor, so coordinates are offsets
    // within that root — not viewport coordinates (the root may sit beside
    // other dock panels).
    const anchor = (hostElement.closest(".question-bank") as HTMLElement | null) ?? document.documentElement;
    const anchorRect = anchor.getBoundingClientRect();
    const left = Math.round(rect.left - anchorRect.left);
    const top = Math.round(Math.max(0, rect.top - anchorRect.top));
    const anchorHeight = anchor === document.documentElement ? window.innerHeight : anchorRect.height;
    const maxHeight = Math.max(240, Math.round(anchorHeight - top));
    dockDialogStyle = `left: ${left}px; top: ${top}px; width: ${Math.round(rect.width)}px; max-height: ${maxHeight}px; transform: none;`;
  }

  onMount(() => {
    if (dock !== "host") return;
    const observer = new ResizeObserver(updateDockLayout);
    if (hostElement) observer.observe(hostElement);
    updateDockLayout();
    window.addEventListener("resize", updateDockLayout);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateDockLayout);
    };
  });

  // Only defined defaults reach the builder: undefined props must not override
  // the library's own fallbacks. Loosened for the same generic-keying reason
  // as controlElements below.
  $: builderDefaults = ({
    ...(defaultField !== undefined ? { getDefaultField: defaultField } : {}),
    ...(defaultOperator !== undefined ? { getDefaultOperator: defaultOperator } : {}),
    ...(defaultValue !== undefined ? { getDefaultValue: defaultValue } : {}),
  } as any);

  // The library keys these control types to its generic schema; one shared
  // dialog serves different schema families (practice filter, cover tree), so
  // the mapping is deliberately loosened.
  $: controlElements = {
    actionElement: ConditionEditorAction,
    addRuleAction: ConditionEditorAction,
    addGroupAction: ConditionEditorAction,
    combinatorSelector: ConditionEditorValueSelector,
    fieldSelector: ConditionEditorValueSelector,
    operatorSelector: ConditionEditorValueSelector,
    rule: ConditionEditorRule,
    ruleGroup: ConditionEditorRuleGroup,
    shiftActions: ConditionEditorShiftActions,
    undoRedoActions: ConditionEditorUndoRedo,
    valueSourceSelector: ConditionEditorValueSelector,
    valueSelector: ConditionEditorValueSelector,
  } as any;
</script>

<div bind:this={hostElement} class="condition-editor-root" class:condition-editor-docked={dock === "host"} class:condition-editor-compact={dockCompact}>
  {#if open}
    <div class="condition-dialog-scrim" onclick={onCancel} aria-hidden="true"></div>
    <div class="condition-dialog" style={dock === "host" ? dockDialogStyle : ""} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header class="condition-dialog-header">
        <strong id={titleId}>{title}</strong>
        <Button variant="ghost" size="icon" onclick={onCancel} aria-label={label("close", "Close")}>
          <X size={17} aria-hidden="true" />
        </Button>
      </header>

      {#if library}
        {@render library()}
      {/if}

      <div class="condition-dialog-body">
        <div class="query-builder-theme">
          <QueryBuilder
            {fields}
            {operators}
            {combinators}
            {translations}
            {context}
            bind:query
            maxLevels={4}
            resetOnFieldChange
            {showCombinatorsBetweenRules}
            {listsAsArrays}
            showCloneButtons
            showShiftActions
            showUndoRedo
            {showNotToggle}
            {showLockButtons}
            {...builderDefaults}
            {controlElements}
          />
        </div>
      </div>

      <footer class="condition-dialog-footer">
        {#if onClear}
          <Button variant="ghost" size="sm" class="condition-clear-button" onclick={onClear}>
            <RotateCcw size={14} aria-hidden="true" />
            <span>{clearLabel || label("clearConditions", "Clear conditions")}</span>
          </Button>
        {/if}
        <div class="condition-dialog-footer-actions">
          <Button variant="outline" size="sm" class="condition-cancel-button" onclick={onCancel}>{label("cancel", "Cancel")}</Button>
          <Button size="sm" class="condition-apply-button" onclick={() => onApply(query)}>
            <Check size={14} aria-hidden="true" />
            <span>{label("apply", "Apply")}</span>
          </Button>
        </div>
      </footer>
    </div>
  {/if}
</div>

<style>
  .condition-editor-root {
    min-width: 0;
  }

  /* Fixed mode (default): floats centered in the viewport — settings cards are
     not confined to a positioned panel. */
  .condition-editor-root:not(.condition-editor-docked) .condition-dialog-scrim {
    position: fixed;
    inset: 0;
    z-index: 9998;
    background: rgb(0 0 0 / 42%);
  }

  .condition-editor-root:not(.condition-editor-docked) .condition-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 9999;
    transform: translate(-50%, -50%);
  }

  /* Docked mode: scrim and dialog stay confined to the nearest positioned
     ancestor (the question-bank root), so the workspace's overflow never
     clips them and narrow docks get the compact layout. */
  .condition-editor-docked .condition-dialog-scrim {
    position: absolute;
    inset: 0;
    z-index: 9998;
    background: rgb(0 0 0 / 42%);
  }

  .condition-editor-docked .condition-dialog {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 9999;
    transform: translate(-50%, -50%);
  }

  .condition-editor-compact .condition-dialog {
    border-radius: 0;
  }

  .condition-dialog {
    display: flex;
    flex-direction: column;
    width: min(94vw, 760px);
    max-height: min(86vh, 700px);
    overflow: hidden;
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

  .condition-dialog-body {
    min-height: 0;
    overflow: auto;
    padding: 10px 12px;
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

  /* Footer buttons live inside the shadcn Button, so the polish needs :global. */
  :global(.condition-dialog-footer .condition-clear-button), :global(.condition-dialog-footer .condition-cancel-button) { border: 1px solid var(--b3-border-color) !important; color: var(--b3-theme-on-background) !important; background: var(--b3-theme-surface) !important; }
  :global(.condition-dialog-footer .condition-clear-button:hover), :global(.condition-dialog-footer .condition-cancel-button:hover) { background: var(--b3-list-hover) !important; }
  :global(.condition-dialog-footer .condition-apply-button) { border: 1px solid var(--b3-theme-primary) !important; color: var(--b3-theme-on-primary, #fff) !important; background: var(--b3-theme-primary) !important; }
  :global(.condition-dialog-footer .condition-apply-button:hover) { background: color-mix(in srgb, var(--b3-theme-primary) 84%, black) !important; }
  :global(.condition-dialog-footer button svg) { color: currentColor; }
  :global(.condition-dialog-footer button:focus-visible) { outline: 2px solid var(--b3-theme-primary); outline-offset: 1px; }

  @media (max-width: 640px) {
    .condition-dialog-body {
      padding: 8px 9px;
    }
  }
</style>
