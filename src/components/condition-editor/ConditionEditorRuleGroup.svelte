<!--
  Thin wrapper around the library's default RuleGroup (not a rewrite): it adds
  a per-group name tag floating on the group's top border like a fieldset
  legend, so naming a group costs no vertical space. Unnamed groups show a
  tiny ghost tag button that grows into the input when tapped. Nested groups
  keep rendering through the builder's controlElements, so this wrapper
  applies at every depth. The rename callback arrives via `context`.
-->
<script lang="ts">
  import { Tag } from "lucide-svelte";
  import { RuleGroup, type RuleGroupProps } from "svelte-querybuilder";

  const props: RuleGroupProps = $props();

  interface PracticeGroupContext {
    renameGroupAt?: (path: readonly number[], name: string) => void;
    groupNamePlaceholder?: string;
  }

  const groupContext = $derived((props.context ?? {}) as PracticeGroupContext);
  const groupName = $derived((props.ruleGroup as { name?: string }).name ?? "");

  let naming = $state(false);

  /** Input size units so the tag hugs its content: CJK glyphs count double. */
  const nameSize = $derived.by(() => {
    let units = 0;
    for (const character of groupName) units += (character.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
    return Math.min(26, Math.max(4, units + 1));
  });

  // Focus only when the ghost tag opens the input, never on initial render of
  // already-named groups (an autofocus would steal focus from the dialog and
  // pop up the mobile keyboard).
  const focusWhen = (node: HTMLInputElement, active: boolean) => {
    const apply = (value: boolean): void => {
      if (value) node.focus();
    };
    apply(active);
    return { update: apply };
  };
</script>

<div class="condition-editor-rule-group" class:named={Boolean(groupName) || naming} data-level={props.path.length}>
  {#if groupName || naming}
    <input
      class="rule-group-name"
      value={groupName}
      size={nameSize}
      placeholder={groupContext.groupNamePlaceholder ?? "Name this group"}
      aria-label={groupContext.groupNamePlaceholder ?? "Name this group"}
      use:focusWhen={naming}
      oninput={(event) => groupContext.renameGroupAt?.(props.path, (event.currentTarget as HTMLInputElement).value)}
      onblur={() => { naming = false; }}
      onkeydown={(event) => { if (event.key === "Escape") event.currentTarget.blur(); }}
    />
  {:else}
    <button
      type="button"
      class="rule-group-name-add"
      title={groupContext.groupNamePlaceholder ?? "Name this group"}
      aria-label={groupContext.groupNamePlaceholder ?? "Name this group"}
      onclick={() => { naming = true; }}
    >
      <Tag size={10} aria-hidden="true" />
    </button>
  {/if}
  <RuleGroup {...props} />
</div>

<style>
  .condition-editor-rule-group {
    position: relative;
    min-width: 0;
  }
</style>
