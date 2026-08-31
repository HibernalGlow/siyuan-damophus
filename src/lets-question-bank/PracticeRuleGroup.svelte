<!--
  Thin wrapper around the library's default RuleGroup (not a rewrite): it only
  prepends a per-group name input so renaming happens at the group itself.
  Nested groups keep rendering through the builder's controlElements, so this
  wrapper applies at every depth. The rename callback arrives via `context`.
-->
<script lang="ts">
  import { RuleGroup, type RuleGroupProps } from "svelte-querybuilder";

  const props: RuleGroupProps = $props();

  interface PracticeGroupContext {
    renameGroupAt?: (path: readonly number[], name: string) => void;
    groupNamePlaceholder?: string;
  }

  const groupContext = $derived((props.context ?? {}) as PracticeGroupContext);
  const groupName = $derived((props.ruleGroup as { name?: string }).name ?? "");
</script>

<div class="practice-rule-group" data-level={props.path.length}>
  <input
    class="rule-group-name"
    value={groupName}
    placeholder={groupContext.groupNamePlaceholder ?? "Name this group"}
    aria-label={groupContext.groupNamePlaceholder ?? "Name this group"}
    oninput={(event) => groupContext.renameGroupAt?.(props.path, (event.currentTarget as HTMLInputElement).value)}
  />
  <RuleGroup {...props} />
</div>
