<!--
  Thin wrapper around the library's default Rule: adds a bypass toggle at the
  row start. A bypassed rule stays fully editable but drops out of evaluation
  (the persisted flag is `bypassed`, independent of the builder's lock). The
  toggle targets the node via `context.toggleBypassAt`, mirroring how the group
  name tag arrives through `context`.
-->
<script lang="ts">
  import { EyeOff } from "lucide-svelte";
  import { Rule, type RuleProps } from "svelte-querybuilder";

  const props: RuleProps = $props();

  interface EditorContext {
    bypassLabels?: { ignore: string; restore: string };
  }

  const editorContext = $derived((props.context ?? {}) as EditorContext);
  const bypassed = $derived((props.rule as { bypassed?: boolean }).bypassed === true);

  // Route the flag through the builder's own mutation channel (like lock does):
  // the builder's internal query state is the source of truth, and it syncs
  // back into the persisted tree via bind:query.
  function toggleBypass(): void {
    (props.actions as unknown as { onPropChange: (prop: string, value: unknown, path: readonly number[]) => void })
      .onPropChange("bypassed", !bypassed, props.path);
  }
</script>

<div class="condition-editor-rule" data-bypassed={bypassed}>
  <button
    type="button"
    class="rule-bypass-toggle"
    data-bypassed={bypassed}
    title={bypassed ? (editorContext.bypassLabels?.restore ?? "Restore") : (editorContext.bypassLabels?.ignore ?? "Ignore")}
    aria-label={bypassed ? (editorContext.bypassLabels?.restore ?? "Restore") : (editorContext.bypassLabels?.ignore ?? "Ignore")}
    aria-pressed={bypassed}
    onclick={toggleBypass}
  >
    <EyeOff size={13} aria-hidden="true" />
  </button>
  <Rule {...props} />
</div>
