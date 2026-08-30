<script lang="ts">
  import { Redo2, Undo2 } from "lucide-svelte";
  import type { UndoRedoActionsProps } from "svelte-querybuilder";

  export let className: UndoRedoActionsProps["className"] = undefined;
  export let classNames: UndoRedoActionsProps["classNames"] = undefined;
  export let disabled = false;
  export let labels: UndoRedoActionsProps["labels"] = undefined;
  export let titles: UndoRedoActionsProps["titles"] = undefined;
  export let testID: UndoRedoActionsProps["testID"] = undefined;
  export let ruleOrGroup: UndoRedoActionsProps["ruleOrGroup"];
  export let schema: UndoRedoActionsProps["schema"];

  $: canUndo = schema.manager.canUndo();
  $: canRedo = schema.manager.canRedo();
</script>

<div data-testid={testID} class={className} data-label={labels} data-has-rule={!!ruleOrGroup}>
  <button type="button" class={classNames?.undo} title={titles?.undo} aria-label={titles?.undo} disabled={disabled || !canUndo} onclick={() => schema.manager.undo()}>
    <Undo2 size={15} aria-hidden="true" />
  </button>
  <button type="button" class={classNames?.redo} title={titles?.redo} aria-label={titles?.redo} disabled={disabled || !canRedo} onclick={() => schema.manager.redo()}>
    <Redo2 size={15} aria-hidden="true" />
  </button>
</div>
